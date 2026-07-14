import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { DATA_DIR, sessionSecret } from '@/lib/env';

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

const BACKUP_RETENTION = 10;

/**
 * True when the DB already holds data (has an applied-migrations table) AND
 * the bundled migrations folder contains entries not yet applied. Fresh
 * installs (no __drizzle_migrations table) return false — nothing to protect.
 */
function needsPreMigrationBackup(
  sqlite: Database.Database,
  folder: string,
): boolean {
  let applied: number;
  try {
    const row = sqlite
      .prepare('SELECT count(*) AS c FROM __drizzle_migrations')
      .get() as { c: number };
    applied = row.c;
  } catch {
    return false; // fresh DB, no data at risk
  }
  try {
    const journal = JSON.parse(
      fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    return journal.entries.length > applied;
  } catch {
    return false;
  }
}

function backupDatabase(sqlite: Database.Database, dbPath: string): string {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `gallery-${ts}.db`);
  // Flush WAL into the main file so a plain copy is a complete snapshot.
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, dest);
  // Retention: keep the newest BACKUP_RETENTION, prune the rest.
  const backups = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('gallery-') && f.endsWith('.db'))
    .sort();
  while (backups.length > BACKUP_RETENTION) {
    const old = backups.shift();
    if (old) fs.rmSync(path.join(dir, old), { force: true });
  }
  return dest;
}

export function getDb(): Db {
  if (globalForDb.__galleryDb) return globalForDb.__galleryDb;

  sessionSecret();

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'gallery.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const folder = resolveMigrationsFolder();

  // Back up an existing database before applying new migrations, so a failed
  // upgrade never leaves galleries stranded.
  if (needsPreMigrationBackup(sqlite, folder)) {
    const backup = backupDatabase(sqlite, dbPath);
    console.log(`[migrate] pending migrations — backed up database to ${backup}`);
  }

  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: folder });
  } catch (err) {
    // Refuse to serve a half-migrated database. The pre-migration backup (if
    // any) sits in DATA_DIR/backups; roll back to the previous version, which
    // reads the untouched DB, to recover.
    console.error(
      `[migrate] MIGRATION FAILED — refusing to start. Restore from the latest backup in ${path.join(
        DATA_DIR,
        'backups',
      )} and redeploy the previous version to recover.`,
      err,
    );
    throw err;
  }

  globalForDb.__galleryDb = db;
  return db;
}

export { schema };
