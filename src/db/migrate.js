import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, '..', '..', 'drizzle');

/**
 * Run pending Drizzle migrations against DATABASE_URL.
 * Safe to call on every boot — drizzle keeps a __drizzle_migrations
 * journal table and skips already-applied files.
 */
export async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('[migrate] DATABASE_URL not set, skipping migrations (JSON fallback in use)');
    return;
  }
  try {
    console.log('[migrate] Running drizzle migrations from', migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Failed:', err.message);
    // Don't crash boot — storage layer falls back to JSON if DB is unavailable
  }
}
