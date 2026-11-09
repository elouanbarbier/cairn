import { formatTopicRef, type ImportResult, type WorkspaceExport } from '@cairn/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Db } from './db/index.ts';
import * as schema from './db/schema.ts';
import { ConflictError, ValidationError } from './errors.ts';

const { activity, checklistItems, labels, projects, settings, subprojects, topicLabels, topicNotes, topics, users } =
  schema;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);
const date = (value: string) => new Date(value);
const dateOrNull = (value: string | null) => (value ? new Date(value) : null);

/** The whole workspace, without secrets (passwords, sessions, tokens). */
export function exportWorkspace(db: Db, now = new Date()): WorkspaceExport {
  const dormancy = db.select().from(settings).where(eq(settings.key, 'dormancy_days')).get()?.value;
  return {
    format: 'cairn-export',
    version: 1,
    exportedAt: iso(now),
    settings: typeof dormancy === 'number' ? { dormancyDays: dormancy } : {},
    users: db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .all()
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: iso(u.createdAt),
        disabledAt: isoOrNull(u.disabledAt),
      })),
    labels: db.select().from(labels).orderBy(asc(labels.name)).all(),
    projects: db
      .select()
      .from(projects)
      .orderBy(asc(projects.sortOrder))
      .all()
      .map((p) => ({
        ...p,
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
        archivedAt: isoOrNull(p.archivedAt),
      })),
    subprojects: db
      .select()
      .from(subprojects)
      .orderBy(asc(subprojects.sortOrder))
      .all()
      .map((s) => ({
        ...s,
        createdAt: iso(s.createdAt),
        updatedAt: iso(s.updatedAt),
        archivedAt: isoOrNull(s.archivedAt),
      })),
    topics: db
      .select()
      .from(topics)
      .orderBy(asc(topics.projectId), asc(topics.number))
      .all()
      .map((t) => ({
        ...t,
        createdAt: iso(t.createdAt),
        updatedAt: iso(t.updatedAt),
        lastActivityAt: iso(t.lastActivityAt),
        completedAt: isoOrNull(t.completedAt),
      })),
    topicLabels: db.select().from(topicLabels).all(),
    checklistItems: db.select().from(checklistItems).orderBy(asc(checklistItems.sortOrder)).all(),
    notes: db
      .select()
      .from(topicNotes)
      .orderBy(asc(topicNotes.createdAt))
      .all()
      .map((n) => ({ ...n, createdAt: iso(n.createdAt), updatedAt: iso(n.updatedAt) })),
    activity: db
      .select()
      .from(activity)
      .orderBy(asc(activity.createdAt))
      .all()
      .map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
  };
}

/**
 * Loads an export into a workspace without projects (a new install), in one transaction. Accounts are matched by
 * email; the others are created without password and need a link from an administrator.
 */
