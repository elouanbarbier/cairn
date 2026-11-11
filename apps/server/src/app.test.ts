import type {
  Me,
  Overview,
  ProjectActivity,
  ProjectSummary,
  SearchResult,
  SetupStatus,
  SubprojectSummary,
  TopicDetail,
  TopicSummary,
  User,
} from '@cairn/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccounts } from './accounts.ts';
import { createApi, SESSION_COOKIE } from './app.ts';
import { openDatabase } from './db/index.ts';
import { createRepo } from './repo.ts';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from './seed/demo.ts';

const NOW = new Date('2026-11-07T19:00:00');
let clock = NOW;
let api: ReturnType<typeof createApi>;
/** Requests run as the demo administrator, signed in with a session cookie. */
let cookie = '';

/** A fresh API over `db`; returns the accounts too. */
function build(db: ReturnType<typeof openDatabase>['db']) {
  const accounts = createAccounts(db, { now: () => clock });
  api = createApi(createRepo(db, { now: () => clock }), accounts);
  return accounts;
}

/** `name=value` of the session cookie a response sets. */
function sessionCookie(res: Response) {
  const set = res.headers.get('set-cookie') ?? '';
  return set.split(';')[0] ?? '';
}

beforeEach(async () => {
  clock = NOW;
  const { db } = openDatabase(':memory:');
  seedDemo(db, NOW);
  const { session } = await build(db).login(DEMO_ACCOUNTS[0], DEMO_PASSWORD, null);
  cookie = `${SESSION_COOKIE}=${session.token}`;
});

async function get<T>(path: string): Promise<T> {
  const res = await api.request(path, { headers: { cookie } });
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
}

async function send<T>(method: string, path: string, payload: unknown, status = 200): Promise<T> {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(payload),
  });
  expect(res.status, `${method} ${path}`).toBe(status);
  return (status === 204 ? undefined : await res.json()) as T;
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

describe('overview size', () => {
  it('sends the first topics of each list with the totals, and leaves out filtered projects', async () => {
    const por = await get<ProjectSummary>('/projects/POR');
    for (let i = 0; i < 25; i++) {
      await send('POST', '/topics', { projectId: por.id, title: `Relance ${i}`, status: 'waiting' }, 201);
    }
    const overview = await get<Overview>('/overview?today=2026-11-07');
    expect(overview.totals.waiting).toBe(28);
    expect(overview.waiting).toHaveLength(20);
    const group = overview.inProgress.find((g) => g.project.key === 'POR');
    expect(group?.total).toBe(group?.topics.length);

    const without = await get<Overview>(`/overview?today=2026-11-07&exclude=${por.id}`);
    expect(without.totals.waiting).toBe(1);
    expect(without.inProgress.map((g) => g.project.key)).not.toContain('POR');
    expect(without.activeProjectCount).toBe(2);
  });
});

