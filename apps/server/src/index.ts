import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApi } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/index.ts';
import { createRepo } from './repo.ts';
import { isEmpty, seedDemo } from './seed/demo.ts';

const config = loadConfig();
const { db, sqlite } = openDatabase(config.databasePath);

if (config.seedDemoWhenEmpty && isEmpty(db)) {
  seedDemo(db);
  console.log('Empty database: demo data seeded.');
}

const app = new Hono();
app.route('/api', createApi(createRepo(db)));

if (config.production) {
  // The compiled SPA: static assets, then index.html for every client route.
  const indexHtml = readFileSync(resolve(config.webDistPath, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root: config.webDistPath }));
  app.get('*', (c) => c.html(indexHtml));
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Cairn API listening on http://localhost:${info.port}`);
});

function shutdown() {
  server.close();
  sqlite.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
