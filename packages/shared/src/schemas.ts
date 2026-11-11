import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PROJECT_KEY_PATTERN,
  PROJECT_LIVE_STATUSES,
  PROJECT_STATUSES,
  TOKEN_SCOPES,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  USER_LINK_KINDS,
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

/** A label with the number of topics that carry it (settings and pickers). */
export const labelUsageSchema = labelSchema.extend({ topicCount: z.number().int() });
export type LabelUsage = z.infer<typeof labelUsageSchema>;

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

/** A recent change anywhere in the active projects, for the overview. */
export const recentActivitySchema = projectActivitySchema.extend({ project: projectRefSchema });
export type RecentActivity = z.infer<typeof recentActivitySchema>;

/**
 * The home page. Lists hold their first topics only (`OVERVIEW_GROUP_LIMIT` in progress per project,
 * `OVERVIEW_LIST_LIMIT` otherwise); `totals` and each group's `total` give the full counts.
 */
export const overviewSchema = z.object({
  today: isoDateSchema,
  dormancyDays: z.number().int(),
  activeProjectCount: z.number().int(),
  totals: z.object({
    inProgress: z.number().int(),
    waiting: z.number().int(),
    overdue: z.number().int(),
    upcoming: z.number().int(),
    dormant: z.number().int(),
    completedThisWeek: z.number().int(),
  }),
  inProgress: z.array(
    z.object({ project: projectRefSchema, total: z.number().int(), topics: z.array(topicSummarySchema) }),
  ),
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
  /** Latest changes in the active projects, newest first. */
  recentActivity: z.array(recentActivitySchema),
});
export type Overview = z.infer<typeof overviewSchema>;

/** Where a search found a topic. */
export const SEARCH_FIELDS = ['ref', 'title', 'description', 'note'] as const;
export const searchSegmentSchema = z.object({ text: z.string(), match: z.boolean() });
export type SearchSegment = z.infer<typeof searchSegmentSchema>;

export const searchHitSchema = topicSummarySchema.extend({
  match: z.object({
    field: z.enum(SEARCH_FIELDS),
    /**
     * The matched text cut into plain and matching segments: the whole title for a title match, an excerpt for a
     * description or note match, empty for a reference match.
     */
    segments: z.array(searchSegmentSchema),
  }),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResultSchema = z.object({
  topics: z.array(searchHitSchema),
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

/** Workspace settings an admin changes on the settings page. */
export const workspaceSettingsSchema = z.object({
  /** An open topic without activity for this many days is dormant. */
  dormancyDays: z.number().int().min(1).max(365),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export const updateSettingsInputSchema = workspaceSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

/** Whether the workspace still needs its first account. */
export const setupStatusSchema = z.object({
  required: z.boolean(),
  /**
   * `create`: no account yet, the first one becomes admin. `claim`: accounts exist from before sign-in (J4) and the
   * administrator chooses a password.
   */
  mode: z.enum(['create', 'claim']).nullable(),
  /** The demo data set is loaded: the sign-in page can show its accounts. */
  demo: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

/* ---------- Accounts and access ---------- */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200);

/** An account as administrators see it. */
export const accountSchema = userSchema.extend({
  createdAt: timestampSchema,
  disabled: z.boolean(),
  /** `false` until the person chose a password (pending invitation). */
  hasPassword: z.boolean(),
  lastSeenAt: timestampSchema.nullable(),
});
export type Account = z.infer<typeof accountSchema>;

/** A one-time link to hand over; the token is in the path and only valid once. */
export const userLinkSchema = z.object({
  kind: z.enum(USER_LINK_KINDS),
  /** Path in the app, e.g. `/lien/…`: prefix it with the address of the server. */
  path: z.string(),
  expiresAt: timestampSchema,
});
export type UserLink = z.infer<typeof userLinkSchema>;

export const linkInfoSchema = z.object({ kind: z.enum(USER_LINK_KINDS), name: z.string(), email: z.string() });
export type LinkInfo = z.infer<typeof linkInfoSchema>;

export const apiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** First characters of the secret, to tell tokens apart. */
  prefix: z.string(),
  scope: z.enum(TOKEN_SCOPES),
  lastUsedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

/** The secret is only ever returned here, once. */
export const createdTokenSchema = z.object({ token: apiTokenSchema, secret: z.string() });
export type CreatedToken = z.infer<typeof createdTokenSchema>;

/* ---------- Backups, export and import ---------- */

export const backupInfoSchema = z.object({
  /** File name in the backup folder, e.g. `cairn-20261109-030000.db`. */
  name: z.string(),
  size: z.number().int(),
  createdAt: timestampSchema,
});
export type BackupInfo = z.infer<typeof backupInfoSchema>;

const nullableTimestamp = timestampSchema.nullable();

/**
 * The whole workspace as JSON, to read elsewhere or to move to another instance. Version 1. No passwords, sessions
 * or API tokens: imported accounts get a link to choose their password.
 */
export const workspaceExportSchema = z.object({
  format: z.literal('cairn-export'),
  version: z.literal(1),
  exportedAt: timestampSchema,
  settings: z.object({ dormancyDays: z.number().int().min(1).max(365).optional() }),
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      email: z.string().min(3),
      role: userRoleSchema,
      createdAt: timestampSchema,
      disabledAt: nullableTimestamp,
    }),
  ),
  labels: z.array(z.object({ id: z.string(), name: z.string().min(1), color: colorSchema })),
  projects: z.array(
    z.object({
      id: z.string(),
      key: z.string().regex(PROJECT_KEY_PATTERN),
      name: z.string().min(1),
      description: z.string(),
      color: colorSchema,
      icon: z.string().nullable(),
      status: projectStatusSchema,
      startDate: isoDateSchema.nullable(),
      targetDate: isoDateSchema.nullable(),
      sortOrder: z.string(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
      archivedAt: nullableTimestamp,
    }),
  ),
  subprojects: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      name: z.string().min(1),
      description: z.string(),
      status: projectStatusSchema,
      targetDate: isoDateSchema.nullable(),
      sortOrder: z.string(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
      archivedAt: nullableTimestamp,
    }),
  ),
  topics: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      subprojectId: z.string().nullable(),
      number: z.number().int().positive(),
      title: z.string().min(1),
      description: z.string(),
      status: topicStatusSchema,
      priority: topicPrioritySchema,
      dueDate: isoDateSchema.nullable(),
      assigneeId: z.string().nullable(),
      sortOrder: z.string(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
      lastActivityAt: timestampSchema,
      completedAt: nullableTimestamp,
    }),
  ),
  topicLabels: z.array(z.object({ topicId: z.string(), labelId: z.string() })),
  checklistItems: z.array(
    z.object({ id: z.string(), topicId: z.string(), text: z.string(), done: z.boolean(), sortOrder: z.string() }),
  ),
  notes: z.array(
    z.object({
      id: z.string(),
      topicId: z.string(),
      authorId: z.string().nullable(),
      body: z.string(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
    }),
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      entityType: z.enum(['project', 'subproject', 'topic']),
      entityId: z.string(),
      actorId: z.string().nullable(),
      action: z.string(),
      payload: z.record(z.string(), z.unknown()),
      createdAt: timestampSchema,
    }),
  ),
});
export type WorkspaceExport = z.infer<typeof workspaceExportSchema>;

