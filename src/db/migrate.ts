import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Initialize the SQLite database (this creates the file if it doesn't exist)
// We use 'dev.db' to match your drizzle.config.ts
const sqlite = new Database('lina-local.db');
const db = drizzle(sqlite);

console.log('⏳ Running migrations...');

// 2. Read the migration files from the 'drizzle' folder and apply them
migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });

console.log('✅ Migrations complete! Database "lina-local.db" is ready.');
sqlite.close();