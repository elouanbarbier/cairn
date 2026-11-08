import {
  type Activity,
  type ActivityAction,
  buildOverview,
  type ChecklistItem,
  type CreateChecklistItemInput,
  type CreateNoteInput,
  type CreateTopicInput,
  computeProgress,
  DEFAULT_DORMANCY_DAYS,
  formatTopicRef,
  isClosed,
  type Label,
  type Me,
  type Overview,
  type ProjectSummary,
  parseTopicRef,
  type SearchResult,
  type SubprojectSummary,
  sortKeyBetween,
  type TopicDetail,
  type TopicNote,
  type TopicStatus,
  type TopicSummary,
  type UpdateChecklistItemInput,
  type UpdateTopicInput,
  type User,
} from '@cairn/shared';
import { and, asc, desc, eq, inArray, isNull, max, min, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Db } from './db/index.ts';
import * as schema from './db/schema.ts';

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

const { activity, checklistItems, labels, projects, subprojects, topicLabels, topicNotes, topics, users } = schema;

const iso = (date: Date) => date.toISOString();

const SEARCH_STATUS_RANK: Record<TopicStatus, number> = {
  in_progress: 0,
  waiting: 1,
  todo: 2,
  backlog: 3,
  done: 6,
  cancelled: 7,
};
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

