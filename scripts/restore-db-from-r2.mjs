#!/usr/bin/env node
// List, download, decrypt and verify database backups written by backup-db-to-r2.mjs.
// Details and the manual restore steps: docs/DB-BACKUP.md.
//
// Usage (env from .env, e.g. node --env-file=.env ...):
//   node scripts/restore-db-from-r2.mjs --list                       newest first, with sizes
//   node scripts/restore-db-from-r2.mjs --latest --out <file>        restore the backup named in latest.json
//   node scripts/restore-db-from-r2.mjs --key <key> --out <file>     restore one backup by object key
//   node scripts/restore-db-from-r2.mjs --verify                     restore the latest to a temp file, check it, delete it
// Never overwrites an existing --out file or the live $DATA_DIR/gallery.db.
// Exits 0 on success, 1 on failure, 2 on bad arguments.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backupPrefixFromEnv,
  createS3,
  decryptFile,
  gunzipFile,
  integrityCheck,
  parseKeyHex,
  s3ConfigFromEnv,
  sha256File,
  tableCounts,
} from './db-backup-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const LIST = flag('--list');
const LATEST = flag('--latest');
const KEY = value('--key');
const OUT = value('--out');
const VERIFY = flag('--verify');
const MiB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
const BACKUP_RE = /gallery-[^/]*\.db\.gz\.enc$/;

function die(msg) {
  console.error(msg);
  console.error('Usage: node scripts/restore-db-from-r2.mjs --list');
  console.error('       node scripts/restore-db-from-r2.mjs --latest --out <file>');
  console.error('       node scripts/restore-db-from-r2.mjs --key <objectKey> --out <file>');
  console.error('       node scripts/restore-db-from-r2.mjs --verify');
  process.exit(2);
}

const modes = [LIST, LATEST || KEY !== undefined, VERIFY].filter(Boolean).length;
if (modes !== 1) die('choose exactly one of --list, --latest / --key <key>, --verify');
if (KEY !== undefined && LATEST) die('--latest and --key cannot be combined');
if ((LATEST || KEY !== undefined) && (OUT === undefined || OUT === '')) die('--latest and --key need --out <file>');
if ((LIST || VERIFY) && OUT !== undefined) die('--out only applies to --latest or --key');

const env = process.env;
const dataDir = path.resolve(env.DATA_DIR ?? path.join(process.cwd(), 'data'));
const liveDb = path.join(dataDir, 'gallery.db');

/** Print the manual procedure for putting a restored file in place. */
function printManualRestore(restored) {
  console.error(`
Refusing to overwrite the live database: ${liveDb}
Restore to a separate file first (--out), then do this by hand, with RESTORED=${restored}:
  1. Stop the app (launchd: sudo launchctl bootout system/com.gallery).
  2. Move the current database aside, keeping it:
       mv "${liveDb}" "${liveDb}.before-restore"
       for f in -wal -shm; do [ -e "${liveDb}$f" ] && mv "${liveDb}$f" "${liveDb}$f.before-restore"; done
  3. Copy the restored file into place:
       cp "$RESTORED" "${liveDb}"
  4. Make sure no stale -wal/-shm files remain next to it (they belong to the old database):
       rm -f "${liveDb}-wal" "${liveDb}-shm"
  5. Start the app again (sudo launchctl bootstrap system /Library/LaunchDaemons/com.gallery.plist).
`);
}

/**
 * Download one backup, check its size (and sha256 when known), decrypt, gunzip into dir.
 * Returns the path of the restored .db file inside dir.
 */
async function fetchRestore(s3, key, encKey, dir, expect = {}) {
  const remoteSize = await s3.headSize(key);
  if (remoteSize === null) throw new Error(`backup not found: ${key}`);
  const enc = path.join(dir, 'backup.db.gz.enc');
  const gz = path.join(dir, 'backup.db.gz');
  const db = path.join(dir, 'backup.db');
  const got = await s3.getToFile(key, enc);
  if (got !== remoteSize) throw new Error(`download truncated: got ${got} bytes, bucket has ${remoteSize}`);
  if (expect.sha256 && (await sha256File(enc)) !== expect.sha256) {
    throw new Error('sha256 of the downloaded file does not match latest.json');
  }
  await decryptFile(enc, gz, encKey);
  await gunzipFile(gz, db);
  fs.rmSync(enc, { force: true });
  fs.rmSync(gz, { force: true });
  return db;
}

function checkRestored(file) {
  const check = integrityCheck(file);
  if (check !== 'ok') throw new Error(`integrity_check on the restored database failed: ${check}`);
  const counts = tableCounts(file, ['galleries', 'photos']);
  return `galleries: ${counts.galleries ?? 'missing'}, photos: ${counts.photos ?? 'missing'}`;
}

async function readLatest(s3, prefix, dir) {
  const latestKey = `${prefix}latest.json`;
  if ((await s3.headSize(latestKey)) === null) throw new Error(`no ${latestKey} in the bucket; use --list and --key`);
  const file = path.join(dir, 'latest.json');
  await s3.getToFile(latestKey, file);
  const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof latest.key !== 'string' || !latest.key.startsWith(prefix)) throw new Error('latest.json has an unexpected key');
  return latest;
}

async function main() {
  const prefix = backupPrefixFromEnv(env);
  const s3 = createS3(s3ConfigFromEnv(env));

  if (LIST) {
    const backups = (await s3.listKeys(prefix)).filter((o) => BACKUP_RE.test(o.key)).sort((a, b) => (a.key < b.key ? 1 : -1));
    if (!backups.length) console.log(`no backups under ${prefix}`);
    for (const o of backups) console.log(`${MiB(o.size).padStart(8)} MiB  ${o.lastModified}  ${o.key}`);
    return;
  }

  if (OUT !== undefined && path.resolve(OUT) === liveDb) {
    printManualRestore('<the file you restored with --out>');
    throw new Error('refusing to restore over the live database');
  }
  if (OUT !== undefined && fs.existsSync(OUT)) {
    throw new Error(`refusing to overwrite an existing file: ${OUT}`);
  }
  if (OUT !== undefined && !fs.existsSync(path.dirname(path.resolve(OUT)))) {
    throw new Error(`output directory does not exist: ${path.dirname(path.resolve(OUT))}`);
  }

  if (!env.BACKUP_ENCRYPTION_KEY) throw new Error('BACKUP_ENCRYPTION_KEY is not set; it is needed to decrypt backups');
  const encKey = parseKeyHex(env.BACKUP_ENCRYPTION_KEY);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'albm-restore-'));
  try {
    let key;
    let expect = {};
    if (VERIFY || LATEST) {
      const latest = await readLatest(s3, prefix, tmp);
      key = latest.key;
      expect = { sha256: latest.sha256 };
    } else {
      key = KEY;
    }

    const dir = fs.mkdtempSync(path.join(tmp, 'work-'));
    const restored = await fetchRestore(s3, key, encKey, dir, expect);
    const summary = checkRestored(restored);

    if (VERIFY) {
      console.log(`verify ok: ${key} (${summary})`);
      return;
    }
    fs.copyFileSync(restored, path.resolve(OUT), fs.constants.COPYFILE_EXCL);
    console.log(`restored ${key} -> ${path.resolve(OUT)} (${summary})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`${VERIFY ? 'verify' : 'restore'} failed: ${err.message}`);
  process.exitCode = 1;
});
