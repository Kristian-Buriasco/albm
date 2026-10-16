#!/usr/bin/env node
// Move photo derivatives (thumb / md / web .webp) between local disk and the S3-compatible
// bucket. Originals are never touched. Idempotent and resumable: an object or file already
// present with the same byte size is skipped, so re-running after an interruption is safe.
//
// Usage (env from .env, e.g. node --env-file=.env ...):
//   node scripts/migrate-derivatives.mjs --to s3    [--gallery <id>] [--dry-run] [--prune]
//   node scripts/migrate-derivatives.mjs --to local [--gallery <id>] [--dry-run]
//   node scripts/migrate-derivatives.mjs --restore-trash <id> [--dry-run]
//
// --prune (s3 only) deletes a local file once its upload is verified by HEAD size.
// --restore-trash copies a gallery's derivatives back from trash/ (written when a photo or
// gallery is deleted) to their original keys, then deletes the trash copy.
// Exits 1 if any file failed.

import fs from 'node:fs';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const TO = value('--to');
const ONLY = value('--gallery');
const DRY = flag('--dry-run');
const PRUNE = flag('--prune');
const RESTORE = value('--restore-trash');
const VARIANTS = ['thumb', 'md', 'web'];

function die(msg) {
  console.error(msg);
  console.error('Usage: node scripts/migrate-derivatives.mjs --to s3|local [--gallery <id>] [--dry-run] [--prune]');
  console.error('       node scripts/migrate-derivatives.mjs --restore-trash <galleryId> [--dry-run]');
  process.exit(2);
}

if (flag('--restore-trash')) {
  if (RESTORE === undefined || !/^[\w-]+$/.test(RESTORE)) die(`invalid --restore-trash gallery id: ${RESTORE ?? '(missing)'}`);
  if (TO !== undefined || ONLY !== undefined || PRUNE) die('--restore-trash cannot be combined with --to, --gallery or --prune');
} else {
  if (TO !== 's3' && TO !== 'local') die('--to must be "s3" or "local"');
  if (PRUNE && TO !== 's3') die('--prune only applies to --to s3');
  if (ONLY !== undefined && !/^[\w-]+$/.test(ONLY)) die(`invalid --gallery id: ${ONLY}`);
}

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
const PHOTOS = path.join(DATA_DIR, 'photos');

const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/+$/, '');
const bucket = process.env.S3_BUCKET ?? '';
const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? '';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? '';
let prefix = (process.env.S3_KEY_PREFIX ?? '').replace(/^\/+/, '');
if (prefix && !prefix.endsWith('/')) prefix += '/';
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  die('S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set');
}
const s3 = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: process.env.S3_REGION || 'auto',
  retries: 2,
});

// Path-style addressing works for R2, B2, MinIO and AWS (same as src/lib/object-store.ts).
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const objectUrl = (key) => `${endpoint}/${bucket}/${encodeKey(key)}`;

const totals = { done: 0, skipped: 0, failed: 0 };
const verb = TO === 's3' ? 'uploaded' : 'downloaded';

function localGalleryIds() {
  if (ONLY) return [ONLY];
  if (!fs.existsSync(PHOTOS)) return [];
  return fs
    .readdirSync(PHOTOS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Local derivative files of one gallery. */
function localDerivatives(galleryId) {
  const out = [];
  for (const variant of VARIANTS) {
    const dir = path.join(PHOTOS, galleryId, variant);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (name.endsWith('.webp') && fs.statSync(file).isFile()) {
        out.push({ galleryId, variant, name, file, key: `${prefix}${galleryId}/${variant}/${name}` });
      }
    }
  }
  return out;
}

/** Object size from HEAD, or null when the object does not exist. */
async function headSize(url) {
  const res = await s3.fetch(url, { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HEAD -> ${res.status}`);
  return Number(res.headers.get('content-length'));
}

/** Bucket objects under the prefix that are derivatives. Keys with unexpected shapes are ignored. */
async function listRemote() {
  const out = [];
  const listPrefix = `${prefix}${ONLY ? `${ONLY}/` : ''}`;
  let token = '';
  do {
    const query =
      `list-type=2&prefix=${encodeURIComponent(listPrefix)}` +
      (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
    const res = await s3.fetch(`${endpoint}/${bucket}?${query}`, { method: 'GET' });
    if (!res.ok) throw new Error(`LIST -> ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] ?? '';
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1]);
      const parsed = /^([\w-]+)\/(thumb|md|web)\/([\w.-]+\.webp)$/.exec(key.slice(prefix.length));
      if (parsed) out.push({ galleryId: parsed[1], variant: parsed[2], name: parsed[3], key, size });
    }
    const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? next[1] : '';
  } while (token);
  return out;
}

