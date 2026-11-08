import {
  COMPLETED_WINDOW_DAYS,
  PRIORITY_RANK,
  STATUS_CATEGORY,
  TOPIC_REF_PATTERN,
  type TopicStatus,
  UPCOMING_WINDOW_DAYS,
} from './constants.ts';
import { addDays, elapsedDays, toISODate } from './dates.ts';
import type { Overview, Progress, ProjectRef, ProjectSummary, TopicSummary } from './schemas.ts';

export const isClosed = (status: TopicStatus): boolean => STATUS_CATEGORY[status] === 'closed';
/** In the `open` category: To do, In progress, Waiting. Backlog is not open. */
export const isOpen = (status: TopicStatus): boolean => STATUS_CATEGORY[status] === 'open';

export function formatTopicRef(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

export function parseTopicRef(ref: string): { projectKey: string; number: number } | null {
  const match = TOPIC_REF_PATTERN.exec(ref.toUpperCase());
  if (!match?.[1] || !match[2]) return null;
  return { projectKey: match[1], number: Number(match[2]) };
}

/** Progress = done topics / topics that are not cancelled. */
export function computeProgress(statuses: readonly TopicStatus[]): Progress {
  let done = 0;
  let total = 0;
  for (const status of statuses) {
    if (status === 'cancelled') continue;
    total++;
    if (status === 'done') done++;
  }
  return { done, total };
}

export function progressRatio({ done, total }: Progress): number {
  return total === 0 ? 0 : done / total;
}

/** Open topic whose last activity is at least `dormancyDays` old. */
export function isDormant(
  topic: Pick<TopicSummary, 'status' | 'lastActivityAt'>,
  now: Date,
  dormancyDays: number,
): boolean {
  return isOpen(topic.status) && elapsedDays(topic.lastActivityAt, now) >= dormancyDays;
}

export function compareByPriorityThenDue(a: TopicSummary, b: TopicSummary): number {
  const rank = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rank !== 0) return rank;
  return compareDue(a, b);
}

function compareDue(a: TopicSummary, b: TopicSummary): number {
  if (a.dueDate === b.dueDate) return a.sortOrder < b.sortOrder ? -1 : 1;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

export interface OverviewInput {
  /** Every topic of active projects. */
  topics: readonly TopicSummary[];
  /** Active projects, in sidebar order. */
  projects: readonly ProjectSummary[];
  now: Date;
  /** Calendar date of the viewer, defaults to the local date of `now`. */
  today?: string;
  dormancyDays: number;
}

/** Builds the overview: what moves, what is stuck, what is due, what sleeps. */
export function buildOverview({
  topics,
  projects,
  now,
  today = toISODate(now),
  dormancyDays,
}: OverviewInput): Overview {
  const toRef = (p: ProjectSummary): ProjectRef => ({ id: p.id, key: p.key, name: p.name, color: p.color });
  const upcomingLimit = addDays(today, UPCOMING_WINDOW_DAYS);
  const completedSince = now.getTime() - COMPLETED_WINDOW_DAYS * 86_400_000;

  const inProgress = projects
    .map((project) => ({
      project: toRef(project),
      topics: topics
        .filter((t) => t.projectId === project.id && t.status === 'in_progress')
        .sort(compareByPriorityThenDue),
    }))
    .filter((group) => group.topics.length > 0);

  const waiting = topics
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => (a.waitingSince ?? a.lastActivityAt).localeCompare(b.waitingSince ?? b.lastActivityAt));

  const withDue = topics.filter((t) => t.dueDate !== null && !isClosed(t.status));
  const overdue = withDue.filter((t) => (t.dueDate as string) < today).sort(compareDue);
  const upcoming = withDue
    .filter((t) => (t.dueDate as string) >= today && (t.dueDate as string) <= upcomingLimit)
    .sort(compareDue);

  const dormant = topics
    .filter((t) => isDormant(t, now, dormancyDays))
    .sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt));

  const progress = projects.map((project) => ({
    project: toRef(project),
    progress: project.progress,
    subprojects: project.subprojects.map((s) => ({ id: s.id, name: s.name, progress: s.progress })),
  }));

  const completedThisWeek = topics
    .filter((t) => t.status === 'done' && t.completedAt !== null && new Date(t.completedAt).getTime() >= completedSince)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return {
    today,
    dormancyDays,
    activeProjectCount: projects.length,
    inProgress,
    waiting,
    overdue,
    upcoming,
    dormant,
    progress,
    completedThisWeek,
  };
}