export function importWorkspace(db: Db, doc: WorkspaceExport): ImportResult {
  if (db.select({ id: projects.id }).from(projects).get()) {
    throw new ConflictError('Import works on a workspace without projects; this one has some');
  }
  const projectIds = new Set(doc.projects.map((p) => p.id));
  const topicIds = new Set(doc.topics.map((t) => t.id));
  for (const s of doc.subprojects)
    if (!projectIds.has(s.projectId)) throw new ValidationError(`Unknown project ${s.projectId}`);
  for (const t of doc.topics)
    if (!projectIds.has(t.projectId)) throw new ValidationError(`Unknown project ${t.projectId}`);

  return db.transaction((tx) => {
    // Accounts: the existing one with the same email, or a new one without password.
    const userIds = new Map<string, string>();
    let newAccounts = 0;
    const known = new Map(
      tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .all()
        .map((u) => [u.email, u.id] as const),
    );
    for (const u of doc.users) {
      const email = u.email.trim().toLowerCase();
      const existing = known.get(email);
      if (existing) {
        userIds.set(u.id, existing);
        continue;
      }
      const id = ulid();
      tx.insert(users)
        .values({
          id,
          name: u.name,
          email,
          role: u.role,
          createdAt: date(u.createdAt),
          disabledAt: dateOrNull(u.disabledAt),
        })
        .run();
      known.set(email, id);
      userIds.set(u.id, id);
      newAccounts++;
    }
    const user = (id: string | null) => (id ? (userIds.get(id) ?? null) : null);

    // Labels already present (same name) are reused.
    const labelIds = new Map<string, string>();
    const labelsByName = new Map(
      tx
        .select()
        .from(labels)
        .all()
        .map((l) => [l.name, l.id] as const),
    );
    for (const l of doc.labels) {
      const existing = labelsByName.get(l.name);
      if (existing) {
        labelIds.set(l.id, existing);
      } else {
        tx.insert(labels).values(l).run();
        labelIds.set(l.id, l.id);
      }
    }

    for (const p of doc.projects) {
      tx.insert(projects)
        .values({
          ...p,
          createdAt: date(p.createdAt),
          updatedAt: date(p.updatedAt),
          archivedAt: dateOrNull(p.archivedAt),
        })
        .run();
    }
    for (const s of doc.subprojects) {
      tx.insert(subprojects)
        .values({
          ...s,
          createdAt: date(s.createdAt),
          updatedAt: date(s.updatedAt),
          archivedAt: dateOrNull(s.archivedAt),
        })
        .run();
    }
    for (const t of doc.topics) {
      tx.insert(topics)
        .values({
          ...t,
          assigneeId: user(t.assigneeId),
          createdAt: date(t.createdAt),
          updatedAt: date(t.updatedAt),
          lastActivityAt: date(t.lastActivityAt),
          completedAt: dateOrNull(t.completedAt),
        })
        .run();
    }
    for (const link of doc.topicLabels) {
      const labelId = labelIds.get(link.labelId);
      if (labelId && topicIds.has(link.topicId)) {
        tx.insert(topicLabels).values({ topicId: link.topicId, labelId }).onConflictDoNothing().run();
      }
    }
    for (const item of doc.checklistItems) if (topicIds.has(item.topicId)) tx.insert(checklistItems).values(item).run();
    for (const n of doc.notes) {
      if (!topicIds.has(n.topicId)) continue;
      tx.insert(topicNotes)
        .values({ ...n, authorId: user(n.authorId), createdAt: date(n.createdAt), updatedAt: date(n.updatedAt) })
        .run();
    }
    for (const a of doc.activity) {
      tx.insert(activity)
        .values({ ...a, actorId: user(a.actorId), createdAt: date(a.createdAt) })
        .run();
    }
    if (doc.settings.dormancyDays !== undefined) {
      tx.insert(settings)
        .values({ key: 'dormancy_days', value: doc.settings.dormancyDays })
        .onConflictDoUpdate({ target: settings.key, set: { value: doc.settings.dormancyDays } })
        .run();
    }
    return { projects: doc.projects.length, topics: doc.topics.length, newAccounts };
  });
}

/** Cells starting with these are formulas for spreadsheets: they are prefixed with an apostrophe. */
const FORMULA = /^[=+\-@\t\r]/;

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Every topic as CSV (UTF-8 with a BOM, so spreadsheets read the accents). */
export function topicsCsv(db: Db): string {
  const rows = db
    .select({
      topic: topics,
      projectKey: projects.key,
      projectName: projects.name,
      subprojectName: subprojects.name,
      assignee: users.name,
    })
    .from(topics)
    .innerJoin(projects, eq(topics.projectId, projects.id))
    .leftJoin(subprojects, eq(topics.subprojectId, subprojects.id))
    .leftJoin(users, eq(topics.assigneeId, users.id))
    .orderBy(asc(projects.sortOrder), asc(topics.number))
    .all();
  const labelNames = new Map<string, string[]>();
  const ids = rows.map((r) => r.topic.id);
  for (let i = 0; i < ids.length; i += 500) {
    for (const row of db
      .select({ topicId: topicLabels.topicId, name: labels.name })
      .from(topicLabels)
      .innerJoin(labels, eq(topicLabels.labelId, labels.id))
      .where(inArray(topicLabels.topicId, ids.slice(i, i + 500)))
      .all()) {
      labelNames.set(row.topicId, [...(labelNames.get(row.topicId) ?? []), row.name]);
    }
  }
  const header = [
    'ref',
    'title',
    'project',
    'subproject',
    'status',
    'priority',
    'due_date',
    'assignee',
    'labels',
    'created_at',
    'last_activity_at',
    'completed_at',
    'description',
  ];
  const lines = rows.map(({ topic, projectKey, projectName, subprojectName, assignee }) =>
    [
      formatTopicRef(projectKey, topic.number),
      topic.title,
      projectName,
      subprojectName,
      topic.status,
      topic.priority,
      topic.dueDate,
      assignee,
      (labelNames.get(topic.id) ?? []).sort().join(', '),
      iso(topic.createdAt),
      iso(topic.lastActivityAt),
      isoOrNull(topic.completedAt),
      topic.description,
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
