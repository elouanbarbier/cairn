import type { ProjectStatus, TopicPriority, TopicStatus, UserRole } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Timestamps are stored as Unix milliseconds. */
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () => timestamp('created_at').notNull().default(sql`(unixepoch('subsec') * 1000)`);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** Set when authentication lands (J4). */
  passwordHash: text('password_hash'),
  role: text('role').$type<UserRole>().notNull().default('member'),
  createdAt: createdAt(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull(),
  icon: text('icon'),
  status: text('status').$type<ProjectStatus>().notNull().default('active'),
  startDate: text('start_date'),
  targetDate: text('target_date'),
  sortOrder: text('sort_order').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at').notNull(),
  archivedAt: timestamp('archived_at'),
});

export const subprojects = sqliteTable(
  'subprojects',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').$type<ProjectStatus>().notNull().default('active'),
    targetDate: text('target_date'),
    sortOrder: text('sort_order').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at').notNull(),
    archivedAt: timestamp('archived_at'),
  },
  (t) => [index('subprojects_project_idx').on(t.projectId)],
);

export const topics = sqliteTable(
  'topics',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    subprojectId: text('subproject_id').references(() => subprojects.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').$type<TopicStatus>().notNull().default('todo'),
    priority: text('priority').$type<TopicPriority>().notNull().default('none'),
    dueDate: text('due_date'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    sortOrder: text('sort_order').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at').notNull(),
    lastActivityAt: timestamp('last_activity_at').notNull(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [
    uniqueIndex('topics_project_number_idx').on(t.projectId, t.number),
    index('topics_subproject_idx').on(t.subprojectId),
    index('topics_status_idx').on(t.status),
    index('topics_due_idx').on(t.dueDate),
  ],
);

export const checklistItems = sqliteTable(
  'checklist_items',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    sortOrder: text('sort_order').notNull(),
  },
  (t) => [index('checklist_topic_idx').on(t.topicId)],
);

export const topicNotes = sqliteTable(
  'topic_notes',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [index('notes_topic_idx').on(t.topicId)],
);

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
});

export const topicLabels = sqliteTable(
  'topic_labels',
  {
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.labelId] })],
);

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').$type<'project' | 'subproject' | 'topic'>().notNull(),
    entityId: text('entity_id').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_entity_idx').on(t.entityType, t.entityId, t.createdAt)],
);

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: createdAt(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});
