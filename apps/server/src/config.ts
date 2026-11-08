import { resolve } from 'node:path';

export interface Config {
  port: number;
  databasePath: string;
  production: boolean;
  /** Seed demo data when the database is empty (default: on outside production). */
  seedDemoWhenEmpty: boolean;
  /** Built SPA to serve; only used in production. */
  webDistPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const dataDir = env.CAIRN_DATA_DIR ?? (production ? '/data' : resolve(import.meta.dirname, '../../../data'));
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.CAIRN_DATABASE_PATH ?? resolve(dataDir, 'cairn.db'),
    production,
    seedDemoWhenEmpty: env.CAIRN_SEED_DEMO ? env.CAIRN_SEED_DEMO === 'true' : !production,
    webDistPath: env.CAIRN_WEB_DIST ?? resolve(import.meta.dirname, '../../web/dist'),
  };
}
