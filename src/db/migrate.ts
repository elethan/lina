import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Initialize the SQLite database (this creates the file if it doesn't exist)
// We use 'dev.db' to match your drizzle.config.ts
const sqlite = new Database('lina-local.db');
const journalMode = String(
	sqlite.pragma('journal_mode = WAL', { simple: true }) ?? '',
).toUpperCase();

if (journalMode !== 'WAL') {
	logger.error('db.sqlite.wal.enable.failed', {
		context: 'migration-runtime',
		dbPath: 'lina-local.db',
		journalMode,
	});
	throw new Error(
		`Failed to enable SQLite WAL mode for lina-local.db. SQLite reported journal_mode=${journalMode || 'UNKNOWN'}.`,
	);
}

sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -32768');
sqlite.pragma('temp_store = MEMORY');

logger.info('db.sqlite.connection.ready', {
	context: 'migration-runtime',
	dbPath: 'lina-local.db',
	journalMode,
	walEnabled: true,
	synchronous: sqlite.pragma('synchronous', { simple: true }),
	cacheSize: sqlite.pragma('cache_size', { simple: true }),
	tempStore: sqlite.pragma('temp_store', { simple: true }),
});

const db = drizzle(sqlite);

logger.info('db.migration.begin', { dbPath: 'lina-local.db' });

// 2. Read the migration files from the 'drizzle' folder and apply them
migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });

logger.info('db.migration.complete', { dbPath: 'lina-local.db' });
sqlite.close();