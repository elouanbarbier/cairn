import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Each run starts from an empty workspace, to walk the first-run journey. */
const DATA_DIR = resolve(import.meta.dirname, '.e2e-data');

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
  // The production server: built SPA and API in one process, as on a Raspberry Pi. Run `pnpm build` first.
  webServer: {
    command: `node --eval "require('node:fs').rmSync(process.env.CAIRN_DATA_DIR, { recursive: true, force: true })" && apps/server/node_modules/.bin/tsx apps/server/src/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      CAIRN_DATA_DIR: DATA_DIR,
      CAIRN_SEED_DEMO: 'false',
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
