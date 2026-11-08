import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** A second server with the demo data set, for the overview journeys. */
const DEMO_PORT = 4174;
const DATA_DIR = resolve(import.meta.dirname, '.e2e-data');

/** The production server (built SPA and API in one process, as on a Raspberry Pi), on a fresh database. */
function server(port: number, dataDir: string, demo: boolean) {
  return {
    command: `node --eval "require('node:fs').rmSync(process.env.CAIRN_DATA_DIR, { recursive: true, force: true })" && apps/server/node_modules/.bin/tsx apps/server/src/index.ts`,
    url: `http://localhost:${port}/api/health`,
    env: {
      NODE_ENV: 'production',
      PORT: String(port),
      CAIRN_DATA_DIR: dataDir,
      CAIRN_SEED_DEMO: String(demo),
    },
    reuseExistingServer: false,
    timeout: 60_000,
  };
}

export default defineConfig({
  testDir: 'e2e',
  // The journeys build on one another (first account, then projects), in one database.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // Run `pnpm build` first. The journeys start from an empty workspace; the overview ones read the demo data.
  webServer: [server(PORT, resolve(DATA_DIR, 'empty'), false), server(DEMO_PORT, resolve(DATA_DIR, 'demo'), true)],
});
