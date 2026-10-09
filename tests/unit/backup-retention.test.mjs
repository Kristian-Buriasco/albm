import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneBackups } from '../../src/lib/backup-retention.ts';

const auto = (i) => `gallery-2026-10-${String(i).padStart(2, '0')}T12-00-00-000Z.db`;
const mk = (dir, names) => names.forEach((n) => fs.writeFileSync(path.join(dir, n), 'x'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));

/** The retention the app shipped with: prune by NAME across every "gallery-*.db" file. */
function legacyPrune(dir, keep) {
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('gallery-') && f.endsWith('.db')).sort();
  while (backups.length > keep) fs.rmSync(path.join(dir, backups.shift()), { force: true });
}

test('documents the old bug: with manual gallery-predeploy-*.db files present, the NEWEST automatic backup is deleted at once', () => {
  const dir = tmp();
  const manual = Array.from({ length: 10 }, (_, i) => `gallery-predeploy-2026072${i}T000000.db`);
  mk(dir, manual);
  mk(dir, [auto(8)]); // the automatic backup taken just before a migration
  legacyPrune(dir, 10);
  assert.ok(!fs.existsSync(path.join(dir, auto(8))), 'old logic pruned the backup it had just made');
});

test('never deletes the backup just made, even when many manual backups exist', () => {
  const dir = tmp();
  mk(dir, Array.from({ length: 12 }, (_, i) => `gallery-predeploy-2026072${i % 10}T0000${i}.db`));
  mk(dir, ['gallery-safety-1785272712.db', 'pre-1.22-1791503525.db', 'stopped-pre-1.22-1791503525.db']);
  mk(dir, [auto(8)]);
  const removed = pruneBackups(dir, 10);
  assert.deepEqual(removed, []);
  assert.ok(fs.existsSync(path.join(dir, auto(8))));
});

test('keeps the newest N automatic backups and removes only the older automatic ones', () => {
  const dir = tmp();
  mk(dir, Array.from({ length: 14 }, (_, i) => auto(i + 1)));
  mk(dir, ['gallery-predeploy-20260725T211554.db', 'pre-1.21-1.db']);
  const removed = pruneBackups(dir, 10);
  assert.deepEqual(removed, [auto(1), auto(2), auto(3), auto(4)]);
  for (let i = 5; i <= 14; i++) assert.ok(fs.existsSync(path.join(dir, auto(i))), `newest ${auto(i)} kept`);
  assert.ok(fs.existsSync(path.join(dir, 'gallery-predeploy-20260725T211554.db')));
  assert.ok(fs.existsSync(path.join(dir, 'pre-1.21-1.db')));
});

test('removes the WAL/SHM sidecars of a pruned automatic backup, and nothing else', () => {
  const dir = tmp();
  mk(dir, [auto(1), `${auto(1)}-wal`, `${auto(1)}-shm`, auto(2), `${auto(2)}-wal`]);
  pruneBackups(dir, 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), [auto(2), `${auto(2)}-wal`].sort());
});

test('a missing directory or fewer files than the limit is a no-op', () => {
  assert.deepEqual(pruneBackups(path.join(os.tmpdir(), 'does-not-exist-bk'), 10), []);
  const dir = tmp();
  mk(dir, [auto(1), auto(2)]);
  assert.deepEqual(pruneBackups(dir, 10), []);
});
