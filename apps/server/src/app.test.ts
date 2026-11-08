import type { Me, Overview, ProjectSummary, SearchResult, TopicDetail, TopicSummary } from '@cairn/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi } from './app.ts';
import { openDatabase } from './db/index.ts';
import { createRepo } from './repo.ts';
import { seedDemo } from './seed/demo.ts';

const NOW = new Date('2026-11-07T19:00:00');
let clock = NOW;
let api: ReturnType<typeof createApi>;

beforeEach(() => {
  clock = NOW;
  const { db } = openDatabase(':memory:');
  seedDemo(db, NOW);
  api = createApi(createRepo(db, { now: () => clock }));
});

async function get<T>(path: string): Promise<T> {
  const res = await api.request(path);
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
}

async function send<T>(method: string, path: string, payload: unknown, status = 200): Promise<T> {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  expect(res.status, `${method} ${path}`).toBe(status);
  return (await res.json()) as T;
}

describe('overview', () => {
  it('answers the four questions on the demo data', async () => {
    const overview = await get<Overview>('/overview?today=2026-11-07');
    expect(overview.activeProjectCount).toBe(3);
    expect(overview.inProgress.flatMap((g) => g.topics)).toHaveLength(6);
    expect(overview.waiting.map((t) => t.ref)).toEqual(['POR-22', 'POR-27', 'AIDE-11']);
    expect(overview.overdue.map((t) => t.ref)).toEqual(['AIDE-7', 'POR-29']);
    expect(overview.upcoming.map((t) => t.ref)).toEqual(['AIDE-9', 'OUT-3', 'POR-24', 'POR-31']);
    expect(overview.dormant.map((t) => t.ref)).toEqual(['POR-12', 'AIDE-5', 'OUT-6']);
    expect(overview.completedThisWeek).toHaveLength(5);
  });
});

describe('projects', () => {
  it('computes counters and progress', async () => {
    const project = await get<ProjectSummary>('/projects/POR');
    expect(project.openCount).toBe(13);
    expect(project.progress).toEqual({ done: 14, total: 27 });
    expect(project.subprojects.map((s) => [s.name, s.openCount])).toEqual([
      ['Formulaires avancés', 5],
      ['Gestion des erreurs', 3],
      ['FAQ dynamique', 3],
      ['Recette', 2],
    ]);
  });

  it('returns 404 for an unknown project', async () => {
    const res = await api.request('/projects/NOPE');
    expect(res.status).toBe(404);
  });
});

describe('topics', () => {
  it('reads a topic by reference with its checklist, notes and activity', async () => {
    const topic = await get<TopicDetail>('/topics/POR-24');
    expect(topic.title).toBe("Validation conditionnelle du formulaire d'adhésion");
    expect(topic.checklist).toEqual({ done: 3, total: 5 });
    expect(topic.labels.map((l) => l.name)).toEqual(['Front', 'Règles métier']);
    expect(topic.notes).toHaveLength(2);
    expect(topic.activity.at(-1)?.action).toBe('created');
  });

  it('logs status changes and bumps last activity', async () => {
    clock = new Date('2026-11-08T09:00:00');
    const before = await get<TopicDetail>('/topics/POR-12');
    const updated = await send<TopicDetail>('PATCH', '/topics/POR-12', { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.lastActivityAt > before.lastActivityAt).toBe(true);
    expect(updated.activity[0]?.action).toBe('status_changed');
    expect(updated.activity[0]?.payload).toEqual({ from: 'todo', to: 'in_progress' });
  });

  it('sets and clears completion when closing and reopening', async () => {
    const done = await send<TopicDetail>('PATCH', '/topics/POR-28', { status: 'done' });
    expect(done.completedAt).not.toBeNull();
    const reopened = await send<TopicDetail>('PATCH', '/topics/POR-28', { status: 'todo' });
    expect(reopened.completedAt).toBeNull();
  });

  it('reorders without counting as activity', async () => {
    const before = await get<TopicDetail>('/topics/POR-12');
    clock = new Date('2026-11-09T09:00:00');
    const moved = await send<TopicDetail>('PATCH', '/topics/POR-12', { sortOrder: '0V' });
    expect(moved.sortOrder).toBe('0V');
    expect(moved.lastActivityAt).toBe(before.lastActivityAt);
  });

  it('creates topics with the next number of the project', async () => {
    const project = await get<ProjectSummary>('/projects/POR');
    const created = await send<TopicDetail>(
      'POST',
      '/topics',
      { projectId: project.id, subprojectId: project.subprojects[0]?.id, title: 'Nouveau sujet de test' },
      201,
    );
    expect(created.ref).toBe('POR-36');
    expect(created.status).toBe('todo');
  });

  it('rejects invalid input', async () => {
    await send('PATCH', '/topics/POR-24', { status: 'nope' }, 400);
    await send('PATCH', '/topics/POR-24', { dueDate: '12/11/2026' }, 400);
  });

  it('toggles checklist items and adds notes', async () => {
    const topic = await get<TopicDetail>('/topics/POR-24');
    const item = topic.checklistItems.find((i) => !i.done);
    if (!item) throw new Error('expected an open checklist item');
    await send('PATCH', `/checklist/${item.id}`, { done: true });
    await send('POST', '/topics/POR-24/notes', { body: 'Tests mobiles terminés.' }, 201);
    const after = await get<TopicDetail>('/topics/POR-24');
    expect(after.checklist.done).toBe(4);
    expect(after.notes.at(-1)?.body).toBe('Tests mobiles terminés.');
  });

  it('filters topics by subproject and assignee', async () => {
    const project = await get<ProjectSummary>('/projects/POR');
    const sub = project.subprojects[0];
    const topics = await get<TopicSummary[]>(`/topics?subproject=${sub?.id}`);
    expect(topics.every((t) => t.subprojectName === 'Formulaires avancés')).toBe(true);
    const me = await get<Me>('/me');
    const mine = await get<TopicSummary[]>('/topics?assignee=me');
    expect(mine.every((t) => t.assignee?.id === me.user.id)).toBe(true);
  });
});

describe('search', () => {
  it('matches titles without accents and references', async () => {
    const byTitle = await get<SearchResult>(`/search?q=${encodeURIComponent('etapes')}`);
    expect(byTitle.topics.map((t) => t.ref)).toContain('POR-16');
    const byRef = await get<SearchResult>('/search?q=POR-24');
    expect(byRef.topics[0]?.ref).toBe('POR-24');
    const subs = await get<SearchResult>('/search?q=form');
    expect(subs.subprojects.map((s) => s.name)).toEqual(['Formulaires avancés']);
  });
});

describe('openapi', () => {
  it('documents the API', async () => {
    const doc = await get<{ paths: Record<string, unknown> }>('/openapi.json');
    expect(Object.keys(doc.paths)).toContain('/topics/{ref}');
  });
});
