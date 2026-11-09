#!/usr/bin/env node
// Measures Cairn's API response times against the cadrage target: p95 under 50 ms with 5,000 topics.
// Plain Node 22, no dependency. Point it at a running Cairn (the Docker container, on the Pi or elsewhere):
//
//   CAIRN_URL=http://raspberrypi.local:3000 CAIRN_EMAIL=you@example.com CAIRN_PASSWORD=… node scripts/bench.mjs --seed
//
// --seed imports 5,000 generated topics first, which only works on a workspace without projects (a fresh install,
// right after creating the first account). Without it, the workspace is measured as it is.

const BASE = (process.env.CAIRN_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const EMAIL = process.env.CAIRN_EMAIL;
const PASSWORD = process.env.CAIRN_PASSWORD;
const SEED = process.argv.includes('--seed');
const ROUNDS = Number(process.env.CAIRN_BENCH_ROUNDS ?? 200);
const TARGET_MS = 50;

if (!EMAIL || !PASSWORD) {
  console.error('Set CAIRN_EMAIL and CAIRN_PASSWORD (an administrator account).');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

const WORDS = [
  'formulaire',
  'validation',
  'export',
  'tableau',
  'recette',
  'migration',
  'facture',
  'contrat',
  'planning',
  'atelier',
  'serveur',
  'sauvegarde',
  'relance',
  'devis',
  'livraison',
  'support',
  'documentation',
  'paiement',
  'accès',
  'rapport',
];
const STATUSES = ['backlog', 'todo', 'todo', 'in_progress', 'waiting', 'done', 'done', 'done', 'cancelled'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const pick = (list, i) => list[i % list.length];
const pad = (n, width) => String(n).padStart(width, '0');

/** A workspace export (format version 1) with 10 projects, 50 subprojects and 5,000 topics. */
function generate() {
  const now = Date.now();
  const day = 86_400_000;
  const at = (daysAgo) => new Date(now - daysAgo * day).toISOString();
  const dateIn = (days) => new Date(now + days * day).toISOString().slice(0, 10);
  const projects = [];
  const subprojects = [];
  const topics = [];
  const notes = [];
  const checklistItems = [];
  const activity = [];
  const keys = ['ALPHA', 'BRAVO', 'CHAR', 'DELTA', 'ECHO', 'FOX', 'GOLF', 'HOTEL', 'INDIA', 'JULI'];
  keys.forEach((key, p) => {
    const projectId = `bench-p${p}`;
    projects.push({
      id: projectId,
      key,
      name: `Projet ${key.toLowerCase()}`,
      description: '',
      color: '#6366F1',
      icon: null,
      status: 'active',
      startDate: null,
      targetDate: dateIn(60 + p),
      sortOrder: `a${pad(p, 3)}`,
      createdAt: at(200),
      updatedAt: at(10),
      archivedAt: null,
    });
    for (let s = 0; s < 5; s++) {
      subprojects.push({
        id: `bench-p${p}-s${s}`,
        projectId,
        name: `Lot ${s + 1}`,
        description: '',
        status: 'active',
        targetDate: null,
        sortOrder: `a${pad(s, 3)}`,
        createdAt: at(190),
        updatedAt: at(10),
        archivedAt: null,
      });
    }
    for (let n = 1; n <= 500; n++) {
      const i = p * 500 + n;
      const id = `bench-t${i}`;
      const status = pick(STATUSES, i * 7);
      const closed = status === 'done' || status === 'cancelled';
      const idle = (i * 13) % 40;
      topics.push({
        id,
        projectId,
        subprojectId: n % 6 === 0 ? null : `bench-p${p}-s${n % 5}`,
        number: n,
        title: `${pick(WORDS, i)} ${pick(WORDS, i * 3)} ${n}`,
        description: `Décrire le ${pick(WORDS, i * 5)} et vérifier la ${pick(WORDS, i * 11)}.`,
        status,
        priority: pick(PRIORITIES, i * 3),
        dueDate: i % 4 === 0 ? dateIn((i % 30) - 10) : null,
        assigneeId: null,
        sortOrder: `a${pad(n, 5)}`,
        createdAt: at(idle + 30),
        updatedAt: at(idle),
        lastActivityAt: at(idle),
        completedAt: closed ? at(idle) : null,
      });
      if (i % 3 === 0) {
        notes.push({
          id: `bench-n${i}`,
          topicId: id,
          authorId: null,
          body: `Point fait sur le ${pick(WORDS, i * 17)}.`,
          createdAt: at(idle),
          updatedAt: at(idle),
        });
      }
      if (i % 2 === 0) {
        checklistItems.push({ id: `bench-c${i}`, topicId: id, text: 'Relire', done: closed, sortOrder: 'a0' });
      }
      activity.push({
        id: `bench-a${i}-0`,
        entityType: 'topic',
        entityId: id,
        actorId: null,
        action: 'created',
        payload: {},
        createdAt: at(idle + 30),
      });
      activity.push({
        id: `bench-a${i}-1`,
        entityType: 'topic',
        entityId: id,
        actorId: null,
        action: 'status_changed',
        payload: { from: 'todo', to: status },
        createdAt: at(idle),
      });
    }
  });
  return {
    format: 'cairn-export',
    version: 1,
    exportedAt: new Date(now).toISOString(),
    settings: {},
    users: [],
    labels: [],
    projects,
    subprojects,
    topics,
    topicLabels: [],
    checklistItems,
    notes,
    activity,
  };
}

async function seed(cookie) {
  const doc = generate();
  const res = await fetch(`${BASE}/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Import failed: ${res.status} ${await res.text()}`);
  console.log(`Imported ${doc.topics.length} topics in ${doc.projects.length} projects.`);
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(cookie, path) {
  const times = [];
  for (let i = 0; i < ROUNDS + 10; i++) {
    const start = performance.now();
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    if (i >= 10) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { path, p50: percentile(times, 50), p95: percentile(times, 95), max: times.at(-1) };
}

const cookie = await login();
if (SEED) await seed(cookie);
const projects = await (await fetch(`${BASE}/api/projects`, { headers: { cookie } })).json();
const key = projects[0]?.key;
const paths = [
  '/api/overview',
  '/api/projects',
  ...(key ? [`/api/topics?project=${key}`, `/api/topics/${key}-42`] : []),
  '/api/search?q=formulaire',
  '/api/me',
];
console.log(`\n${BASE}: ${ROUNDS} requests per route, one at a time (target: p95 < ${TARGET_MS} ms)\n`);
let ok = true;
for (const path of paths) {
  const r = await measure(cookie, path);
  ok &&= r.p95 < TARGET_MS;
  console.log(
    `${r.p95 < TARGET_MS ? '✓' : '✗'} ${r.path.padEnd(34)} p50 ${r.p50.toFixed(1).padStart(6)} ms   p95 ${r.p95
      .toFixed(1)
      .padStart(6)} ms   max ${r.max.toFixed(1).padStart(6)} ms`,
  );
}
process.exitCode = ok ? 0 : 1;
