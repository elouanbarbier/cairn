import {
  type Activity,
  type ActivityAction,
  type BulkTopicPatch,
  buildOverview,
  type ChecklistItem,
  COMPLETED_WINDOW_DAYS,
  type CreateChecklistItemInput,
  type CreateNoteInput,
  type CreateProjectInput,
  type CreateSubprojectInput,
  type CreateTopicInput,
  computeProgress,
  DEFAULT_DORMANCY_DAYS,
  formatTopicRef,
  isClosed,
  type Label,
  type Me,
  nextProjectColor,
  OVERVIEW_GROUP_LIMIT,
  OVERVIEW_LIST_LIMIT,
  type Overview,
  type ProjectActivity,
  type ProjectStatus,
  type ProjectSummary,
  parseTopicRef,
  type RecentActivity,
  type SearchHit,
  type SearchResult,
  type SearchSegment,
  type SubprojectSummary,
  sortKeyBetween,
  type TopicDetail,
  type TopicNote,
  type TopicStatus,
  type TopicSummary,
  type UpdateChecklistItemInput,
  type UpdateProjectInput,
  type UpdateSettingsInput,
  type UpdateSubprojectInput,
  type UpdateTopicInput,
  type User,
  type WorkspaceExport,
  type WorkspaceSettings,
} from '@cairn/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max, min, or, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Db } from './db/index.ts';
import * as schema from './db/schema.ts';

import { ConflictError, NotFoundError, ValidationError } from './errors.ts';
import { exportWorkspace, importWorkspace, topicsCsv } from './transfer.ts';

export { ConflictError, NotFoundError, ValidationError };

type EntityType = 'project' | 'subproject' | 'topic';
type ArchivedFilter = 'exclude' | 'only' | 'include';

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

/** Newest first; entries written in the same millisecond keep their insertion order. */
const newestActivityFirst = [desc(schema.activity.createdAt), desc(sql`${schema.activity}.rowid`)];

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

type SearchField = SearchHit['match']['field'];
const SEARCH_FIELD_RANK: Record<SearchField, number> = { ref: 0, title: 1, description: 2, note: 3 };

/** FTS5 query: every word as a quoted prefix, so the input can never be read as FTS syntax. */
function ftsQuery(normalized: string): string | null {
  const words = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return words.length > 0 ? words.map((w) => `"${w}"*`).join(' ') : null;
}

/** Marks around matched words in FTS5 `highlight()` and `snippet()` output (`char(1)` and `char(2)` in SQL). */
const MATCH_START = String.fromCharCode(1);
const MATCH_END = String.fromCharCode(2);

