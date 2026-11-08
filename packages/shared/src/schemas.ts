import { z } from 'zod';
import {
  PROJECT_KEY_PATTERN,
  PROJECT_LIVE_STATUSES,
  PROJECT_STATUSES,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  USER_ROLES,
} from './constants.ts';

/** `YYYY-MM-DD` calendar date. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
/** ISO 8601 timestamp. */
export const timestampSchema = z.string();
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB');

export const topicStatusSchema = z.enum(TOPIC_STATUSES);
export const topicPrioritySchema = z.enum(TOPIC_PRIORITIES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectLiveStatusSchema = z.enum(PROJECT_LIVE_STATUSES);
export const userRoleSchema = z.enum(USER_ROLES);

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
});
export type User = z.infer<typeof userSchema>;

export const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: colorSchema,
});
export type Label = z.infer<typeof labelSchema>;

export const progressSchema = z.object({
  done: z.number().int(),
  total: z.number().int(),
});
export type Progress = z.infer<typeof progressSchema>;

export const subprojectSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  status: projectStatusSchema,
  targetDate: isoDateSchema.nullable(),
  sortOrder: z.string(),
  archivedAt: timestampSchema.nullable(),
  /** Topics that are not closed (backlog included). */
  openCount: z.number().int(),
  progress: progressSchema,
});
export type SubprojectSummary = z.infer<typeof subprojectSummarySchema>;

export const projectSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  color: colorSchema,
  icon: z.string().nullable(),
  status: projectStatusSchema,
  startDate: isoDateSchema.nullable(),
  targetDate: isoDateSchema.nullable(),
  sortOrder: z.string(),
  archivedAt: timestampSchema.nullable(),
  openCount: z.number().int(),
  progress: progressSchema,
  /** Subprojects in use, in sort order. */
  subprojects: z.array(subprojectSummarySchema),
  /** Archived subprojects, kept apart so they can be restored. */
  archivedSubprojects: z.array(subprojectSummarySchema),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const topicSummarySchema = z.object({
  id: z.string(),
  /** Human-readable reference, e.g. `POR-24`. */
  ref: z.string(),
  number: z.number().int(),
  projectId: z.string(),
  projectKey: z.string(),
  projectName: z.string(),
  projectColor: colorSchema,
  subprojectId: z.string().nullable(),
  subprojectName: z.string().nullable(),
  title: z.string(),
  status: topicStatusSchema,
  priority: topicPrioritySchema,
  dueDate: isoDateSchema.nullable(),
  assignee: userSchema.nullable(),
  labels: z.array(labelSchema),
  checklist: progressSchema,
  sortOrder: z.string(),
  createdAt: timestampSchema,
  lastActivityAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  /** When the topic last entered the `waiting` status, if it is waiting. */
  waitingSince: timestampSchema.nullable(),
});
export type TopicSummary = z.infer<typeof topicSummarySchema>;

export const checklistItemSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  text: z.string(),
  done: z.boolean(),
  sortOrder: z.string(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const topicNoteSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  author: userSchema.nullable(),
  body: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

export const ACTIVITY_ACTIONS = [
  'created',
  'status_changed',
  'priority_changed',
  'due_date_changed',
  'assignee_changed',
  'subproject_changed',
  'labels_changed',
  'title_changed',
  'description_changed',
  'checklist_item_added',
  'checklist_item_toggled',
  'note_added',
  // Projects and subprojects
  'renamed',
  'target_date_changed',
  'archived',
  'restored',
] as const;
export const activityActionSchema = z.enum(ACTIVITY_ACTIONS);
export type ActivityAction = z.infer<typeof activityActionSchema>;

export const activitySchema = z.object({
  id: z.string(),
  entityType: z.enum(['project', 'subproject', 'topic']),
  entityId: z.string(),
  actor: userSchema.nullable(),
  action: activityActionSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
});
export type Activity = z.infer<typeof activitySchema>;

/** A line of a project's history: its own changes, its subprojects' and its topics'. */
export const projectActivitySchema = activitySchema.extend({
  topicRef: z.string().nullable(),
  topicTitle: z.string().nullable(),
  subprojectName: z.string().nullable(),
});
export type ProjectActivity = z.infer<typeof projectActivitySchema>;

export const topicDetailSchema = topicSummarySchema.extend({
  description: z.string(),
  updatedAt: timestampSchema,
  checklistItems: z.array(checklistItemSchema),
  notes: z.array(topicNoteSchema),
  activity: z.array(activitySchema),
});
export type TopicDetail = z.infer<typeof topicDetailSchema>;

export const projectRefSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  color: colorSchema,
});
export type ProjectRef = z.infer<typeof projectRefSchema>;

