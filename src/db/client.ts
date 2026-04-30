import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { logger } from '../lib/logger';

const dbPath = process.env.DB_PATH || 'lina-local.db';
const sqlite = new Database(dbPath);

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