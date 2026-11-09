import { join } from 'node:path';
import { createAccounts } from './accounts.ts';
import { createBackups } from './backup.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/index.ts';

const HELP = `Cairn command line

  cairn backup                 Hot copy of the database into the backup folder
  cairn reset-password EMAIL   One-time link to choose a new password (7 days)
  cairn help                   This help

In Docker: docker compose exec cairn cairn backup`;

const [command, ...args] = process.argv.slice(2);
const config = loadConfig();

async function main(): Promise<number> {
  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return 0;
  }
  const { db, sqlite } = openDatabase(config.databasePath);
  try {
    if (command === 'backup') {
      const info = await createBackups(sqlite, config.backupDir, Math.max(config.backupKeep, 1)).run();
      console.log(`Backup written: ${join(config.backupDir, info.name)} (${Math.round(info.size / 1024)} KB)`);
      return 0;
    }
    if (command === 'reset-password') {
      const email = args[0];
      if (!email) {
        console.error('Usage: cairn reset-password EMAIL');
        return 1;
      }
      const link = createAccounts(db).accessLinkFor(email);
      const base = config.baseUrl ?? `http://localhost:${config.port}`;
      console.log(`Open this link to choose a password (once, within 7 days):\n${base}${link.path}`);
      return 0;
    }
    console.error(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    sqlite.close();
  }
}

process.exitCode = await main();
