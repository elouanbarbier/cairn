import {
  addDays,
  COMPLETED_WINDOW_DAYS,
  isClosed,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  type TopicPriority,
  type TopicStatus,
  type TopicSummary,
  toISODate,
  UPCOMING_WINDOW_DAYS,
} from '@cairn/shared';
import { normalize } from '@/lib/utils';
import type { ViewSearch } from '@/router';

/** Order of statuses in lists: what moves first, closed last. */
export const LIST_STATUS_ORDER: TopicStatus[] = ['in_progress', 'waiting', 'todo', 'backlog', 'done', 'cancelled'];

const parseList = <T extends string>(value: string | undefined, allowed: readonly T[]): T[] =>
  value ? value.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)) : [];

/** Due-date filters: late (open topics only), due in the next 7 days, or without a due date. */
export const DUE_FILTERS = ['overdue', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

/** `none` stands for unassigned topics in the assignee filter. */
export const UNASSIGNED = 'none';

export interface ParsedFilters {
  q: string;
  statuses: TopicStatus[];
  priorities: TopicPriority[];
  labels: string[];
  due: DueFilter[];
  assignees: string[];
}

const ids = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : []);

export function parseFilters(search: ViewSearch): ParsedFilters {
  return {
    q: search.q ?? '',
    statuses: parseList(search.status, TOPIC_STATUSES),
    priorities: parseList(search.priority, TOPIC_PRIORITIES),
    labels: ids(search.label),
    due: parseList(search.due, DUE_FILTERS),
    assignees: ids(search.assignee),
  };
}

/** Number of active filters, the text filter included. */
export function filterCount(f: ParsedFilters) {
  return f.statuses.length + f.priorities.length + f.labels.length + f.due.length + f.assignees.length + (f.q ? 1 : 0);
}

export function hasFilters(f: ParsedFilters) {
  return filterCount(f) > 0;
}

function matchesDue(topic: TopicSummary, due: DueFilter[], today: string) {
  return due.some((d) => {
    if (d === 'none') return topic.dueDate === null;
    if (topic.dueDate === null || isClosed(topic.status)) return false;
    if (d === 'overdue') return topic.dueDate < today;
    return topic.dueDate >= today && topic.dueDate <= addDays(today, UPCOMING_WINDOW_DAYS);
  });
}

/**
 * Applies the view filters. In lists, without an explicit status filter,
 * closed topics only show when they were closed in the last week (the kanban
 * shows every done topic and folds them itself).
 */
export function filterTopics(
  topics: TopicSummary[],
  f: ParsedFilters,
  now: Date,
  { recentClosedOnly = true }: { recentClosedOnly?: boolean } = {},
): TopicSummary[] {
  const q = normalize(f.q.trim());
  const today = toISODate(now);
  const recent = recentClosedOnly ? now.getTime() - COMPLETED_WINDOW_DAYS * 86_400_000 : 0;
  return topics.filter((t) => {
    if (
      f.statuses.length > 0
        ? !f.statuses.includes(t.status)
        : isClosed(t.status) && new Date(t.completedAt ?? 0).getTime() < recent
    ) {
      return false;
    }
    if (f.priorities.length > 0 && !f.priorities.includes(t.priority)) return false;
    if (f.labels.length > 0 && !t.labels.some((l) => f.labels.includes(l.id))) return false;
    if (f.due.length > 0 && !matchesDue(t, f.due, today)) return false;
    if (f.assignees.length > 0 && !f.assignees.includes(t.assignee?.id ?? UNASSIGNED)) return false;
    if (q && !normalize(t.title).includes(q) && !normalize(t.ref).includes(q)) return false;
    return true;
  });
}
