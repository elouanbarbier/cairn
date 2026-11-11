#!/usr/bin/env node
// Takes the README screenshots on the demo data, in light and dark, with Playwright's Chromium.
// Run from the repository root after `pnpm --filter @cairn/web build`: node scripts/screenshots.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/screenshots';

/** The production server (built SPA and API) on a fresh database seeded with the demo data. */
const dataDir = mkdtempSync(join(tmpdir(), 'cairn-screenshots-'));
const server = spawn('apps/server/node_modules/.bin/tsx', ['apps/server/src/index.ts'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), CAIRN_DATA_DIR: dataDir, CAIRN_SEED_DEMO: 'true' },
  stdio: 'inherit',
});

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('The server did not start');
}

/** Each shot: a file name, how to reach the screen, and a text that shows it is ready. */
const shots = [
  { name: 'overview', path: '/', ready: 'Recent activity' },
  { name: 'project', path: '/p/POR', ready: 'Formulaires avancés' },
  { name: 'kanban', path: '/p/POR?view=kanban', ready: 'In progress' },
  { name: 'topic', path: '/p/POR?topic=POR-24', ready: 'Checklist' },
  {
    name: 'palette',
    path: '/',
    ready: 'Recent activity',
    act: async (page) => {
      await page.keyboard.press('ControlOrMeta+k');
      await page.keyboard.type('form');
      await page.getByRole('option').first().waitFor();
    },
  },
];

try {
  await waitForServer();
  const browser = await chromium.launch();
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      locale: 'en-US',
      colorScheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(BASE);
    await page.getByLabel('Email').fill('elouan@example.com');
    await page.getByLabel('Password').fill('cairn-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();

    for (const shot of shots) {
      await page.goto(`${BASE}${shot.path}`);
      await page.getByText(shot.ready).first().waitFor();
      await shot.act?.(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const file = `${OUT}/${shot.name}-${colorScheme}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
