import Database from 'better-sqlite3';

async function exportCleanDb() {
  console.log('Merging WAL and creating a clean production file...');
  
  // Connect to your local dev database
  const db = new Database('lina-local.db'); 
  
  try {
    // Use the native backup API to create a brand new, WAL-free file
    await db.backup('lina-prod.db');
    console.log('Success! You can now upload lina-prod.db to your Droplet.');
  } catch (err) {
    console.error('Export failed:', err);
  } finally {
    db.close();
  }
}

exportCleanDb();