export const importResultSchema = z.object({
  projects: z.number().int(),
  topics: z.number().int(),
  /** Accounts created by the import: they need a link from an administrator to choose a password. */
  newAccounts: z.number().int(),
});
export type ImportResult = z.infer<typeof importResultSchema>;

/* ---------- Inputs ---------- */

/** First run (`create`, name required) or claiming the administrator account of an install from before J4. */
export const setupInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: emailSchema,
  password: newPasswordSchema,
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const useLinkInputSchema = z.object({ password: newPasswordSchema });

export const createAccountInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  role: userRoleSchema.default('member'),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.object({ role: userRoleSchema, disabled: z.boolean() }).partial();
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

export const updateMeInputSchema = z.object({ name: z.string().trim().min(1).max(120), email: emailSchema }).partial();
export type UpdateMeInput = z.infer<typeof updateMeInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const createLabelInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** Defaults to the first palette color no label uses yet. */
  color: colorSchema.optional(),
});
export type CreateLabelInput = z.infer<typeof createLabelInputSchema>;

export const updateLabelInputSchema = z
  .object({ name: z.string().trim().min(1).max(40), color: colorSchema })
  .partial();
export type UpdateLabelInput = z.infer<typeof updateLabelInputSchema>;

export const createTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(TOKEN_SCOPES),
});
export type CreateTokenInput = z.infer<typeof createTokenInputSchema>;

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
    /** Position in the sidebar (fractional key); moving a project is not logged. */
    sortOrder: z.string().min(1),
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
    /** Position within the project (fractional key); moving a subproject is not logged. */
    sortOrder: z.string().min(1),
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

/** The same change on several topics at once (multi-select). Labels are added or removed, not replaced. */
export const bulkTopicPatchSchema = updateTopicInputSchema
  .pick({ status: true, priority: true, dueDate: true, assigneeId: true, subprojectId: true })
  .extend({
    addLabelIds: z.array(z.string()).max(50),
    removeLabelIds: z.array(z.string()).max(50),
  })
  .partial();
export type BulkTopicPatch = z.infer<typeof bulkTopicPatchSchema>;

export const bulkUpdateTopicsInputSchema = z.object({
  refs: z.array(z.string()).min(1).max(200),
  patch: bulkTopicPatchSchema,
});
export type BulkUpdateTopicsInput = z.infer<typeof bulkUpdateTopicsInputSchema>;

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