export const overviewSchema = z.object({
  today: isoDateSchema,
  dormancyDays: z.number().int(),
  activeProjectCount: z.number().int(),
  inProgress: z.array(z.object({ project: projectRefSchema, topics: z.array(topicSummarySchema) })),
  waiting: z.array(topicSummarySchema),
  overdue: z.array(topicSummarySchema),
  upcoming: z.array(topicSummarySchema),
  dormant: z.array(topicSummarySchema),
  progress: z.array(
    z.object({
      project: projectRefSchema,
      progress: progressSchema,
      subprojects: z.array(z.object({ id: z.string(), name: z.string(), progress: progressSchema })),
    }),
  ),
  completedThisWeek: z.array(topicSummarySchema),
});
export type Overview = z.infer<typeof overviewSchema>;

export const searchResultSchema = z.object({
  topics: z.array(topicSummarySchema),
  subprojects: z.array(
    subprojectSummarySchema.extend({ projectKey: z.string(), projectName: z.string(), projectColor: colorSchema }),
  ),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const meSchema = z.object({
  user: userSchema,
  myOpenTopicCount: z.number().int(),
  /** Workspace settings the interface needs. */
  dormancyDays: z.number().int(),
});
export type Me = z.infer<typeof meSchema>;

/** Whether the workspace still needs its first account. */
export const setupStatusSchema = z.object({ required: z.boolean() });
export type SetupStatus = z.infer<typeof setupStatusSchema>;

/* ---------- Inputs ---------- */

/** First run: creates the first account, which is admin. Passwords arrive with authentication (J4). */
export const setupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const projectKeySchema = z.string().trim().toUpperCase().regex(PROJECT_KEY_PATTERN, 'Expected 2 to 5 letters');

export const createProjectInputSchema = z.object({
  /** Fixed once created: topic references and links depend on it. */
  key: projectKeySchema,
  name: z.string().trim().min(1).max(120),
  color: colorSchema.optional(),
  description: z.string().max(100_000).optional(),
  status: projectLiveStatusSchema.optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    color: colorSchema,
    description: z.string().max(100_000),
    /** `archived` archives the project; any other status restores it. */
    status: projectStatusSchema,
    startDate: isoDateSchema.nullable(),
    targetDate: isoDateSchema.nullable(),
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const createSubprojectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(100_000).optional(),
  status: projectLiveStatusSchema.optional(),
  targetDate: isoDateSchema.nullable().optional(),
});
export type CreateSubprojectInput = z.infer<typeof createSubprojectInputSchema>;

export const updateSubprojectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(100_000),
    /** `archived` archives the subproject; any other status restores it. */
    status: projectStatusSchema,
    targetDate: isoDateSchema.nullable(),
  })
  .partial();
export type UpdateSubprojectInput = z.infer<typeof updateSubprojectInputSchema>;

export const createTopicInputSchema = z.object({
  projectId: z.string(),
  subprojectId: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).optional(),
  status: topicStatusSchema.optional(),
  priority: topicPrioritySchema.optional(),
  dueDate: isoDateSchema.nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});
export type CreateTopicInput = z.infer<typeof createTopicInputSchema>;

export const updateTopicInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(100_000),
    status: topicStatusSchema,
    priority: topicPrioritySchema,
    dueDate: isoDateSchema.nullable(),
    assigneeId: z.string().nullable(),
    subprojectId: z.string().nullable(),
    labelIds: z.array(z.string()),
    sortOrder: z.string().min(1),
  })
  .partial();
export type UpdateTopicInput = z.infer<typeof updateTopicInputSchema>;

export const createChecklistItemInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemInputSchema>;

export const updateChecklistItemInputSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    done: z.boolean(),
  })
  .partial();
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemInputSchema>;

export const createNoteInputSchema = z.object({
  body: z.string().trim().min(1).max(100_000),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
