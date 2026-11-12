import fs from 'fs';
import path from 'path';
import { db } from './db';

export async function runMigrations(): Promise<boolean> {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('[Migrations] schema.sql not found at:', schemaPath);
    return false;
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await db.init();
    if (!db.getIsFallback()) {
      console.log('[Migrations] Applying PostgreSQL migrations from schema.sql...');
      await db.query(sql);
      console.log('✅ [Migrations] Database migrations completed successfully.');
      return true;
    } else {
      console.log('ℹ️ [Migrations] In-memory mode active: schema tables instantiated in memory.');
      return true;
    }
  } catch (err: any) {
    console.error('❌ [Migrations] Migration failed:', err.message);
    return false;
  }
}

if (require.main === module) {
  runMigrations().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
