import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/index.ts';
import { seedDemo } from './demo.ts';

const config = loadConfig();
const { db, sqlite } = openDatabase(config.databasePath);
seedDemo(db);
sqlite.close();
console.log(`Demo data written to ${config.databasePath}`);