/** Splits large `IN (...)` lists to stay under SQLite's variable limit. */
function chunk<T>(items: readonly T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Lowercase, accent-free text for matching. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

type UserRow = typeof users.$inferSelect;
const toUser = (row: Pick<UserRow, 'id' | 'name' | 'email' | 'role'>): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

export interface RepoOptions {
  /** Clock, injectable for tests. */
  now?: () => Date;
}

export function createRepo(db: Db, options: RepoOptions = {}) {
  const now = options.now ?? (() => new Date());

  /* ---------- Users & settings ---------- */

  /** Until authentication lands (J4), the first admin is the current user. */
  function currentUser(): User {
    const row =
      db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).get() ??
      db.select().from(users).orderBy(asc(users.createdAt)).get();
    if (!row) throw new NotFoundError('No user exists yet');
    return toUser(row);
  }

  function listUsers(): User[] {
    return db.select().from(users).orderBy(asc(users.name)).all().map(toUser);
  }

  function dormancyDays(): number {
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'dormancy_days')).get();
    return typeof row?.value === 'number' ? row.value : DEFAULT_DORMANCY_DAYS;
  }

  function listLabels(): Label[] {
    return db.select().from(labels).orderBy(asc(labels.name)).all();
  }

  /* ---------- Topics: reading ---------- */

  function selectTopics(where?: SQL) {
    return db
      .select({
        topic: topics,
        projectKey: projects.key,
        projectName: projects.name,
        projectColor: projects.color,
        subprojectName: subprojects.name,
        assigneeId: users.id,
        assigneeName: users.name,
        assigneeEmail: users.email,
        assigneeRole: users.role,
      })
      .from(topics)
      .innerJoin(projects, eq(topics.projectId, projects.id))
      .leftJoin(subprojects, eq(topics.subprojectId, subprojects.id))
      .leftJoin(users, eq(topics.assigneeId, users.id))
      .where(where)
      .orderBy(asc(topics.sortOrder))
      .all();
  }

  type TopicRow = ReturnType<typeof selectTopics>[number];

  /** Adds labels, checklist counts and waiting dates to raw topic rows. */
  function hydrate(rows: TopicRow[]): TopicSummary[] {
    const ids = rows.map((r) => r.topic.id);
    const labelsByTopic = new Map<string, Label[]>();
    const checklistByTopic = new Map<string, { done: number; total: number }>();
    const waitingSince = new Map<string, string>();

    for (const part of chunk(ids)) {
      for (const row of db
        .select({ topicId: topicLabels.topicId, id: labels.id, name: labels.name, color: labels.color })
        .from(topicLabels)
        .innerJoin(labels, eq(topicLabels.labelId, labels.id))
        .where(inArray(topicLabels.topicId, part))
        .orderBy(asc(labels.name))
        .all()) {
        const list = labelsByTopic.get(row.topicId) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
        labelsByTopic.set(row.topicId, list);
      }

      for (const row of db
        .select({
          topicId: checklistItems.topicId,
          total: sql<number>`count(*)`,
          done: sql<number>`coalesce(sum(${checklistItems.done}), 0)`,
        })
        .from(checklistItems)
        .where(inArray(checklistItems.topicId, part))
        .groupBy(checklistItems.topicId)
        .all()) {
        checklistByTopic.set(row.topicId, { done: Number(row.done), total: Number(row.total) });
      }
    }

    const waitingIds = rows.filter((r) => r.topic.status === 'waiting').map((r) => r.topic.id);
    for (const part of chunk(waitingIds)) {
      for (const row of db
        .select({ topicId: activity.entityId, at: max(activity.createdAt) })
        .from(activity)
        .where(
          and(
            eq(activity.entityType, 'topic'),
            eq(activity.action, 'status_changed'),
            sql`json_extract(${activity.payload}, '$.to') = 'waiting'`,
            inArray(activity.entityId, part),
          ),
        )
        .groupBy(activity.entityId)
        .all()) {
        if (row.at) waitingSince.set(row.topicId, iso(row.at));
      }
    }

    return rows.map(({ topic, ...joined }) => ({
      id: topic.id,
      ref: formatTopicRef(joined.projectKey, topic.number),
      number: topic.number,
      projectId: topic.projectId,
      projectKey: joined.projectKey,
      projectName: joined.projectName,
      projectColor: joined.projectColor,
      subprojectId: topic.subprojectId,
      subprojectName: joined.subprojectName,
      title: topic.title,
      status: topic.status,
      priority: topic.priority,
      dueDate: topic.dueDate,
      assignee:
        joined.assigneeId && joined.assigneeName && joined.assigneeEmail && joined.assigneeRole
          ? { id: joined.assigneeId, name: joined.assigneeName, email: joined.assigneeEmail, role: joined.assigneeRole }
          : null,
      labels: labelsByTopic.get(topic.id) ?? [],
      checklist: checklistByTopic.get(topic.id) ?? { done: 0, total: 0 },
      sortOrder: topic.sortOrder,
      createdAt: iso(topic.createdAt),
      lastActivityAt: iso(topic.lastActivityAt),
      completedAt: isoOrNull(topic.completedAt),
      waitingSince: topic.status === 'waiting' ? (waitingSince.get(topic.id) ?? iso(topic.lastActivityAt)) : null,
    }));
  }

  function listTopics(filter: { projectId?: string; subprojectId?: string; assigneeId?: string } = {}): TopicSummary[] {
    const conditions: SQL[] = [isNull(projects.archivedAt)];
    if (filter.projectId) conditions.push(eq(topics.projectId, filter.projectId));
    if (filter.subprojectId) conditions.push(eq(topics.subprojectId, filter.subprojectId));
    if (filter.assigneeId) conditions.push(eq(topics.assigneeId, filter.assigneeId));
    return hydrate(selectTopics(and(...conditions)));
  }

  function findTopicRow(refOrId: string) {
    const parsed = parseTopicRef(refOrId);
    const where = parsed
      ? and(eq(projects.key, parsed.projectKey), eq(topics.number, parsed.number))
      : eq(topics.id, refOrId);
    const row = selectTopics(where)[0];
    if (!row) throw new NotFoundError(`Topic ${refOrId} not found`);
    return row;
  }

  function getTopic(refOrId: string): TopicDetail {
    const row = findTopicRow(refOrId);
    const [summary] = hydrate([row]);
    if (!summary) throw new NotFoundError(`Topic ${refOrId} not found`);
    const topicId = row.topic.id;

    const items: ChecklistItem[] = db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.topicId, topicId))
      .orderBy(asc(checklistItems.sortOrder))
      .all();

    const notes: TopicNote[] = db
      .select({ note: topicNotes, author: users })
      .from(topicNotes)
      .leftJoin(users, eq(topicNotes.authorId, users.id))
      .where(eq(topicNotes.topicId, topicId))
      .orderBy(asc(topicNotes.createdAt))
      .all()
      .map(({ note, author }) => ({
        id: note.id,
        topicId: note.topicId,
        author: author ? toUser(author) : null,
        body: note.body,
        createdAt: iso(note.createdAt),
        updatedAt: iso(note.updatedAt),
      }));

    const history: Activity[] = db
      .select({ entry: activity, actor: users })
      .from(activity)
      .leftJoin(users, eq(activity.actorId, users.id))
      .where(and(eq(activity.entityType, 'topic'), eq(activity.entityId, topicId)))
      .orderBy(desc(activity.createdAt))
      .all()
      .map(({ entry, actor }) => ({
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor: actor ? toUser(actor) : null,
        action: entry.action as ActivityAction,
        payload: entry.payload,
        createdAt: iso(entry.createdAt),
      }));

    return {
      ...summary,
      description: row.topic.description,
      updatedAt: iso(row.topic.updatedAt),
      checklistItems: items,
      notes,
      activity: history,
    };
  }

  /* ---------- Projects ---------- */

  function listProjects(options: { includeArchived?: boolean } = {}): ProjectSummary[] {
    const projectRows = db
      .select()
      .from(projects)
      .where(options.includeArchived ? undefined : isNull(projects.archivedAt))
      .orderBy(asc(projects.sortOrder))
      .all();
    const subprojectRows = db
      .select()
      .from(subprojects)
      .where(isNull(subprojects.archivedAt))
      .orderBy(asc(subprojects.sortOrder))
      .all();
    const counts = db
      .select({
        projectId: topics.projectId,
        subprojectId: topics.subprojectId,
        status: topics.status,
        count: sql<number>`count(*)`,
      })
      .from(topics)
      .groupBy(topics.projectId, topics.subprojectId, topics.status)
      .all();

    const statusesFor = (match: (c: (typeof counts)[number]) => boolean): TopicStatus[] =>
      counts.filter(match).flatMap((c) => Array<TopicStatus>(Number(c.count)).fill(c.status));

    return projectRows.map((p) => {
      const projectStatuses = statusesFor((c) => c.projectId === p.id);
      const subs: SubprojectSummary[] = subprojectRows
        .filter((s) => s.projectId === p.id)
        .map((s) => {
          const statuses = statusesFor((c) => c.subprojectId === s.id);
          return {
            id: s.id,
            projectId: s.projectId,
            name: s.name,
            description: s.description,
            status: s.status,
            targetDate: s.targetDate,
            sortOrder: s.sortOrder,
            openCount: statuses.filter((st) => !isClosed(st)).length,
            progress: computeProgress(statuses),
          };
        });
      return {
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        color: p.color,
        icon: p.icon,
        status: p.status,
        startDate: p.startDate,
        targetDate: p.targetDate,
        sortOrder: p.sortOrder,
        openCount: projectStatuses.filter((st) => !isClosed(st)).length,
        progress: computeProgress(projectStatuses),
        subprojects: subs,
      };
    });
  }

  function getProject(key: string): ProjectSummary {
    const project = listProjects({ includeArchived: true }).find((p) => p.key === key.toUpperCase());
    if (!project) throw new NotFoundError(`Project ${key} not found`);
    return project;
  }

  function listProjectActivity(
    key: string,
    limit = 50,
  ): Array<Activity & { topicRef: string | null; topicTitle: string | null }> {
    const project = getProject(key);
    return db
      .select({ entry: activity, actor: users, topicNumber: topics.number, topicTitle: topics.title })
      .from(activity)
      .innerJoin(topics, and(eq(activity.entityType, 'topic'), eq(activity.entityId, topics.id)))
      .leftJoin(users, eq(activity.actorId, users.id))
      .where(eq(topics.projectId, project.id))
      .orderBy(desc(activity.createdAt))
      .limit(limit)
      .all()
      .map(({ entry, actor, topicNumber, topicTitle }) => ({
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor: actor ? toUser(actor) : null,
        action: entry.action as ActivityAction,
        payload: entry.payload,
        createdAt: iso(entry.createdAt),
        topicRef: formatTopicRef(project.key, topicNumber),
        topicTitle,
      }));
  }

  /* ---------- Overview, search, me ---------- */

  function overview(today?: string): Overview {
    const active = listProjects().filter((p) => p.status === 'active');
    const activeIds = new Set(active.map((p) => p.id));
    const allTopics = listTopics().filter((t) => activeIds.has(t.projectId));
    return buildOverview({ topics: allTopics, projects: active, now: now(), today, dormancyDays: dormancyDays() });
  }

  function search(query: string, limit = 20): SearchResult {
    const q = normalize(query.trim());
    if (!q) return { topics: [], subprojects: [] };
    const candidates = db
      .select({ id: topics.id, title: topics.title, number: topics.number, key: projects.key, status: topics.status })
      .from(topics)
      .innerJoin(projects, eq(topics.projectId, projects.id))
      .where(isNull(projects.archivedAt))
      .all()
      .map((t) => {
        const ref = normalize(formatTopicRef(t.key, t.number));
        const title = normalize(t.title);
        const match = ref === q ? 0 : ref.startsWith(q) ? 1 : title.startsWith(q) ? 2 : title.includes(q) ? 3 : -1;
        // Better matches first; among equal matches, what moves before what is closed.
        return { ...t, score: match === -1 ? -1 : match * 10 + SEARCH_STATUS_RANK[t.status] };
      })
      .filter((t) => t.score >= 0)
      .sort((a, b) => a.score - b.score || b.number - a.number)
      .slice(0, limit);

    const ids = candidates.map((c) => c.id);
    const order = new Map(ids.map((id, i) => [id, i]));
    const topicResults =
      ids.length === 0
        ? []
        : hydrate(selectTopics(inArray(topics.id, ids))).sort(
            (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
          );

    const subprojectResults = listProjects().flatMap((p) =>
      p.subprojects
        .filter((s) => normalize(s.name).includes(q))
        .map((s) => ({ ...s, projectKey: p.key, projectName: p.name, projectColor: p.color })),
    );

    return { topics: topicResults, subprojects: subprojectResults.slice(0, 5) };
  }

  function me(): Me {
    const user = currentUser();
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(topics)
      .innerJoin(projects, eq(topics.projectId, projects.id))
      .where(
        and(
          eq(topics.assigneeId, user.id),
          inArray(topics.status, ['todo', 'in_progress', 'waiting']),
          isNull(projects.archivedAt),
        ),
      )
      .get();
    return { user, myOpenTopicCount: Number(row?.count ?? 0), dormancyDays: dormancyDays() };
  }

  /* ---------- Topics: writing ---------- */

  function logActivity(
    entityId: string,
    action: ActivityAction,
    payload: Record<string, unknown>,
    actorId: string | null,
    at: Date,
  ) {
    db.insert(activity)
      .values({ id: ulid(at.getTime()), entityType: 'topic', entityId, actorId, action, payload, createdAt: at })
      .run();
  }

  function touch(topicId: string, at: Date) {
    db.update(topics).set({ updatedAt: at, lastActivityAt: at }).where(eq(topics.id, topicId)).run();
  }

  function createTopic(input: CreateTopicInput, actorId: string | null = currentUser().id): TopicDetail {
    const at = now();
    const id = db.transaction((tx) => {
      const project = tx.select().from(projects).where(eq(projects.id, input.projectId)).get();
      if (!project) throw new NotFoundError('Project not found');
      if (input.subprojectId) {
        const sub = tx.select().from(subprojects).where(eq(subprojects.id, input.subprojectId)).get();
        if (!sub || sub.projectId !== project.id) throw new ValidationError('Subproject does not belong to project');
      }
      const last = tx
        .select({ number: max(topics.number), first: min(topics.sortOrder) })
        .from(topics)
        .where(eq(topics.projectId, project.id))
        .get();
      const status = input.status ?? 'todo';
      const topicId = ulid(at.getTime());
      tx.insert(topics)
        .values({
          id: topicId,
          projectId: project.id,
          subprojectId: input.subprojectId ?? null,
          number: (last?.number ?? 0) + 1,
          title: input.title,
          description: input.description ?? '',
          status,
          priority: input.priority ?? 'none',
          dueDate: input.dueDate ?? null,
          assigneeId: input.assigneeId === undefined ? actorId : input.assigneeId,
          sortOrder: sortKeyBetween(null, last?.first ?? null),
          createdAt: at,
          updatedAt: at,
          lastActivityAt: at,
          completedAt: isClosed(status) ? at : null,
        })
        .run();
      logActivity(topicId, 'created', {}, actorId, at);
      return topicId;
    });
    return getTopic(id);
  }

  function updateTopic(
    refOrId: string,
    input: UpdateTopicInput,
    actorId: string | null = currentUser().id,
  ): TopicDetail {
    const row = findTopicRow(refOrId);
    const current = row.topic;
    const at = now();

    db.transaction((tx) => {
      const patch: Partial<typeof topics.$inferInsert> = {};
      const changes: Array<[ActivityAction, Record<string, unknown>]> = [];

      if (input.title !== undefined && input.title !== current.title) {
        patch.title = input.title;
        changes.push(['title_changed', { from: current.title, to: input.title }]);
      }
      if (input.description !== undefined && input.description !== current.description) {
        patch.description = input.description;
        changes.push(['description_changed', {}]);
      }
      if (input.status !== undefined && input.status !== current.status) {
        patch.status = input.status;
        if (isClosed(input.status) && !isClosed(current.status)) patch.completedAt = at;
        if (!isClosed(input.status)) patch.completedAt = null;
        changes.push(['status_changed', { from: current.status, to: input.status }]);
      }
      if (input.priority !== undefined && input.priority !== current.priority) {
        patch.priority = input.priority;
        changes.push(['priority_changed', { from: current.priority, to: input.priority }]);
      }
      if (input.dueDate !== undefined && input.dueDate !== current.dueDate) {
        patch.dueDate = input.dueDate;
        changes.push(['due_date_changed', { from: current.dueDate, to: input.dueDate }]);
      }
      if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
        if (input.assigneeId && !tx.select().from(users).where(eq(users.id, input.assigneeId)).get()) {
          throw new ValidationError('Unknown assignee');
        }
        patch.assigneeId = input.assigneeId;
        changes.push(['assignee_changed', { from: current.assigneeId, to: input.assigneeId }]);
      }
      if (input.subprojectId !== undefined && input.subprojectId !== current.subprojectId) {
        if (input.subprojectId) {
          const sub = tx.select().from(subprojects).where(eq(subprojects.id, input.subprojectId)).get();
          if (!sub || sub.projectId !== current.projectId)
            throw new ValidationError('Subproject does not belong to project');
          changes.push(['subproject_changed', { from: row.subprojectName, to: sub.name }]);
        } else {
          changes.push(['subproject_changed', { from: row.subprojectName, to: null }]);
        }
        patch.subprojectId = input.subprojectId;
      }
      if (input.labelIds !== undefined) {
        const before = tx
          .select({ id: topicLabels.labelId })
          .from(topicLabels)
          .where(eq(topicLabels.topicId, current.id))
          .all()
          .map((l) => l.id);
        const next = [...new Set(input.labelIds)];
        const added = next.filter((id) => !before.includes(id));
        const removed = before.filter((id) => !next.includes(id));
        if (added.length > 0 || removed.length > 0) {
          tx.delete(topicLabels).where(eq(topicLabels.topicId, current.id)).run();
          if (next.length > 0)
            tx.insert(topicLabels)
              .values(next.map((labelId) => ({ topicId: current.id, labelId })))
              .run();
          changes.push(['labels_changed', { added, removed }]);
        }
      }
      // Reordering alone is not activity: it must not wake a dormant topic.
      if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) patch.sortOrder = input.sortOrder;

      if (changes.length > 0) {
        patch.updatedAt = at;
        patch.lastActivityAt = at;
      }
      if (Object.keys(patch).length > 0) tx.update(topics).set(patch).where(eq(topics.id, current.id)).run();
      for (const [action, payload] of changes) logActivity(current.id, action, payload, actorId, at);
    });

    return getTopic(current.id);
  }

  function addChecklistItem(
    refOrId: string,
    input: CreateChecklistItemInput,
    actorId: string | null = currentUser().id,
  ) {
    const { topic } = findTopicRow(refOrId);
    const at = now();
    const last = db
      .select({ sortOrder: max(checklistItems.sortOrder) })
      .from(checklistItems)
      .where(eq(checklistItems.topicId, topic.id))
      .get();
    const item: ChecklistItem = {
      id: ulid(at.getTime()),
      topicId: topic.id,
      text: input.text,
      done: false,
      sortOrder: sortKeyBetween(last?.sortOrder ?? null, null),
    };
    db.transaction(() => {
      db.insert(checklistItems).values(item).run();
      logActivity(topic.id, 'checklist_item_added', { text: input.text }, actorId, at);
      touch(topic.id, at);
    });
    return item;
  }

  function updateChecklistItem(id: string, input: UpdateChecklistItemInput, actorId: string | null = currentUser().id) {
    const item = db.select().from(checklistItems).where(eq(checklistItems.id, id)).get();
    if (!item) throw new NotFoundError('Checklist item not found');
    const at = now();
    const next = { ...item, ...input };
    if (Object.keys(input).length === 0) return item;
    db.transaction(() => {
      db.update(checklistItems).set(input).where(eq(checklistItems.id, id)).run();
      if (input.done !== undefined && input.done !== item.done) {
        logActivity(item.topicId, 'checklist_item_toggled', { text: next.text, done: input.done }, actorId, at);
      }
      touch(item.topicId, at);
    });
    return next;
  }

  function addNote(refOrId: string, input: CreateNoteInput, actorId: string | null = currentUser().id): TopicNote {
    const { topic } = findTopicRow(refOrId);
    const at = now();
    const id = ulid(at.getTime());
    db.transaction(() => {
      db.insert(topicNotes)
        .values({ id, topicId: topic.id, authorId: actorId, body: input.body, createdAt: at, updatedAt: at })
        .run();
      logActivity(topic.id, 'note_added', {}, actorId, at);
      touch(topic.id, at);
    });
    const author = actorId ? db.select().from(users).where(eq(users.id, actorId)).get() : undefined;
    return {
      id,
      topicId: topic.id,
      author: author ? toUser(author) : null,
      body: input.body,
      createdAt: iso(at),
      updatedAt: iso(at),
    };
  }

  return {
    currentUser,
    listUsers,
    listLabels,
    dormancyDays,
    listTopics,
    getTopic,
    listProjects,
    getProject,
    listProjectActivity,
    overview,
    search,
    me,
    createTopic,
    updateTopic,
    addChecklistItem,
    updateChecklistItem,
    addNote,
  };
}

export type Repo = ReturnType<typeof createRepo>;
