import Database from 'better-sqlite3';
const db = new Database('./local.db');

const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
for (const idx of indices) {
    db.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    if (table.name !== 'sqlite_sequence') {
        db.exec(`DROP TABLE IF EXISTS "${table.name}"`);
    }
}

console.log('Successfully dropped all tables and indexes.');
