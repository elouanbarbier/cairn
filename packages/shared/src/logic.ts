import {
  COMPLETED_WINDOW_DAYS,
  PRIORITY_RANK,
  PROJECT_COLORS,
  PROJECT_KEY_PATTERN,
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

/** What the overview needs to know about a topic to place it. */
export type OverviewTopic = Pick<
  TopicSummary,
  | 'id'
  | 'projectId'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'sortOrder'
  | 'lastActivityAt'
  | 'completedAt'
  | 'waitingSince'
>;

export interface OverviewInput<T extends OverviewTopic> {
  /** Every topic of active projects that can matter: open, unsorted with a due date, or done this week. */
  topics: readonly T[];
  /** Active projects, in sidebar order. */
  projects: readonly ProjectSummary[];
  now: Date;
  /** Calendar date of the viewer, defaults to the local date of `now`. */
  today?: string;
  dormancyDays: number;
}

/** The overview's lists, complete and sorted; the server keeps the first few of each with their totals. */
export interface OverviewSelection<T> {
  today: string;
  dormancyDays: number;
  activeProjectCount: number;
  inProgress: Array<{ project: ProjectRef; topics: T[] }>;
  waiting: T[];
  overdue: T[];
  upcoming: T[];
  dormant: T[];
  progress: Overview['progress'];
  completedThisWeek: T[];
}

function compareDueOf(a: OverviewTopic, b: OverviewTopic): number {
  if (a.dueDate === b.dueDate) return a.sortOrder < b.sortOrder ? -1 : 1;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

/** Builds the overview: what moves, what is stuck, what is due, what sleeps. Recent activity comes from the log. */
export function buildOverview<T extends OverviewTopic>({
  topics,
  projects,
  now,
  today = toISODate(now),
  dormancyDays,
}: OverviewInput<T>): OverviewSelection<T> {
  const toRef = (p: ProjectSummary): ProjectRef => ({ id: p.id, key: p.key, name: p.name, color: p.color });
  const upcomingLimit = addDays(today, UPCOMING_WINDOW_DAYS);
  const completedSince = now.getTime() - COMPLETED_WINDOW_DAYS * 86_400_000;
  const byPriorityThenDue = (a: T, b: T) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || compareDueOf(a, b);

  const inProgress = projects
    .map((project) => ({
      project: toRef(project),
      topics: topics.filter((t) => t.projectId === project.id && t.status === 'in_progress').sort(byPriorityThenDue),
    }))
    .filter((group) => group.topics.length > 0);

  const waiting = topics
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => (a.waitingSince ?? a.lastActivityAt).localeCompare(b.waitingSince ?? b.lastActivityAt));

  const withDue = topics.filter((t) => t.dueDate !== null && !isClosed(t.status));
  const overdue = withDue.filter((t) => (t.dueDate as string) < today).sort(compareDueOf);
  const upcoming = withDue
    .filter((t) => (t.dueDate as string) >= today && (t.dueDate as string) <= upcomingLimit)
    .sort(compareDueOf);

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

/** Short words left out when building a key from initials ("Centre d'aide" → `CA`). */
const KEY_STOPWORDS = new Set([
  'A',
  'AU',
  'AUX',
  'D',
  'DE',
  'DES',
  'DU',
  'ET',
  'EN',
  'L',
  'LA',
  'LE',
  'LES',
  'UN',
  'UNE',
  'AN',
  'AND',
  'FOR',
  'IN',
  'OF',
  'THE',
  'TO',
]);

/**
 * Suggests a free project key from a name: initials for several words ("Portail client" → `PC`), else the first
 * letters ("Cairn" → `CAI`), with longer variants when a key is taken. Returns `''` when the name has no letters.
 */
export function suggestProjectKey(name: string, taken: Iterable<string> = []): string {
  const used = new Set([...taken].map((k) => k.toUpperCase()));
  const all = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  if (all.length === 0) return '';
  const meaningful = all.filter((w) => !KEY_STOPWORDS.has(w));
  const words = meaningful.length > 0 ? meaningful : all;
  const letters = words.join('');

  const candidates: string[] = [];
  if (words.length >= 2)
    candidates.push(
      words
        .slice(0, 4)
        .map((w) => w[0])
        .join(''),
    );
  candidates.push(letters.slice(0, 3), letters.slice(0, 4), letters.slice(0, 5), letters.slice(0, 2));
  const base = letters.length >= 2 ? letters.slice(0, 4) : letters.padEnd(2, letters);
  for (let code = 65; code <= 90; code++) candidates.push(base + String.fromCharCode(code));

  return candidates.find((key) => PROJECT_KEY_PATTERN.test(key) && !used.has(key)) ?? '';
}

/** First palette color no project uses yet, cycling once all are taken. */
export function nextProjectColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  return PROJECT_COLORS.find((c) => !taken.has(c)) ?? PROJECT_COLORS[used.length % PROJECT_COLORS.length] ?? '#6366F1';
}
