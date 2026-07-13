import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { DATA_DIR } from '@/lib/env';

export type Db = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __galleryDb?: Db };

function resolveMigrationsFolder(): string {
  // In dev, cwd is the project root; in the standalone bundle, the drizzle
  // folder is copied next to server.js via outputFileTracingIncludes.
  const candidates = [
    path.join(process.cwd(), 'drizzle'),
    path.join(__dirname, '..', '..', 'drizzle'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('drizzle migrations folder not found');
}

export function getDb(): Db {
  if (globalForDb.__galleryDb) return globalForDb.__galleryDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, 'gallery.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

  globalForDb.__galleryDb = db;
  return db;
}

export { schema };
