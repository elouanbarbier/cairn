/** Topic statuses. Names are fixed in v1; each belongs to one category. */
export const TOPIC_STATUSES = ['backlog', 'todo', 'in_progress', 'waiting', 'done', 'cancelled'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

/**
 * - `unsorted`: Backlog, not triaged yet (never dormant).
 * - `open`: work that should move (counts for dormancy).
 * - `closed`: finished or abandoned.
 */
export type StatusCategory = 'unsorted' | 'open' | 'closed';

export const STATUS_CATEGORY: Record<TopicStatus, StatusCategory> = {
  backlog: 'unsorted',
  todo: 'open',
  in_progress: 'open',
  waiting: 'open',
  done: 'closed',
  cancelled: 'closed',
};

/** Columns shown on a kanban board, left to right. Cancelled topics are hidden. */
export const KANBAN_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'waiting',
  'done',
] as const satisfies readonly TopicStatus[];

export const TOPIC_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TopicPriority = (typeof TOPIC_PRIORITIES)[number];

/** Higher means more urgent; used for sorting. */
export const PRIORITY_RANK: Record<TopicPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
/** Statuses a project or subproject can be given directly; `archived` goes through archiving. */
export const PROJECT_LIVE_STATUSES = ['active', 'paused', 'completed'] as const satisfies readonly ProjectStatus[];

/**
 * Colors offered for new projects. They are data (stored per project), not interface tokens.
 * Each one reads on both the light and dark themes.
 */
export const PROJECT_COLORS = [
  '#6366F1',
  '#0D9488',
  '#9333EA',
  '#E11D48',
  '#D97706',
  '#0284C7',
  '#16A34A',
  '#DB2777',
  '#64748B',
] as const;

export const USER_ROLES = ['admin', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_DORMANCY_DAYS = 14;
export const UPCOMING_WINDOW_DAYS = 7;
export const COMPLETED_WINDOW_DAYS = 7;

/** Project keys are 2 to 5 uppercase letters, e.g. `CFE`. */
export const PROJECT_KEY_PATTERN = /^[A-Z]{2,5}$/;
/** Human-readable topic reference, e.g. `CFE-12`. */
export const TOPIC_REF_PATTERN = /^([A-Z]{2,5})-(\d+)$/;