async function uploadOne(item) {
  const url = objectUrl(item.key);
  const size = fs.statSync(item.file).size;
  let result = 'skipped';
  if ((await headSize(url)) !== size) {
    result = 'done';
    if (!DRY) {
      const res = await s3.fetch(url, {
        method: 'PUT',
        body: fs.readFileSync(item.file),
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
      if (!res.ok) throw new Error(`PUT -> ${res.status}`);
      const remote = await headSize(url);
      if (remote !== size) throw new Error(`verify failed: remote ${remote} bytes, local ${size}`);
    }
  }
  if (PRUNE && !DRY) fs.rmSync(item.file, { force: true });
  return result;
}

async function downloadOne(obj) {
  const dest = path.join(PHOTOS, obj.galleryId, obj.variant, obj.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size === obj.size) return 'skipped';
  if (DRY) return 'done';
  const res = await s3.fetch(objectUrl(obj.key), { method: 'GET' });
  if (!res.ok) throw new Error(`GET -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== obj.size) throw new Error(`got ${buf.length} bytes, listed ${obj.size}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return 'done';
}

/** Run one step per item, count results, print the gallery line. */
async function runGallery(galleryId, items, step) {
  const c = { done: 0, skipped: 0, failed: 0 };
  for (const item of items) {
    try {
      c[await step(item)]++;
    } catch (err) {
      c.failed++;
      console.error(`  FAILED ${item.key}: ${err.message}`);
    }
  }
  for (const k of Object.keys(c)) totals[k] += c[k];
  console.log(`${galleryId}: ${DRY ? 'would ' : ''}${c.done} ${verb}, ${c.skipped} already present, ${c.failed} failed`);
}

/** Copy one trash/ object back to its original key, then delete the trash copy. */
async function restoreOne(trashKey) {
  const original = trashKey.slice('trash/'.length);
  if ((await headSize(objectUrl(original))) !== null) return 'skipped';
  if (DRY) return 'restored';
  const res = await s3.fetch(objectUrl(original), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': `/${bucket}/${encodeKey(trashKey)}` },
  });
  // CopyObject can answer 200 with an <Error> body, so the body is checked as well.
  const body = await res.text();
  if (!res.ok || body.includes('<Error>')) throw new Error(`copy -> ${res.status}`);
  const del = await s3.fetch(objectUrl(trashKey), { method: 'DELETE' });
  if (!del.ok && del.status !== 404) throw new Error(`delete trash copy -> ${del.status}`);
  return 'restored';
}

/** List trash/<prefix><galleryId>/ and restore each derivative, one at a time. */
async function restoreTrash(galleryId) {
  const trashPrefix = `trash/${prefix}${galleryId}/`;
  const trashKeys = [];
  let token = '';
  do {
    const query =
      `list-type=2&prefix=${encodeURIComponent(trashPrefix)}` +
      (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
    const res = await s3.fetch(`${endpoint}/${bucket}?${query}`, { method: 'GET' });
    if (!res.ok) throw new Error(`LIST -> ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] ?? '';
      if (/^(thumb|md|web)\/[\w.-]+\.webp$/.test(key.slice(trashPrefix.length))) trashKeys.push(key);
    }
    const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? next[1] : '';
  } while (token);

  const c = { restored: 0, skipped: 0, failed: 0 };
  for (const trashKey of trashKeys) {
    try {
      c[await restoreOne(trashKey)]++;
    } catch (err) {
      c.failed++;
      console.error(`  FAILED ${trashKey}: ${err.message}`);
    }
  }
  console.log(
    `${galleryId}: ${DRY ? 'would ' : ''}restore ${c.restored}, ${c.skipped} already in place, ${c.failed} failed`,
  );
  process.exitCode = c.failed ? 1 : 0;
}

async function main() {
  if (RESTORE !== undefined) {
    try {
      await restoreTrash(RESTORE);
    } catch (err) {
      console.error(`restore failed: ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }
  let galleries = 0;
  if (TO === 's3') {
    for (const galleryId of localGalleryIds()) {
      const items = localDerivatives(galleryId);
      if (!items.length) continue;
      galleries++;
      await runGallery(galleryId, items, uploadOne);
    }
  } else {
    const groups = new Map();
    for (const obj of await listRemote()) {
      if (!groups.has(obj.galleryId)) groups.set(obj.galleryId, []);
      groups.get(obj.galleryId).push(obj);
    }
    for (const galleryId of [...groups.keys()].sort()) {
      galleries++;
      await runGallery(galleryId, groups.get(galleryId), downloadOne);
    }
  }
  console.log(
    `Summary${DRY ? ' (dry run)' : ''}: ${galleries} galleries, ${totals.done} ${verb}, ` +
      `${totals.skipped} already present, ${totals.failed} failed.`,
  );
  process.exitCode = totals.failed ? 1 : 0;
}

await main();
