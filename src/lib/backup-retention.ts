import fs from 'node:fs';
import path from 'node:path';

/**
 * The app's own pre-migration backups: `gallery-<ISO timestamp with : and . replaced by ->.db`,
 * e.g. gallery-2026-10-08T23-53-27-041Z.db. Anything else in the folder (manual backups such as
 * gallery-predeploy-*.db or pre-1.22-*.db) belongs to a human and is never pruned.
 */
const AUTO_BACKUP = /^gallery-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

/**
 * Keep the newest `keep` automatic backups and delete the older ones (plus their WAL/SHM
 * sidecars). Returns the names removed.
 *
 * Previously this pruned every `gallery-*.db` file by NAME, so manual files such as
 * `gallery-predeploy-…` (which sort after the dated ones) pushed the backup that had just
 * been made to the front of the delete queue and it was removed immediately.
 */
export function pruneBackups(dir: string, keep: number): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  // Fixed-width ISO timestamps sort chronologically as plain strings.
  const autos = names.filter((f) => AUTO_BACKUP.test(f)).sort();
  const removed: string[] = [];
  while (autos.length > keep) {
    const old = autos.shift()!;
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, old + suffix), { force: true });
    removed.push(old);
  }
  return removed;
}
