import {
  COMPLETED_WINDOW_DAYS,
  isClosed,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  type TopicPriority,
  type TopicStatus,
  type TopicSummary,
} from '@cairn/shared';
import { normalize } from '@/lib/utils';
import type { ViewSearch } from '@/router';

/** Order of statuses in lists: what moves first, closed last. */
export const LIST_STATUS_ORDER: TopicStatus[] = ['in_progress', 'waiting', 'todo', 'backlog', 'done', 'cancelled'];

const parseList = <T extends string>(value: string | undefined, allowed: readonly T[]): T[] =>
  value ? value.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)) : [];

export interface ParsedFilters {
  q: string;
  statuses: TopicStatus[];
  priorities: TopicPriority[];
}

export function parseFilters(search: ViewSearch): ParsedFilters {
  return {
    q: search.q ?? '',
    statuses: parseList(search.status, TOPIC_STATUSES),
    priorities: parseList(search.priority, TOPIC_PRIORITIES),
  };
}

export function hasFilters(f: ParsedFilters) {
  return f.q.length > 0 || f.statuses.length > 0 || f.priorities.length > 0;
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
    if (q && !normalize(t.title).includes(q) && !normalize(t.ref).includes(q)) return false;
    return true;
  });
}
