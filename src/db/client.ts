import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { logger } from '../lib/logger';
import * as cron from 'node-cron';

const dbPath = process.env.DB_PATH || 'lina-local.db';
// Fail fast and loudly if the environment variable is missing
if (!dbPath) {
  console.error('FATAL: DB_PATH environment variable is not set. Cannot start database.');
  process.exit(1); 
}
const sqlite = new Database(dbPath);

const backupPath = dbPath.replace('.db', '_backup.db');
// Schedule the task to run every day at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  console.log(`Starting nightly database backup...`);
  console.log(`Source: ${dbPath}`);
  console.log(`Destination: ${backupPath}`);
  
  try {
    await sqlite.backup(backupPath);
    console.log('Nightly backup completed successfully!');
  } catch (err) {
    console.error('Nightly backup failed:', err);
  }


const journalMode = String(
	sqlite.pragma('journal_mode = WAL', { simple: true }) ?? '',
).toUpperCase();

if (journalMode !== 'WAL') {
	logger.error('db.sqlite.wal.enable.failed', {
		context: 'app-runtime',
		dbPath,
		journalMode,
	});
	throw new Error(
		`Failed to enable SQLite WAL mode for ${dbPath}. SQLite reported journal_mode=${journalMode || 'UNKNOWN'}.`,
	);
}

sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -32768');
sqlite.pragma('temp_store = MEMORY');

logger.info('db.sqlite.connection.ready', {
	context: 'app-runtime',
	dbPath,
	journalMode,
	walEnabled: true,
	synchronous: sqlite.pragma('synchronous', { simple: true }),
	cacheSize: sqlite.pragma('cache_size', { simple: true }),
	tempStore: sqlite.pragma('temp_store', { simple: true }),
});

export const db = drizzle(sqlite, { schema });