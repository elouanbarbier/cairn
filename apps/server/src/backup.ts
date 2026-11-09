import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupInfo } from '@cairn/shared';
import type Database from 'better-sqlite3';

const NAME = /^cairn-(\d{8})-(\d{6})\.db$/;

const pad = (n: number) => String(n).padStart(2, '0');
/** `cairn-20261109-030000.db`, in local time, so names sort by date. */
function fileName(at: Date) {
  const day = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  return `cairn-${day}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}.db`;
}

export interface Backups {
  /** Newest first. */
  list(): BackupInfo[];
  /** A hot copy of the database (readers and writers keep working), then the oldest copies beyond `keep` go. */
  run(): Promise<BackupInfo>;
  /** Every night at 3:00, while the server runs. Returns a function that stops it. */
  schedule(onDone?: (info: BackupInfo) => void): () => void;
}

export function createBackups(sqlite: Database.Database, dir: string, keep: number): Backups {
  const info = (name: string): BackupInfo => {
    const stats = statSync(join(dir, name));
    return { name, size: stats.size, createdAt: stats.mtime.toISOString() };
  };

  function list(): BackupInfo[] {
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => NAME.test(n));
    } catch {
      return [];
    }
    return names.sort().reverse().map(info);
  }

  async function run(): Promise<BackupInfo> {
    mkdirSync(dir, { recursive: true });
    const name = fileName(new Date());
    await sqlite.backup(join(dir, name));
    for (const old of list().slice(Math.max(keep, 1))) rmSync(join(dir, old.name), { force: true });
    return info(name);
  }

  function schedule(onDone?: (info: BackupInfo) => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      const now = new Date();
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0);
      if (at <= now) at.setDate(at.getDate() + 1);
      timer = setTimeout(() => {
        run()
          .then((done) => onDone?.(done))
          .catch((error: unknown) => console.error('Nightly backup failed:', error))
          .finally(next);
      }, at.getTime() - now.getTime());
      // The schedule alone must not keep the process alive.
      timer.unref();
    };
    next();
    return () => clearTimeout(timer);
  }

  return { list, run, schedule };
}
