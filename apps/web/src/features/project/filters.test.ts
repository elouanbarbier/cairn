import type { TopicSummary } from '@cairn/shared';
import { describe, expect, it } from 'vitest';
import { filterTopics, hasFilters, parseFilters } from './filters';

const now = new Date('2026-11-07T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function topic(overrides: Partial<TopicSummary>): TopicSummary {
  return {
    id: overrides.ref ?? 'x',
    ref: 'POR-1',
    number: 1,
    projectId: 'p',
    projectKey: 'POR',
    projectName: 'Portail client',
    projectColor: '#6366F1',
    subprojectId: null,
    subprojectName: null,
    title: 'Sujet',
    status: 'todo',
    priority: 'none',
    dueDate: null,
    assignee: null,
    labels: [],
    checklist: { done: 0, total: 0 },
    sortOrder: 'V',
    createdAt: daysAgo(20),
    lastActivityAt: daysAgo(1),
    completedAt: null,
    waitingSince: null,
    ...overrides,
  };
}

const topics = [
  topic({ ref: 'POR-1', title: 'Validation du formulaire', status: 'in_progress', priority: 'high' }),
  topic({ ref: 'POR-2', title: 'Étapes en accordéon', status: 'done', completedAt: daysAgo(2) }),
  topic({ ref: 'POR-3', title: 'Ancien sujet fermé', status: 'done', completedAt: daysAgo(30) }),
  topic({ ref: 'POR-4', title: 'Recette', status: 'backlog', priority: 'low' }),
];

describe('parseFilters', () => {
  it('keeps only known statuses and priorities', () => {
    const f = parseFilters({ status: 'todo,nope,done', priority: 'high,zzz', q: 'form' });
    expect(f).toMatchObject({ q: 'form', statuses: ['todo', 'done'], priorities: ['high'] });
    expect(hasFilters(f)).toBe(true);
    expect(hasFilters(parseFilters({}))).toBe(false);
  });
});

describe('filterTopics', () => {
  it('hides topics closed more than a week ago in lists', () => {
    const refs = filterTopics(topics, parseFilters({}), now).map((t) => t.ref);
    expect(refs).toEqual(['POR-1', 'POR-2', 'POR-4']);
  });

  it('keeps every closed topic for the kanban', () => {
    expect(filterTopics(topics, parseFilters({}), now, { recentClosedOnly: false })).toHaveLength(4);
  });

  it('matches text without accents and by reference', () => {
    expect(filterTopics(topics, parseFilters({ q: 'etapes' }), now).map((t) => t.ref)).toEqual(['POR-2']);
    expect(filterTopics(topics, parseFilters({ q: 'por-4' }), now).map((t) => t.ref)).toEqual(['POR-4']);
  });

  it('applies an explicit status filter, closed topics included', () => {
    expect(filterTopics(topics, parseFilters({ status: 'done' }), now).map((t) => t.ref)).toEqual(['POR-2', 'POR-3']);
  });

  it('filters by label, due date and assignee', () => {
    const front = { id: 'l1', name: 'Front', color: '#6366F1' };
    const ada = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' as const };
    const more = [
      topic({ ref: 'A-1', labels: [front], assignee: ada, dueDate: '2026-11-01' }),
      topic({ ref: 'A-2', dueDate: '2026-11-10' }),
      topic({ ref: 'A-3', dueDate: '2026-11-01', status: 'done', completedAt: daysAgo(1) }),
      topic({ ref: 'A-4' }),
    ];
    const refs = (search: Parameters<typeof parseFilters>[0]) =>
      filterTopics(more, parseFilters(search), now).map((t) => t.ref);
    expect(refs({ label: 'l1' })).toEqual(['A-1']);
    // A closed topic is never late.
    expect(refs({ due: 'overdue' })).toEqual(['A-1']);
    expect(refs({ due: 'week' })).toEqual(['A-2']);
    expect(refs({ due: 'none,week' })).toEqual(['A-2', 'A-4']);
    expect(refs({ assignee: 'u1' })).toEqual(['A-1']);
    expect(refs({ assignee: 'none' })).toEqual(['A-2', 'A-3', 'A-4']);
  });

  it('filters by priority', () => {
    expect(filterTopics(topics, parseFilters({ priority: 'high,low' }), now).map((t) => t.ref)).toEqual([
      'POR-1',
      'POR-4',
    ]);
  });
});
