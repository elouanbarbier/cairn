import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from './dates.ts';
import { buildOverview, computeProgress, isDormant, parseTopicRef } from './logic.ts';
import type { ProjectSummary, TopicSummary } from './schemas.ts';

const now = new Date('2026-11-07T18:00:00');
const today = '2026-11-07';
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const project: ProjectSummary = {
  id: 'p1',
  key: 'POR',
  name: 'Portail client',
  description: '',
  color: '#6366F1',
  icon: null,
  status: 'active',
  startDate: null,
  targetDate: null,
  sortOrder: 'V',
  openCount: 0,
  progress: { done: 1, total: 3 },
  subprojects: [],
};

let counter = 0;
function topic(overrides: Partial<TopicSummary>): TopicSummary {
  counter++;
  return {
    id: `t${counter}`,
    ref: `POR-${counter}`,
    number: counter,
    projectId: 'p1',
    projectKey: 'POR',
    projectName: 'Portail client',
    projectColor: '#6366F1',
    subprojectId: null,
    subprojectName: null,
    title: `Topic ${counter}`,
    status: 'todo',
    priority: 'none',
    dueDate: null,
    assignee: null,
    labels: [],
    checklist: { done: 0, total: 0 },
    sortOrder: `a${counter}`,
    createdAt: daysAgo(30),
    lastActivityAt: daysAgo(1),
    completedAt: null,
    waitingSince: null,
    ...overrides,
  };
}

describe('dates', () => {
  it('adds and diffs calendar days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(diffDays('2026-11-07', '2026-11-12')).toBe(5);
    expect(diffDays('2026-11-07', '2026-11-04')).toBe(-3);
  });
});

describe('parseTopicRef', () => {
  it('parses a valid reference', () => {
    expect(parseTopicRef('POR-24')).toEqual({ projectKey: 'POR', number: 24 });
    expect(parseTopicRef('por-7')).toEqual({ projectKey: 'POR', number: 7 });
  });
  it('rejects invalid references', () => {
    expect(parseTopicRef('POR')).toBeNull();
    expect(parseTopicRef('TOOLONG-1')).toBeNull();
  });
});

describe('computeProgress', () => {
  it('ignores cancelled topics', () => {
    expect(computeProgress(['done', 'done', 'todo', 'cancelled', 'backlog'])).toEqual({ done: 2, total: 4 });
  });
});

describe('isDormant', () => {
  it('flags open topics idle for the threshold or more', () => {
    expect(isDormant({ status: 'todo', lastActivityAt: daysAgo(14) }, now, 14)).toBe(true);
    expect(isDormant({ status: 'todo', lastActivityAt: daysAgo(13) }, now, 14)).toBe(false);
  });
  it('never flags backlog or closed topics', () => {
    expect(isDormant({ status: 'backlog', lastActivityAt: daysAgo(60) }, now, 14)).toBe(false);
    expect(isDormant({ status: 'done', lastActivityAt: daysAgo(60) }, now, 14)).toBe(false);
  });
});

describe('buildOverview', () => {
  const topics = [
    topic({ status: 'in_progress', priority: 'low' }),
    topic({ status: 'in_progress', priority: 'urgent', dueDate: addDays(today, 2) }),
    topic({ status: 'waiting', waitingSince: daysAgo(3) }),
    topic({ status: 'waiting', waitingSince: daysAgo(9) }),
    topic({ status: 'todo', dueDate: addDays(today, -3) }),
    topic({ status: 'todo', dueDate: addDays(today, 8) }),
    topic({ status: 'done', dueDate: addDays(today, -1), completedAt: daysAgo(2) }),
    topic({ status: 'done', completedAt: daysAgo(10) }),
    topic({ status: 'todo', lastActivityAt: daysAgo(20) }),
    topic({ status: 'backlog', lastActivityAt: daysAgo(40) }),
  ];
  const overview = buildOverview({ topics, projects: [project], now, today, dormancyDays: 14 });

  it('groups in-progress topics by project, most urgent first', () => {
    expect(overview.inProgress).toHaveLength(1);
    expect(overview.inProgress[0]?.topics.map((t) => t.priority)).toEqual(['urgent', 'low']);
  });

  it('lists waiting topics, oldest first', () => {
    expect(overview.waiting.map((t) => t.waitingSince)).toEqual([daysAgo(9), daysAgo(3)]);
  });

  it('splits overdue and next 7 days, ignoring closed topics', () => {
    expect(overview.overdue).toHaveLength(1);
    expect(overview.upcoming).toHaveLength(1);
    expect(overview.upcoming[0]?.dueDate).toBe(addDays(today, 2));
  });

  it('detects dormant topics only in the open category', () => {
    expect(overview.dormant).toHaveLength(1);
    expect(overview.dormant[0]?.status).toBe('todo');
  });

  it('keeps topics completed in the last 7 days', () => {
    expect(overview.completedThisWeek).toHaveLength(1);
  });
});