/** Splits marked FTS5 output into plain and matching segments, without Markdown marks or line breaks. */
function toSegments(marked: string): SearchSegment[] {
  const segments: SearchSegment[] = [];
  let current = '';
  let match = false;
  const flush = () => {
    const text = current.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ');
    if (text) segments.push({ text, match });
    current = '';
  };
  for (const char of marked) {
    if (char === MATCH_START || char === MATCH_END) {
      flush();
      match = char === MATCH_START;
    } else {
      current += char;
    }
  }
  flush();
  return segments;
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

  /** People who can be assigned: accounts that are not disabled. */
  function listUsers(): User[] {
    return db.select().from(users).where(isNull(users.disabledAt)).orderBy(asc(users.name)).all().map(toUser);
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

  /** When each topic last entered `waiting`, from the activity log. */
  function waitingSinceOf(ids: readonly string[]): Map<string, string> {
    const since = new Map<string, string>();
    for (const part of chunk(ids)) {
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
        if (row.at) since.set(row.topicId, iso(row.at));
      }
    }
    return since;
  }

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

    for (const [id, at] of waitingSinceOf(rows.filter((r) => r.topic.status === 'waiting').map((r) => r.topic.id))) {
      waitingSince.set(id, at);
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

  /** Topics of projects in use; asking for one project also lists an archived one's topics. */
  function listTopics(filter: { projectId?: string; subprojectId?: string; assigneeId?: string } = {}): TopicSummary[] {
    const conditions: SQL[] = [];
    if (!filter.projectId) conditions.push(isNull(projects.archivedAt));
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
      .orderBy(...newestActivityFirst)
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

  function listProjects(options: { archived?: ArchivedFilter } = {}): ProjectSummary[] {
    const archived = options.archived ?? 'exclude';
    const projectRows = db
      .select()
      .from(projects)
      .where(
        archived === 'include'
          ? undefined
          : archived === 'only'
            ? isNotNull(projects.archivedAt)
            : isNull(projects.archivedAt),
      )
      .orderBy(asc(projects.sortOrder))
      .all();
    const subprojectRows = db.select().from(subprojects).orderBy(asc(subprojects.sortOrder)).all();
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
            archivedAt: isoOrNull(s.archivedAt),
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
        archivedAt: isoOrNull(p.archivedAt),
        openCount: projectStatuses.filter((st) => !isClosed(st)).length,
        progress: computeProgress(projectStatuses),
        subprojects: subs.filter((s) => s.archivedAt === null),
        archivedSubprojects: subs.filter((s) => s.archivedAt !== null),
      };
    });
  }

  function getProject(key: string): ProjectSummary {
    const project = listProjects({ archived: 'include' }).find((p) => p.key === key.toUpperCase());
    if (!project) throw new NotFoundError(`Project ${key} not found`);
    return project;
  }

  /** The project's own changes, its subprojects' and its topics', newest first. */
  function listProjectActivity(key: string, limit = 50): ProjectActivity[] {
    const project = getProject(key);
    const subprojectNames = new Map(
      [...project.subprojects, ...project.archivedSubprojects].map((s) => [s.id, s.name] as const),
    );
    const subprojectIds = [...subprojectNames.keys()];
    return db
      .select({ entry: activity, actor: users, topicNumber: topics.number, topicTitle: topics.title })
      .from(activity)
      .leftJoin(topics, and(eq(activity.entityType, 'topic'), eq(activity.entityId, topics.id)))
      .leftJoin(users, eq(activity.actorId, users.id))
      .where(
        or(
          eq(topics.projectId, project.id),
          and(eq(activity.entityType, 'project'), eq(activity.entityId, project.id)),
          subprojectIds.length > 0
            ? and(eq(activity.entityType, 'subproject'), inArray(activity.entityId, subprojectIds))
            : undefined,
        ),
      )
      .orderBy(...newestActivityFirst)
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
        topicRef: topicNumber === null ? null : formatTopicRef(project.key, topicNumber),
        topicTitle,
        subprojectName: entry.entityType === 'subproject' ? (subprojectNames.get(entry.entityId) ?? null) : null,
      }));
  }

  /* ---------- Projects and subprojects: writing ---------- */

  function findProjectRow(key: string) {
    const row = db.select().from(projects).where(eq(projects.key, key.trim().toUpperCase())).get();
    if (!row) throw new NotFoundError(`Project ${key} not found`);
    return row;
  }

  /**
   * Shared by projects and subprojects: name, description, target date and status changes, where `archived`
   * archives and any other status restores.
   */
  function containerPatch(
    current: {
      name: string;
      description: string;
      status: ProjectStatus;
      targetDate: string | null;
      archivedAt: Date | null;
    },
    input: { name?: string; description?: string; status?: ProjectStatus; targetDate?: string | null },
    at: Date,
  ) {
    const patch: {
      name?: string;
      description?: string;
      status?: ProjectStatus;
      targetDate?: string | null;
      archivedAt?: Date | null;
      updatedAt?: Date;
    } = {};
    const changes: Array<[ActivityAction, Record<string, unknown>]> = [];

    if (input.name !== undefined && input.name !== current.name) {
      patch.name = input.name;
      changes.push(['renamed', { from: current.name, to: input.name }]);
    }
    if (input.description !== undefined && input.description !== current.description) {
      patch.description = input.description;
      changes.push(['description_changed', {}]);
    }
    if (input.targetDate !== undefined && input.targetDate !== current.targetDate) {
      patch.targetDate = input.targetDate;
      changes.push(['target_date_changed', { from: current.targetDate, to: input.targetDate }]);
    }
    if (input.status !== undefined) {
      const archive = input.status === 'archived';
      if (archive && current.archivedAt === null) {
        patch.status = 'archived';
        patch.archivedAt = at;
        changes.push(['archived', {}]);
      } else if (!archive && current.archivedAt !== null) {
        patch.status = input.status;
        patch.archivedAt = null;
        changes.push(['restored', { to: input.status }]);
      } else if (input.status !== current.status) {
        patch.status = input.status;
        changes.push(['status_changed', { from: current.status, to: input.status }]);
      }
    }
    return { patch, changes };
  }

  function createProject(input: CreateProjectInput, actorId: string | null): ProjectSummary {
    const at = now();
    db.transaction((tx) => {
      if (tx.select({ id: projects.id }).from(projects).where(eq(projects.key, input.key)).get()) {
        throw new ConflictError(`Project key ${input.key} is already used`);
      }
      const colors = tx
        .select({ color: projects.color })
        .from(projects)
        .where(isNull(projects.archivedAt))
        .all()
        .map((r) => r.color);
      const last = tx
        .select({ sortOrder: max(projects.sortOrder) })
        .from(projects)
        .get();
      const id = ulid(at.getTime());
      tx.insert(projects)
        .values({
          id,
          key: input.key,
          name: input.name,
          description: input.description ?? '',
          color: input.color ?? nextProjectColor(colors),
          icon: null,
          status: input.status ?? 'active',
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          sortOrder: sortKeyBetween(last?.sortOrder ?? null, null),
          createdAt: at,
          updatedAt: at,
        })
        .run();
      logEntityActivity('project', id, 'created', {}, actorId, at);
    });
    return getProject(input.key);
  }

  function updateProject(key: string, input: UpdateProjectInput, actorId: string | null): ProjectSummary {
    const current = findProjectRow(key);
    const at = now();
    const { patch, changes } = containerPatch(current, input, at);
    const extra: Partial<typeof projects.$inferInsert> = {};
    if (input.color !== undefined && input.color.toUpperCase() !== current.color.toUpperCase())
      extra.color = input.color;
    if (input.startDate !== undefined && input.startDate !== current.startDate) extra.startDate = input.startDate;
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) extra.sortOrder = input.sortOrder;

    const all = { ...patch, ...extra };
    if (Object.keys(all).length > 0) {
      db.transaction((tx) => {
        tx.update(projects)
          .set({ ...all, updatedAt: at })
          .where(eq(projects.id, current.id))
          .run();
        for (const [action, payload] of changes) logEntityActivity('project', current.id, action, payload, actorId, at);
      });
    }
    return getProject(current.key);
  }

  function createSubproject(
    projectKey: string,
    input: CreateSubprojectInput,
    actorId: string | null,
  ): SubprojectSummary {
    const project = findProjectRow(projectKey);
    const at = now();
    const id = ulid(at.getTime());
    db.transaction((tx) => {
      const last = tx
        .select({ sortOrder: max(subprojects.sortOrder) })
        .from(subprojects)
        .where(eq(subprojects.projectId, project.id))
        .get();
      tx.insert(subprojects)
        .values({
          id,
          projectId: project.id,
          name: input.name,
          description: input.description ?? '',
          status: input.status ?? 'active',
          targetDate: input.targetDate ?? null,
          sortOrder: sortKeyBetween(last?.sortOrder ?? null, null),
          createdAt: at,
          updatedAt: at,
        })
        .run();
      logEntityActivity('subproject', id, 'created', {}, actorId, at);
    });
    return getSubproject(id);
  }

  function getSubproject(id: string): SubprojectSummary {
    const row = db
      .select({ key: projects.key })
      .from(subprojects)
      .innerJoin(projects, eq(subprojects.projectId, projects.id))
      .where(eq(subprojects.id, id))
      .get();
    const project = row ? getProject(row.key) : undefined;
    const sub = project && [...project.subprojects, ...project.archivedSubprojects].find((s) => s.id === id);
    if (!sub) throw new NotFoundError('Subproject not found');
    return sub;
  }

  function updateSubproject(id: string, input: UpdateSubprojectInput, actorId: string | null): SubprojectSummary {
    const current = db.select().from(subprojects).where(eq(subprojects.id, id)).get();
    if (!current) throw new NotFoundError('Subproject not found');
    const at = now();
    const { patch, changes } = containerPatch(current, input, at);
    const all: Partial<typeof subprojects.$inferInsert> = { ...patch };
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) all.sortOrder = input.sortOrder;
    if (Object.keys(all).length > 0) {
      db.transaction((tx) => {
        tx.update(subprojects)
          .set({ ...all, updatedAt: at })
          .where(eq(subprojects.id, id))
          .run();
        for (const [action, payload] of changes) logEntityActivity('subproject', id, action, payload, actorId, at);
      });
    }
    return getSubproject(id);
  }

  /* ---------- Overview, search, me ---------- */

  /**
   * The home page over the active projects (minus `excludeProjectIds`, the viewer's filter). Topics are sorted from
   * light rows; only the ones sent (the first of each list) are loaded in full.
   */
  function overview(today?: string, excludeProjectIds: readonly string[] = []): Overview {
    const active = listProjects().filter((p) => p.status === 'active' && !excludeProjectIds.includes(p.id));
    const activeIds = active.map((p) => p.id);
    const at = now();
    const since = new Date(at.getTime() - COMPLETED_WINDOW_DAYS * 86_400_000);
    const rows =
      activeIds.length === 0
        ? []
        : db
            .select({
              id: topics.id,
              projectId: topics.projectId,
              status: topics.status,
              priority: topics.priority,
              dueDate: topics.dueDate,
              sortOrder: topics.sortOrder,
              lastActivityAt: topics.lastActivityAt,
              completedAt: topics.completedAt,
            })
            .from(topics)
            .where(
              and(
                inArray(topics.projectId, activeIds),
                or(
                  inArray(topics.status, ['todo', 'in_progress', 'waiting']),
                  and(eq(topics.status, 'backlog'), isNotNull(topics.dueDate)),
                  and(eq(topics.status, 'done'), gte(topics.completedAt, since)),
                ),
              ),
            )
            .all();
    const waiting = waitingSinceOf(rows.filter((r) => r.status === 'waiting').map((r) => r.id));
    const light = rows.map((r) => ({
      ...r,
      lastActivityAt: iso(r.lastActivityAt),
      completedAt: isoOrNull(r.completedAt),
      waitingSince: r.status === 'waiting' ? (waiting.get(r.id) ?? iso(r.lastActivityAt)) : null,
    }));
    const selection = buildOverview({ topics: light, projects: active, now: at, today, dormancyDays: dormancyDays() });

    const firsts = <T>(list: T[]) => list.slice(0, OVERVIEW_LIST_LIMIT);
    const sent = [
      ...selection.inProgress.flatMap((g) => g.topics.slice(0, OVERVIEW_GROUP_LIMIT)),
      ...firsts(selection.waiting),
      ...firsts(selection.overdue),
      ...firsts(selection.upcoming),
      ...firsts(selection.dormant),
      ...firsts(selection.completedThisWeek),
    ];
    const ids = [...new Set(sent.map((t) => t.id))];
    const full = new Map(
      (ids.length === 0 ? [] : hydrate(selectTopics(inArray(topics.id, ids)))).map((t) => [t.id, t] as const),
    );
    const fill = (list: Array<{ id: string }>) => list.flatMap((t) => full.get(t.id) ?? []);

    return {
      today: selection.today,
      dormancyDays: selection.dormancyDays,
      activeProjectCount: selection.activeProjectCount,
      totals: {
        inProgress: selection.inProgress.reduce((n, g) => n + g.topics.length, 0),
        waiting: selection.waiting.length,
        overdue: selection.overdue.length,
        upcoming: selection.upcoming.length,
        dormant: selection.dormant.length,
        completedThisWeek: selection.completedThisWeek.length,
      },
      inProgress: selection.inProgress.map((g) => ({
        project: g.project,
        total: g.topics.length,
        topics: fill(g.topics.slice(0, OVERVIEW_GROUP_LIMIT)),
      })),
      waiting: fill(firsts(selection.waiting)),
      overdue: fill(firsts(selection.overdue)),
      upcoming: fill(firsts(selection.upcoming)),
      dormant: fill(firsts(selection.dormant)),
      progress: selection.progress,
      completedThisWeek: fill(firsts(selection.completedThisWeek)),
      recentActivity: recentActivity(activeIds),
    };
  }

  /** Latest changes of topics, subprojects and the projects themselves, in the given projects. */
  function recentActivity(projectIds: string[], limit = 12): RecentActivity[] {
    if (projectIds.length === 0) return [];
    const ownerProject = sql`coalesce(${topics.projectId}, ${subprojects.projectId}, case when ${activity.entityType} = 'project' then ${activity.entityId} end)`;
    return db
      .select({
        entry: activity,
        actor: users,
        topicNumber: topics.number,
        topicTitle: topics.title,
        subprojectName: subprojects.name,
        project: { id: projects.id, key: projects.key, name: projects.name, color: projects.color },
      })
      .from(activity)
      .leftJoin(topics, and(eq(activity.entityType, 'topic'), eq(activity.entityId, topics.id)))
      .leftJoin(subprojects, and(eq(activity.entityType, 'subproject'), eq(activity.entityId, subprojects.id)))
      .innerJoin(projects, sql`${projects.id} = ${ownerProject}`)
      .leftJoin(users, eq(activity.actorId, users.id))
      .where(inArray(projects.id, projectIds))
      .orderBy(...newestActivityFirst)
      .limit(limit)
      .all()
      .map(({ entry, actor, topicNumber, topicTitle, subprojectName, project }) => ({
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor: actor ? toUser(actor) : null,
        action: entry.action as ActivityAction,
        payload: entry.payload,
        createdAt: iso(entry.createdAt),
        topicRef: topicNumber === null ? null : formatTopicRef(project.key, topicNumber),
        topicTitle,
        subprojectName,
        project,
      }));
  }

  function settings(): WorkspaceSettings {
    return { dormancyDays: dormancyDays() };
  }

  function updateSettings(input: UpdateSettingsInput): WorkspaceSettings {
    if (input.dormancyDays !== undefined) {
      db.insert(schema.settings)
        .values({ key: 'dormancy_days', value: input.dormancyDays })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: input.dormancyDays } })
        .run();
    }
    return settings();
  }

  /**
   * Topics by reference (exact, then prefix) and by full text (FTS5) in titles, descriptions and notes, accents
   * ignored, every word matched as a prefix. Better matches first (reference, title, description, note), then what
   * moves before what is closed.
   */
  function search(query: string, limit = 20): SearchResult {
    const q = normalize(query.trim());
    if (!q) return { topics: [], subprojects: [] };

    type Hit = {
      id: string;
      number: number;
      status: TopicStatus;
      field: SearchField;
      segments: SearchSegment[];
      rank: number;
    };
    const hits = new Map<string, Hit>();
    const better = (a: Hit, b: Hit) => SEARCH_FIELD_RANK[a.field] - SEARCH_FIELD_RANK[b.field] || a.rank - b.rank;
    const keep = (hit: Hit) => {
      const current = hits.get(hit.id);
      if (!current || better(hit, current) < 0) hits.set(hit.id, hit);
    };

    // References are not in the full-text index: `POR-24`, or `por-2` while typing.
    for (const t of db
      .select({ id: topics.id, number: topics.number, key: projects.key, status: topics.status })
      .from(topics)
      .innerJoin(projects, eq(topics.projectId, projects.id))
      .where(isNull(projects.archivedAt))
      .all()) {
      const ref = normalize(formatTopicRef(t.key, t.number));
      if (ref === q || ref.startsWith(q)) {
        keep({ ...t, field: 'ref', segments: [], rank: ref === q ? -2 : -1 });
      }
    }

    const match = ftsQuery(q);
    if (match) {
      const rows = db.all<{
        id: string;
        number: number;
        status: TopicStatus;
        field: 'title' | 'description' | 'note';
        rank: number;
        highlighted: string;
        excerpt: string;
      }>(sql`
        SELECT t.id AS id, t.number AS number, t.status AS status, search_index.field AS field,
          bm25(search_index) AS rank,
          highlight(search_index, 0, char(1), char(2)) AS highlighted,
          snippet(search_index, 0, char(1), char(2), '…', 12) AS excerpt
        FROM search_index
        JOIN topics t ON t.id = search_index.topic_id
        JOIN projects p ON p.id = t.project_id
        WHERE search_index MATCH ${match} AND p.archived_at IS NULL
        ORDER BY rank
        LIMIT 500`);
      for (const row of rows) {
        keep({
          id: row.id,
          number: row.number,
          status: row.status,
          field: row.field,
          rank: row.rank,
          segments: toSegments(row.field === 'title' ? row.highlighted : row.excerpt),
        });
      }
    }

    const ranked = [...hits.values()]
      .sort(
        (a, b) =>
          SEARCH_FIELD_RANK[a.field] * 10 +
            SEARCH_STATUS_RANK[a.status] -
            (SEARCH_FIELD_RANK[b.field] * 10 + SEARCH_STATUS_RANK[b.status]) ||
          a.rank - b.rank ||
          b.number - a.number,
      )
      .slice(0, limit);

    const byId = new Map(ranked.map((h) => [h.id, h]));
    const order = new Map(ranked.map((h, i) => [h.id, i]));
    const topicResults =
      ranked.length === 0
        ? []
        : hydrate(selectTopics(inArray(topics.id, [...byId.keys()])))
            .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
            .map((topic) => {
              const hit = byId.get(topic.id);
              return { ...topic, match: { field: hit?.field ?? 'title', segments: hit?.segments ?? [] } };
            });

    const subprojectResults = listProjects().flatMap((p) =>
      p.subprojects
        .filter((s) => normalize(s.name).includes(q))
        .map((s) => ({ ...s, projectKey: p.key, projectName: p.name, projectColor: p.color })),
    );

    return { topics: topicResults, subprojects: subprojectResults.slice(0, 5) };
  }

  function me(user: User): Me {
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

  function logEntityActivity(
    entityType: EntityType,
    entityId: string,
    action: ActivityAction,
    payload: Record<string, unknown>,
    actorId: string | null,
    at: Date,
  ) {
    db.insert(activity)
      .values({ id: ulid(at.getTime()), entityType, entityId, actorId, action, payload, createdAt: at })
      .run();
  }

  function logActivity(
    topicId: string,
    action: ActivityAction,
    payload: Record<string, unknown>,
    actorId: string | null,
    at: Date,
  ) {
    logEntityActivity('topic', topicId, action, payload, actorId, at);
  }

  function touch(topicId: string, at: Date) {
    db.update(topics).set({ updatedAt: at, lastActivityAt: at }).where(eq(topics.id, topicId)).run();
  }

  function createTopic(input: CreateTopicInput, actorId: string | null): TopicDetail {
    const at = now();
    const id = db.transaction((tx) => {
      const project = tx.select().from(projects).where(eq(projects.id, input.projectId)).get();
      if (!project) throw new NotFoundError('Project not found');
      if (input.subprojectId) {
        const sub = tx.select().from(subprojects).where(eq(subprojects.id, input.subprojectId)).get();
        if (!sub || sub.projectId !== project.id) throw new ValidationError('Subproject does not belong to project');
        if (sub.archivedAt) throw new ValidationError('Subproject is archived');
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

  function updateTopic(refOrId: string, input: UpdateTopicInput, actorId: string | null): TopicDetail {
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
          if (sub.archivedAt) throw new ValidationError('Subproject is archived');
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
        if (next.length > 0) {
          const known = tx.select({ id: labels.id }).from(labels).where(inArray(labels.id, next)).all();
          if (known.length !== next.length) throw new ValidationError('Unknown label');
        }
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

  /** One change on several topics, all or nothing: any refused topic rolls the whole batch back. */
  function updateTopics(refs: readonly string[], patch: BulkTopicPatch, actorId: string | null): TopicSummary[] {
    const { addLabelIds = [], removeLabelIds = [], ...fields } = patch;
    const ids = db.transaction(() =>
      [...new Set(refs)].map((ref) => {
        const row = findTopicRow(ref);
        const input: UpdateTopicInput = { ...fields };
        if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
          const current = db
            .select({ id: topicLabels.labelId })
            .from(topicLabels)
            .where(eq(topicLabels.topicId, row.topic.id))
            .all()
            .map((l) => l.id);
          input.labelIds = [...new Set([...current, ...addLabelIds])].filter((id) => !removeLabelIds.includes(id));
        }
        updateTopic(row.topic.id, input, actorId);
        return row.topic.id;
      }),
    );
    const order = new Map(ids.map((id, i) => [id, i]));
    return hydrate(selectTopics(inArray(topics.id, ids))).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  function addChecklistItem(refOrId: string, input: CreateChecklistItemInput, actorId: string | null) {
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

  function updateChecklistItem(id: string, input: UpdateChecklistItemInput, actorId: string | null) {
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

  function addNote(refOrId: string, input: CreateNoteInput, actorId: string | null): TopicNote {
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
    listUsers,
    listLabels,
    dormancyDays,
    listTopics,
    getTopic,
    listProjects,
    getProject,
    listProjectActivity,
    createProject,
    updateProject,
    createSubproject,
    getSubproject,
    updateSubproject,
    overview,
    settings,
    updateSettings,
    search,
    me,
    createTopic,
    updateTopic,
    updateTopics,
    addChecklistItem,
    updateChecklistItem,
    addNote,
    exportWorkspace: () => exportWorkspace(db, now()),
    importWorkspace: (doc: WorkspaceExport) => importWorkspace(db, doc),
    topicsCsv: () => topicsCsv(db),
  };
}

export type Repo = ReturnType<typeof createRepo>;
