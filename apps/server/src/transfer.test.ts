import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportResult, ProjectSummary, SearchResult, TopicDetail, WorkspaceExport } from '@cairn/shared';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@cairn/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createAccounts } from './accounts.ts';
import { createApi, SESSION_COOKIE } from './app.ts';
import { createBackups } from './backup.ts';
import { openDatabase } from './db/index.ts';
import { createRepo } from './repo.ts';
import { seedDemo } from './seed/demo.ts';

const NOW = new Date('2026-11-07T19:00:00');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A server on its own database, signed in as an administrator. */
async function server({ demo }: { demo: boolean }) {
  const opened = openDatabase(':memory:');
  if (demo) seedDemo(opened.db, NOW);
  const accounts = createAccounts(opened.db, { now: () => NOW });
  const dir = mkdtempSync(join(tmpdir(), 'cairn-backups-'));
  dirs.push(dir);
  const backups = createBackups(opened.sqlite, dir, 2);
  const api = createApi(createRepo(opened.db, { now: () => NOW }), accounts, { backups });
  let session: { token: string };
  if (demo) {
    session = (await accounts.login(DEMO_ACCOUNTS[0], DEMO_PASSWORD, null)).session;
  } else {
    session = (await accounts.setup({ name: 'Ada', email: 'ada@example.com', password: 'analytical engine' }, null))
      .session;
  }
  const cookie = `${SESSION_COOKIE}=${session.token}`;
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    api.request(path, {
      method: init.method ?? 'GET',
      headers: { cookie, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  return { call, dir };
}

describe('export and import', () => {
  it('moves a whole workspace to a new install', async () => {
    const source = await server({ demo: true });
    const res = await source.call('/export');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="cairn-export-.*\.json"/);
    const doc = (await res.json()) as WorkspaceExport;
    expect(doc).toMatchObject({ format: 'cairn-export', version: 1, settings: { dormancyDays: 14 } });
    expect(JSON.stringify(doc)).not.toMatch(/argon2|password/i);

    const target = await server({ demo: false });
    const imported = await target.call('/import', { method: 'POST', body: doc });
    expect(imported.status).toBe(201);
    // Ada exists on the target; the two demo accounts are new and need a link.
    expect((await imported.json()) as ImportResult).toEqual({ projects: 3, topics: doc.topics.length, newAccounts: 2 });

    const por = (await (await target.call('/projects/POR')).json()) as ProjectSummary;
    expect(por).toMatchObject({ openCount: 13, progress: { done: 14, total: 27 } });
    const topic = (await (await target.call('/topics/POR-24')).json()) as TopicDetail;
    expect(topic.notes).toHaveLength(2);
    expect(topic.assignee?.email).toBe(DEMO_ACCOUNTS[0]);
    expect(topic.labels.length).toBeGreaterThan(0);
    // The search index follows the imported rows.
    const found = (await (await target.call('/search?q=siret')).json()) as SearchResult;
    expect(found.topics.map((t) => t.ref)).toContain('POR-24');

    // A workspace with projects refuses a second import.
    expect((await target.call('/import', { method: 'POST', body: doc })).status).toBe(409);
  });

  it('exports topics as CSV, safe for spreadsheets', async () => {
    const { call } = await server({ demo: true });
    await call('/topics/POR-24', { method: 'PATCH', body: { title: '=HYPERLINK("http://evil")' } });
    const res = await call('/export/topics.csv');
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    // UTF-8 byte order mark (text() drops it while decoding).
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = (await res.text()).split('\r\n');
    expect(lines[0]).toBe(
      'ref,title,project,subproject,status,priority,due_date,assignee,labels,created_at,last_activity_at,completed_at,description',
    );
    const row = lines.find((l) => l.startsWith('POR-24,'));
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('backups', () => {
  it('copies the database and keeps only the newest copies', async () => {
    const { call, dir } = await server({ demo: true });
    for (let i = 0; i < 3; i++) {
      const res = await call('/backups', { method: 'POST' });
      expect(res.status).toBe(201);
      // Names have a one-second resolution.
      await new Promise((resolve) => setTimeout(resolve, 1050));
    }
    const files = readdirSync(dir);
    expect(files).toHaveLength(2);
    const listed = (await (await call('/backups')).json()) as Array<{ name: string; size: number }>;
    expect(listed.map((b) => b.name)).toEqual([...files].sort().reverse());
    expect(listed[0]?.size).toBeGreaterThan(10_000);

    // A copy opens as a Cairn database.
    const copy = openDatabase(join(dir, files[0] ?? ''));
    expect(
      createRepo(copy.db)
        .listProjects()
        .map((p) => p.key),
    ).toEqual(['POR', 'AIDE', 'OUT']);
    copy.sqlite.close();
  }, 15_000);
});
