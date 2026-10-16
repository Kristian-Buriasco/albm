#!/usr/bin/env node
// Encrypted, online snapshot of the gallery database, uploaded to the S3/R2 bucket.
// Pipeline: sqlite backup API -> PRAGMA integrity_check -> gzip -> AES-256-GCM (db-backup-lib.mjs)
// -> upload -> HEAD size check -> <BACKUP_PREFIX>latest.json. Details: docs/DB-BACKUP.md.
//
// Usage (env from .env, e.g. node --env-file=.env ...):
//   node scripts/backup-db-to-r2.mjs              upload a backup
//   node scripts/backup-db-to-r2.mjs --dry-run    snapshot, check and encrypt locally; no upload, no network
// Exits 0 on success, 1 on any failure.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backupPrefixFromEnv,
  createS3,
  encryptFile,
  gzipFile,
  integrityCheck,
  parseKeyHex,
  PART_BYTES,
  s3ConfigFromEnv,
  sha256File,
  snapshotDb,
} from './db-backup-lib.mjs';

const DRY = process.argv.slice(2).includes('--dry-run');
const MiB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

async function main() {
  const env = process.env;
  if (!env.BACKUP_ENCRYPTION_KEY) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not set; refusing to run without it (generate one with: openssl rand -hex 32)');
  }
  const key = parseKeyHex(env.BACKUP_ENCRYPTION_KEY);
  const s3cfg = DRY ? null : s3ConfigFromEnv(env);

  const dataDir = path.resolve(env.DATA_DIR ?? path.join(process.cwd(), 'data'));
  const dbPath = path.join(dataDir, 'gallery.db');
  if (!fs.existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);
  const prefix = backupPrefixFromEnv(env);

  const createdAt = new Date().toISOString();
  const objectKey = `${prefix}${createdAt.slice(0, 4)}/${createdAt.slice(5, 7)}/gallery-${createdAt.replace(/[:.]/g, '-')}.db.gz.enc`;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'albm-backup-'));
  try {
    const snap = path.join(tmp, 'snapshot.db');
    const gz = path.join(tmp, 'snapshot.db.gz');
    const enc = path.join(tmp, 'snapshot.db.gz.enc');

    await snapshotDb(dbPath, snap);
    const check = integrityCheck(snap);
    if (check !== 'ok') throw new Error(`integrity_check on the snapshot failed: ${check}`);
    const dbBytes = fs.statSync(snap).size;

    await gzipFile(snap, gz);
    await encryptFile(gz, enc, key);
    const encBytes = fs.statSync(enc).size;
    const gzBytes = fs.statSync(gz).size;

    if (DRY) {
      console.log(
        `dry run: would upload ${objectKey}: ${MiB(dbBytes)} MiB snapshot -> ${MiB(encBytes)} MiB encrypted ` +
          `(gzip ${MiB(gzBytes)} MiB). Nothing uploaded.`,
      );
      return;
    }

    const s3 = createS3(s3cfg);
    if (encBytes <= PART_BYTES) await s3.putObject(objectKey, fs.readFileSync(enc), 'application/octet-stream');
    else await s3.multipartUpload(enc, objectKey);
    const remote = await s3.headSize(objectKey);
    if (remote !== encBytes) throw new Error(`verify failed: remote ${remote} bytes, local ${encBytes}`);

    const latest = { key: objectKey, size: encBytes, sha256: await sha256File(enc), createdAt, dbBytes };
    await s3.putObject(`${prefix}latest.json`, Buffer.from(`${JSON.stringify(latest, null, 2)}\n`), 'application/json');

    console.log(
      `backup ok: ${objectKey}: ${MiB(dbBytes)} MiB snapshot -> ${MiB(encBytes)} MiB encrypted (gzip ${MiB(gzBytes)} MiB)`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`backup failed: ${err.message}`);
  process.exitCode = 1;
});