describe('overview activity and settings', () => {
  it('lists the latest changes of active projects, newest first', async () => {
    clock = new Date('2026-11-07T20:00:00');
    await send('PATCH', '/topics/POR-24', { status: 'waiting' });
    clock = new Date('2026-11-07T20:05:00');
    await send('PATCH', '/projects/AIDE', { name: "Centre d'aide usagers" });
    await send('PATCH', '/projects/OUT', { status: 'paused' });
    clock = new Date('2026-11-07T20:10:00');
    await send('PATCH', '/topics/OUT-3', { priority: 'urgent' });

    const { recentActivity } = await get<Overview>('/overview');
    expect(recentActivity.length).toBeLessThanOrEqual(12);
    // OUT is paused: its changes stay out of the overview, like its topics.
    expect(recentActivity.some((a) => a.project.key === 'OUT')).toBe(false);
    expect(recentActivity.slice(0, 2).map((a) => [a.project.key, a.entityType, a.action, a.topicRef])).toEqual([
      ['AIDE', 'project', 'renamed', null],
      ['POR', 'topic', 'status_changed', 'POR-24'],
    ]);
  });

  it('changes the dormancy threshold', async () => {
    expect(await get<{ dormancyDays: number }>('/settings')).toEqual({ dormancyDays: 14 });
    const before = (await get<Overview>('/overview?today=2026-11-07')).dormant.length;
    expect(before).toBeGreaterThan(0);

    await send('PATCH', '/settings', { dormancyDays: 365 });
    const overview = await get<Overview>('/overview?today=2026-11-07');
    expect(overview.dormancyDays).toBe(365);
    expect(overview.dormant).toEqual([]);
    expect((await get<Me>('/me')).dormancyDays).toBe(365);

    await send('PATCH', '/settings', { dormancyDays: 7 });
    expect((await get<Overview>('/overview?today=2026-11-07')).dormant.length).toBeGreaterThan(before);
    await send('PATCH', '/settings', { dormancyDays: 0 }, 400);
    await send('PATCH', '/settings', { dormancyDays: 400 }, 400);
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
    const res = await api.request('/projects/NOPE', { headers: { cookie } });
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

describe('labels', () => {
  type LabelUsage = { id: string; name: string; color: string; topicCount: number };
  it('creates, renames and recolors labels, unique whatever the case', async () => {
    const before = await get<LabelUsage[]>('/labels');
    expect(before.find((l) => l.name === 'Front')?.topicCount).toBeGreaterThan(0);

    const created = await send<LabelUsage>('POST', '/labels', { name: ' Juridique ' }, 201);
    expect(created).toMatchObject({ name: 'Juridique', topicCount: 0 });
    expect(before.map((l) => l.color)).not.toContain(created.color);
    await send('POST', '/labels', { name: 'juridique' }, 409);
    await send('PATCH', `/labels/${created.id}`, { name: 'FRONT' }, 409);

    const updated = await send<LabelUsage>('PATCH', `/labels/${created.id}`, { name: 'Légal', color: '#0284C7' });
    expect(updated).toMatchObject({ name: 'Légal', color: '#0284C7' });
    await send('PATCH', '/topics/POR-24', { labelIds: [created.id] });
    expect((await get<LabelUsage[]>('/labels')).find((l) => l.id === created.id)?.topicCount).toBe(1);
  });

  it('deletes a label from every topic', async () => {
    const front = (await get<LabelUsage[]>('/labels')).find((l) => l.name === 'Front');
    await send('DELETE', `/labels/${front?.id}`, undefined, 204);
    const topic = await get<TopicDetail>('/topics/POR-24');
    expect(topic.labels.map((l) => l.name)).not.toContain('Front');
    await send('DELETE', `/labels/${front?.id}`, undefined, 404);
  });
});

describe('bulk topic updates', () => {
  it('changes several topics at once and logs each change', async () => {
    const updated = await send<TopicSummary[]>('PATCH', '/topics', {
      refs: ['POR-28', 'POR-30', 'AIDE-9'],
      patch: { status: 'waiting', priority: 'high' },
    });
    expect(updated.map((t) => [t.ref, t.status, t.priority])).toEqual([
      ['POR-28', 'waiting', 'high'],
      ['POR-30', 'waiting', 'high'],
      ['AIDE-9', 'waiting', 'high'],
    ]);
    const detail = await get<TopicDetail>('/topics/POR-30');
    expect(
      detail.activity
        .map((a) => a.action)
        .slice(0, 2)
        .sort(),
    ).toEqual(['priority_changed', 'status_changed']);
  });

  it('adds and removes labels without touching the others', async () => {
    const labels = await get<Array<{ id: string; name: string }>>('/labels');
    const id = (name: string) => labels.find((l) => l.name === name)?.id ?? '';
    const before = await get<TopicDetail>('/topics/POR-24');
    const kept = before.labels.map((l) => l.name);
    expect(kept).toContain('Front');

    const [after] = await send<TopicSummary[]>('PATCH', '/topics', {
      refs: ['POR-24'],
      patch: { addLabelIds: [id('Support')], removeLabelIds: [id('Front')] },
    });
    expect(after?.labels.map((l) => l.name).sort()).toEqual([...kept.filter((n) => n !== 'Front'), 'Support'].sort());
  });

  it('is all or nothing', async () => {
    const before = await get<TopicDetail>('/topics/POR-28');
    await send('PATCH', '/topics', { refs: ['POR-28', 'POR-999'], patch: { status: 'done' } }, 404);
    const otherProjectSub = (await get<ProjectSummary>('/projects/AIDE')).subprojects[0]?.id;
    await send('PATCH', '/topics', { refs: ['POR-28', 'AIDE-9'], patch: { subprojectId: otherProjectSub } }, 400);
    await send('PATCH', '/topics', { refs: ['POR-28'], patch: { addLabelIds: ['nope'] } }, 400);
    const after = await get<TopicDetail>('/topics/POR-28');
    expect(after.status).toBe(before.status);
    expect(after.subprojectId).toBe(before.subprojectId);
    expect(after.labels).toEqual(before.labels);
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

  it('finds words in descriptions and notes, with an excerpt around them', async () => {
    const inDescription = await get<SearchResult>('/search?q=siret');
    const hit = inDescription.topics.find((t) => t.ref === 'POR-24');
    expect(hit?.match.field).toBe('description');
    expect(hit?.match.segments.filter((s) => s.match).map((s) => s.text)).toEqual(['SIRET']);

    // Accents ignored, every word a prefix: "prototype valid" finds "Prototype validé" in a note.
    const inNote = await get<SearchResult>(`/search?q=${encodeURIComponent('prototype valid')}`);
    expect(inNote.topics.find((t) => t.ref === 'POR-24')?.match.field).toBe('note');
  });

  it('ranks the title above the description and notes', async () => {
    const result = await get<SearchResult>('/search?q=sauvegarde');
    expect(result.topics[0]?.match.field).toBe('title');
    expect(result.topics[0]?.match.segments.some((s) => s.match && /sauvegarde/i.test(s.text))).toBe(true);
  });

  it('follows every write: titles, descriptions, new notes, archiving', async () => {
    const none = await get<SearchResult>('/search?q=zeppelin');
    expect(none.topics).toEqual([]);

    await send('PATCH', '/topics/POR-12', { title: 'Harmoniser les libellés du zeppelin' });
    await send('POST', '/topics/AIDE-5/notes', { body: 'Vu avec le pilote du zeppelin.' }, 201);
    await send('PATCH', '/topics/OUT-3', { description: 'Un zeppelin de démonstration.' });
    const found = await get<SearchResult>('/search?q=zeppelin');
    expect(found.topics.map((t) => [t.ref, t.match.field])).toEqual([
      ['POR-12', 'title'],
      ['OUT-3', 'description'],
      ['AIDE-5', 'note'],
    ]);

    await send('PATCH', '/projects/OUT', { status: 'archived' });
    const afterArchive = await get<SearchResult>('/search?q=zeppelin');
    expect(afterArchive.topics.map((t) => t.ref)).not.toContain('OUT-3');
  });

  it('reads any input as plain words', async () => {
    for (const q of ['"foo" OR bar*', 'NEAR(a b)', '-', '()*:^']) {
      const res = await api.request(`/search?q=${encodeURIComponent(q)}`, { headers: { cookie } });
      expect(res.status, q).toBe(200);
    }
  });
});

describe('openapi', () => {
  it('documents the API', async () => {
    const doc = await get<{ paths: Record<string, unknown> }>('/openapi.json');
    expect(Object.keys(doc.paths)).toContain('/topics/{ref}');
  });
});

describe('first run', () => {
  it('creates the administrator with a password, signs in, then lets the workspace grow', async () => {
    const { db } = openDatabase(':memory:');
    build(db);
    cookie = '';

    expect(await get<SetupStatus>('/setup')).toEqual({ required: true, mode: 'create', demo: false });
    expect((await api.request('/me')).status).toBe(401);
    await send('POST', '/setup', { name: 'Ada', email: 'not-an-email', password: 'long enough' }, 400);
    await send('POST', '/setup', { name: 'Ada', email: 'ada@example.com', password: 'short' }, 400);

    const res = await api.request('/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: ' Ada Lovelace ', email: 'Ada@Example.com', password: 'analytical engine' }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    cookie = sessionCookie(res);
    const admin = (await res.json()) as User;
    expect(admin).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' });
    expect(await get<SetupStatus>('/setup')).toMatchObject({ required: false, mode: null });
    await send('POST', '/setup', { name: 'Eve', email: 'eve@example.com', password: 'another one!' }, 409);

    const project = await send<ProjectSummary>('POST', '/projects', { key: 'crm', name: 'CRM' }, 201);
    const sub = await send<SubprojectSummary>('POST', '/projects/CRM/subprojects', { name: 'Import' }, 201);
    const topic = await send<TopicDetail>(
      'POST',
      '/topics',
      { projectId: project.id, subprojectId: sub.id, title: 'Mapper les colonnes' },
      201,
    );
    expect(topic.ref).toBe('CRM-1');
    expect(topic.assignee?.id).toBe(admin.id);
    await send('PATCH', '/topics/CRM-1', { status: 'in_progress' });

    const overview = await get<Overview>('/overview');
    expect(overview.inProgress.map((g) => [g.project.key, g.topics.map((t) => t.ref)])).toEqual([['CRM', ['CRM-1']]]);
  });

  it('lets the administrator of an install from before sign-in choose a password', async () => {
    const { db } = openDatabase(':memory:');
    seedDemo(db, NOW);
    // Before J4, accounts had no password.
    db.update((await import('./db/schema.ts')).users)
      .set({ passwordHash: null })
      .run();
    build(db);
    cookie = '';
    expect(await get<SetupStatus>('/setup')).toMatchObject({ required: true, mode: 'claim' });
    // Only the administrator's email works.
    await send('POST', '/setup', { email: DEMO_ACCOUNTS[1], password: 'a new password' }, 400);
    const res = await api.request('/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: DEMO_ACCOUNTS[0], password: 'a new password' }),
    });
    expect(res.status).toBe(201);
    cookie = sessionCookie(res);
    expect((await get<Me>('/me')).user.email).toBe(DEMO_ACCOUNTS[0]);
  });
});

describe('project writes', () => {
  it('creates a project with an uppercased key, the next free color and the last position', async () => {
    const created = await send<ProjectSummary>('POST', '/projects', { key: ' crm ', name: 'Relation client' }, 201);
    expect(created).toMatchObject({ key: 'CRM', name: 'Relation client', color: '#E11D48', status: 'active' });
    expect(created).toMatchObject({ archivedAt: null, subprojects: [], openCount: 0 });
    const keys = (await get<ProjectSummary[]>('/projects')).map((p) => p.key);
    expect(keys.at(-1)).toBe('CRM');
  });

  it('refuses a key that is taken or malformed', async () => {
    await send('POST', '/projects', { key: 'POR', name: 'Doublon' }, 409);
    await send('POST', '/projects', { key: 'P', name: 'Trop court' }, 400);
    await send('POST', '/projects', { key: 'PORTAIL', name: 'Trop long' }, 400);
    await send('POST', '/projects', { key: 'P0R', name: 'Chiffre' }, 400);
  });

  it('edits a project and logs what changed', async () => {
    clock = new Date('2026-11-07T20:00:00');
    const updated = await send<ProjectSummary>('PATCH', '/projects/por', {
      name: 'Portail clients',
      targetDate: '2027-01-15',
      color: '#0284C7',
      description: 'Notes du projet',
    });
    expect(updated).toMatchObject({ name: 'Portail clients', targetDate: '2027-01-15', color: '#0284C7' });
    expect(updated.description).toBe('Notes du projet');

    const history = await get<ProjectActivity[]>('/projects/POR/activity');
    const own = history.filter((a) => a.entityType === 'project').map((a) => a.action);
    expect(own).toEqual(expect.arrayContaining(['renamed', 'target_date_changed', 'description_changed']));
    expect(history[0]?.createdAt).toBe(clock.toISOString());
  });

  it('archives and restores a project', async () => {
    const archived = await send<ProjectSummary>('PATCH', '/projects/OUT', { status: 'archived' });
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).not.toBeNull();

    expect((await get<ProjectSummary[]>('/projects')).map((p) => p.key)).not.toContain('OUT');
    expect((await get<ProjectSummary[]>('/projects?archived=true')).map((p) => p.key)).toEqual(['OUT']);
    expect((await get<Overview>('/overview')).activeProjectCount).toBe(2);
    // The archived project stays readable, topics included.
    expect((await get<TopicSummary[]>('/topics?project=OUT')).length).toBeGreaterThan(0);
    expect((await get<TopicSummary[]>('/topics')).some((t) => t.projectKey === 'OUT')).toBe(false);

    const restored = await send<ProjectSummary>('PATCH', '/projects/OUT', { status: 'paused' });
    expect(restored).toMatchObject({ status: 'paused', archivedAt: null });
    const actions = (await get<ProjectActivity[]>('/projects/OUT/activity'))
      .filter((a) => a.entityType === 'project')
      .map((a) => a.action);
    expect(actions.slice(0, 2)).toEqual(['restored', 'archived']);
  });
});

describe('subproject writes', () => {
  it('creates, renames and archives a subproject', async () => {
    const created = await send<SubprojectSummary>('POST', '/projects/POR/subprojects', { name: 'Accessibilité' }, 201);
    expect(created).toMatchObject({ name: 'Accessibilité', status: 'active', archivedAt: null, openCount: 0 });
    let project = await get<ProjectSummary>('/projects/POR');
    expect(project.subprojects.at(-1)?.id).toBe(created.id);

    await send('PATCH', `/subprojects/${created.id}`, { name: 'Accessibilité AA', targetDate: '2027-02-01' });
    const archived = await send<SubprojectSummary>('PATCH', `/subprojects/${created.id}`, { status: 'archived' });
    expect(archived.archivedAt).not.toBeNull();

    project = await get<ProjectSummary>('/projects/POR');
    expect(project.subprojects.map((s) => s.id)).not.toContain(created.id);
    expect(project.archivedSubprojects.map((s) => s.name)).toEqual(['Accessibilité AA']);

    await send('POST', '/topics', { projectId: project.id, subprojectId: created.id, title: 'Contraste' }, 400);
    await send('PATCH', '/topics/POR-24', { subprojectId: created.id }, 400);

    const history = await get<ProjectActivity[]>('/projects/POR/activity');
    const subLines = history.filter((a) => a.entityType === 'subproject');
    expect(subLines.map((a) => a.action)).toEqual(['archived', 'target_date_changed', 'renamed', 'created']);
    expect(subLines.every((a) => a.subprojectName === 'Accessibilité AA')).toBe(true);
  });

  it('reorders projects and subprojects without logging it', async () => {
    const projects = await get<ProjectSummary[]>('/projects');
    const [first, second, third] = projects;
    // '0' sorts before every key the demo uses: the third project moves to the top.
    expect(first && first.sortOrder > '0').toBe(true);
    await send('PATCH', `/projects/${third?.key}`, { sortOrder: '0' });
    expect((await get<ProjectSummary[]>('/projects')).map((p) => p.key)).toEqual([third?.key, first?.key, second?.key]);
    const history = await get<ProjectActivity[]>(`/projects/${third?.key}/activity`);
    expect(history.some((a) => a.entityType === 'project')).toBe(false);

    const por = await get<ProjectSummary>('/projects/POR');
    const last = por.subprojects.at(-1);
    await send('PATCH', `/subprojects/${last?.id}`, { sortOrder: '0' });
    expect((await get<ProjectSummary>('/projects/POR')).subprojects[0]?.id).toBe(last?.id);
  });

  it('returns 404 for an unknown project or subproject', async () => {
    await send('POST', '/projects/NOPE/subprojects', { name: 'X' }, 404);
    await send('PATCH', '/subprojects/unknown', { name: 'X' }, 404);
    await send('PATCH', '/projects/NOPE', { name: 'X' }, 404);
  });
});
