import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { AwsClient } from 'aws4fetch';
import { thumbPath, mdPath, webPath, webpName, originalPath } from './paths';

/**
 * Optional S3-compatible object storage (Cloudflare R2, B2, MinIO, IONOS, AWS) for the
 * generated derivatives (thumb / md / web). Off unless STORAGE_BACKEND=s3, so a default
 * install behaves exactly as before: local disk only.
 *
 * Model: local files stay the working copy. After a photo is processed the three
 * derivatives are uploaded; with S3_KEEP_LOCAL=0 the local copies are then removed.
 * Readers are local-first with bucket fallback, so a half-migrated state or a rollback to
 * STORAGE_BACKEND=local never breaks images. The bucket stays private: the app proxies it,
 * so the existing /img access checks remain the only gate. Originals are never offloaded.
 */

export type DerivVariant = 'thumb' | 'md' | 'web';
export const DERIV_VARIANTS: DerivVariant[] = ['thumb', 'md', 'web'];

const LOCAL_PATH = { thumb: thumbPath, md: mdPath, web: webPath } as const;

export interface ObjectStoreConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  keepLocal: boolean;
}

/** Settings saved from the admin UI; when present they replace the S3_* env vars entirely. */
export interface StorageOverride {
  config: ObjectStoreConfig | null;
  galleries: string[];
  originals: boolean;
}

const g = globalThis as unknown as {
  __s3?: { cfgKey: string; client: AwsClient; cfg: ObjectStoreConfig } | null;
  __s3Warned?: boolean;
  __storageOverride?: (() => StorageOverride | null) | null;
};

/** Registered once at boot (src/instrumentation.ts); kept out of here so this file has no DB import. */
export function setStorageOverride(fn: (() => StorageOverride | null) | null): void {
  g.__storageOverride = fn;
}

function override(): StorageOverride | null {
  try {
    return g.__storageOverride?.() ?? null;
  } catch (err) {
    console.error('[object-store] reading saved storage settings failed, using env:', err);
    return null;
  }
}

/** Parsed config, or null when object storage is off or incompletely configured (fail-safe to local). */
export function objectStoreConfig(): ObjectStoreConfig | null {
  const o = override();
  return o ? o.config : envObjectStoreConfig();
}

/** The env-only configuration (what applies until settings are saved in the admin UI). */
export function envObjectStoreConfig(): ObjectStoreConfig | null {
  if ((process.env.STORAGE_BACKEND ?? 'local').toLowerCase() !== 's3') return null;
  const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET ?? '';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? '';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    if (!g.__s3Warned) {
      g.__s3Warned = true;
      console.error(
        '[object-store] STORAGE_BACKEND=s3 but S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not all set; using local disk.',
      );
    }
    return null;
  }
  let prefix = (process.env.S3_KEY_PREFIX ?? '').replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return {
    endpoint,
    bucket,
    region: process.env.S3_REGION || 'auto',
    accessKeyId,
    secretAccessKey,
    prefix,
    keepLocal: !['0', 'false', 'no'].includes((process.env.S3_KEEP_LOCAL ?? '1').toLowerCase()),
  };
}

export function objectStoreEnabled(): boolean {
  return objectStoreConfig() !== null;
}

/**
 * Optional allowlist (S3_GALLERIES=id1,id2): when set, only those galleries are uploaded to the
 * bucket (derivatives and direct uploads). Reads stay global, so any object already in the bucket
 * is still served. Unset = every gallery.
 */
export function galleryUsesObjectStore(galleryId: string): boolean {
  if (!objectStoreEnabled()) return false;
  const o = override();
  const only = o ? o.galleries : (process.env.S3_GALLERIES ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return only.length === 0 || only.includes(galleryId);
}

function client(): { c: AwsClient; cfg: ObjectStoreConfig } | null {
  const cfg = objectStoreConfig();
  if (!cfg) return null;
  const cfgKey = JSON.stringify(cfg);
  if (!g.__s3 || g.__s3.cfgKey !== cfgKey) {
    g.__s3 = {
      cfgKey,
      cfg,
      client: new AwsClient({
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        service: 's3',
        region: cfg.region,
        retries: 2,
      }),
    };
  }
  return { c: g.__s3.client, cfg };
}

/** Bucket key for a derivative. Content changes are cache-busted by the `?v=` URL stamp, not the key. */
export function derivativeKey(
  cfg: Pick<ObjectStoreConfig, 'prefix'>,
  galleryId: string,
  variant: DerivVariant,
  filename: string,
): string {
  return `${cfg.prefix}${galleryId}/${variant}/${webpName(filename)}`;
}

function objectUrl(cfg: ObjectStoreConfig, key: string): string {
  // Path-style addressing works for R2, B2, MinIO and AWS.
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${cfg.endpoint}/${cfg.bucket}/${encoded}`;
}

async function putFile(
  c: AwsClient,
  cfg: ObjectStoreConfig,
  key: string,
  file: string,
): Promise<void> {
  const body = fs.readFileSync(file); // derivatives are well under 1 MB for normal photos
  const headers = {
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  // Sign first, then send with a plain fetch: inside the Next.js server aws4fetch's own fetch goes
  // through Next's patched fetch, which drops the body length for larger bodies and R2 answers
  // 411 Length Required (seen on noisy 2048px photos). `no-store` keeps Next's data cache out of it.
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const signed = await c.sign(objectUrl(cfg, key), { method: 'PUT', body, headers });
    try {
      const res = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body,
        cache: 'no-store',
      });
      if (res.ok) return;
      last = res.status;
      if (res.status < 500) break; // a 4xx will not get better by retrying
    } catch {
      last = 0; // network error: retry
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  throw new Error(`S3 PUT ${key} -> ${last || 'network error'}`);
}

/** Upload one local derivative if it exists. Returns true when the object is in the bucket. */
export async function uploadDerivative(
  galleryId: string,
  variant: DerivVariant,
  filename: string,
): Promise<boolean> {
  const s = client();
  if (!s || !galleryUsesObjectStore(galleryId)) return false;
  const file = LOCAL_PATH[variant](galleryId, filename);
  if (!fs.existsSync(file)) return false;
  await putFile(s.c, s.cfg, derivativeKey(s.cfg, galleryId, variant, filename), file);
  return true;
}

/**
 * After a photo is processed: upload thumb/md/web; when S3_KEEP_LOCAL=0 delete the local
 * copies, but only for files whose upload succeeded. Never throws: on any failure the local
 * files stay and keep serving.
 */
export async function offloadDerivatives(galleryId: string, filename: string): Promise<void> {
  const s = client();
  if (!s) return;
  for (const variant of DERIV_VARIANTS) {
    try {
      if (await uploadDerivative(galleryId, variant, filename)) {
        if (!s.cfg.keepLocal) fs.rmSync(LOCAL_PATH[variant](galleryId, filename), { force: true });
      }
    } catch (err) {
      console.error(`[object-store] offload failed ${galleryId}/${variant}/${filename}:`, err);
    }
  }
}

/** Read one derivative from the bucket. null = not in the bucket (or store off); throws on transport errors. */
export async function fetchDerivative(
  galleryId: string,
  variant: DerivVariant,
  filename: string,
  headers?: Record<string, string>,
): Promise<Response | null> {
  const s = client();
  if (!s) return null;
  const res = await s.c.fetch(
    objectUrl(s.cfg, derivativeKey(s.cfg, galleryId, variant, filename)),
    { method: 'GET', headers },
  );
  if (res.status === 404) return null;
  if (!res.ok && res.status !== 304) throw new Error(`S3 GET -> ${res.status}`);
  return res;
}

/** Prefix deleted objects are moved under; a bucket lifecycle rule expires it (30 days, see docs). */
export const TRASH_PREFIX = 'trash/';

/**
 * "Delete" = move to `trash/<key>` (server-side copy, then remove the original), so an accidental
 * delete of a photo or gallery can be undone for as long as the lifecycle rule keeps the copy.
 * A missing source is fine. Throws on a failed copy and leaves the original in place.
 */
async function moveToTrash(s: { c: AwsClient; cfg: ObjectStoreConfig }, key: string): Promise<void> {
  const source = `/${s.cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const copy = await s.c.fetch(objectUrl(s.cfg, TRASH_PREFIX + key), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': source },
  });
  if (copy.status === 404) return;
  if (!copy.ok) throw new Error(`S3 COPY ${key} -> ${copy.status}`);
  const del = await s.c.fetch(objectUrl(s.cfg, key), { method: 'DELETE' });
  if (!del.ok && del.status !== 404) throw new Error(`S3 DELETE ${key} -> ${del.status}`);
}

/** Best-effort: move one photo's derivatives to the bucket trash. */
export async function trashDerivatives(galleryId: string, filename: string): Promise<void> {
  const s = client();
  if (!s) return;
  for (const variant of DERIV_VARIANTS) {
    try {
      await moveToTrash(s, derivativeKey(s.cfg, galleryId, variant, filename));
    } catch (err) {
      console.error(`[object-store] trash failed ${galleryId}/${variant}/${filename}:`, err);
    }
  }
}

/** List object keys under a prefix (handles pagination). */
async function listKeys(s: { c: AwsClient; cfg: ObjectStoreConfig }, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token = '';
  do {
    const url =
      `${s.cfg.endpoint}/${s.cfg.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}` +
      (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
    const res = await s.c.fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`S3 LIST -> ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(decodeXml(m[1]));
    const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? decodeXml(next[1]) : '';
  } while (token);
  return keys;
}

function decodeXml(s: string): string {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Best-effort: move everything a gallery has in the bucket to the trash. */
export async function trashGalleryDerivatives(galleryId: string): Promise<void> {
  const s = client();
  if (!s) return;
  try {
    for (const key of await listKeys(s, `${s.cfg.prefix}${galleryId}/`)) {
      try {
        await moveToTrash(s, key);
      } catch (err) {
        console.error(`[object-store] trash ${key} failed:`, err);
      }
    }
  } catch (err) {
    console.error(`[object-store] gallery trash failed ${galleryId}:`, err);
  }
}

/** Keys present in the bucket for a gallery (for the integrity scan). Empty set when the store is off or unreachable. */
export async function galleryObjectKeys(galleryId: string): Promise<Set<string> | null> {
  const s = client();
  if (!s) return null;
  try {
    return new Set(await listKeys(s, `${s.cfg.prefix}${galleryId}/`));
  } catch (err) {
    console.error(`[object-store] list failed ${galleryId}:`, err);
    return null;
  }
}

export function hasObject(
  keys: Set<string> | null,
  galleryId: string,
  variant: DerivVariant,
  filename: string,
): boolean {
  const cfg = objectStoreConfig();
  if (!cfg || !keys) return false;
  return keys.has(derivativeKey(cfg, galleryId, variant, filename));
}

/**
 * Make sure a derivative exists on local disk (face search needs a file path). Downloads it
 * from the bucket back into the normal local location if missing.
 * shortcut: the file is left on disk afterwards (re-cached), upgrade to a tmp+cleanup if
 * face search on an S3-only install ever matters for disk.
 */
export async function ensureLocalDerivative(
  galleryId: string,
  variant: DerivVariant,
  filename: string,
): Promise<void> {
  const local = LOCAL_PATH[variant](galleryId, filename);
  if (fs.existsSync(local)) return;
  try {
    const res = await fetchDerivative(galleryId, variant, filename);
    if (!res || !res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(local), { recursive: true });
    const tmp = `${local}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, local);
  } catch (err) {
    console.error(`[object-store] restore failed ${galleryId}/${variant}/${filename}:`, err);
  }
}

/** S3 client + config for the browser direct-upload path (src/lib/direct-upload.ts), or null when off. */
export function getS3(): { c: AwsClient; cfg: ObjectStoreConfig } | null {
  return client();
}

export { objectUrl };

// ---- originals (S3_ORIGINALS=1): full-size files mirrored to the bucket ----------------------

/** Originals are mirrored only when object storage is on and S3_ORIGINALS is 1/true/yes. */
export function originalsEnabled(): boolean {
  if (!objectStoreEnabled()) return false;
  const o = override();
  return o ? o.originals : ['1', 'true', 'yes'].includes((process.env.S3_ORIGINALS ?? '').toLowerCase());
}

export function originalKey(cfg: Pick<ObjectStoreConfig, 'prefix'>, galleryId: string, filename: string): string {
  return `${cfg.prefix}${galleryId}/originals/${filename}`;
}

const MIRROR_PART_BYTES = 16 * 1024 * 1024;

/** Signed PUT with the putFile retry policy (3 attempts, 5xx and network errors retried). */
async function putSigned(c: AwsClient, url: string, body: Buffer<ArrayBuffer>, headers: Record<string, string>): Promise<Response> {
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const signed = await c.sign(url, { method: 'PUT', body, headers });
    try {
      const res = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body, cache: 'no-store' });
      if (res.ok) return res;
      last = res.status;
      if (res.status < 500) break;
    } catch {
      last = 0;
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  throw new Error(`S3 PUT ${url} -> ${last || 'network error'}`);
}

/** Size of a bucket object, or null when it does not exist. */
async function objectSize(s: { c: AwsClient; cfg: ObjectStoreConfig }, key: string): Promise<number | null> {
  const res = await s.c.fetch(objectUrl(s.cfg, key), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 HEAD ${key} -> ${res.status}`);
  return Number(res.headers.get('content-length') ?? -1);
}

function contentTypeOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

/** Multipart upload of a local file in MIRROR_PART_BYTES slices; aborts the upload on any failure. */
async function uploadMultipart(
  s: { c: AwsClient; cfg: ObjectStoreConfig },
  key: string,
  file: string,
  size: number,
  contentType: string,
): Promise<void> {
  const base = objectUrl(s.cfg, key);
  const created = await s.c.fetch(`${base}?uploads`, { method: 'POST', headers: { 'Content-Type': contentType } });
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1];
  if (!created.ok || !uploadId) throw new Error(`S3 CreateMultipartUpload ${key} -> ${created.status}`);
  const abort = () => s.c.fetch(`${base}?uploadId=${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
  try {
    const parts: { partNumber: number; etag: string }[] = [];
    const fd = fs.openSync(file, 'r');
    try {
      for (let n = 1, offset = 0; offset < size; n++, offset += MIRROR_PART_BYTES) {
        const len = Math.min(MIRROR_PART_BYTES, size - offset);
        const buf = Buffer.alloc(len);
        if (fs.readSync(fd, buf, 0, len, offset) !== len) throw new Error(`short read ${file} at ${offset}`);
        const res = await putSigned(s.c, `${base}?partNumber=${n}&uploadId=${encodeURIComponent(uploadId)}`, buf, {});
        const etag = res.headers.get('etag');
        if (!etag) throw new Error(`S3 UploadPart ${key} #${n}: no ETag`);
        parts.push({ partNumber: n, etag });
      }
    } finally {
      fs.closeSync(fd);
    }
    const xml = parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('');
    const done = await s.c.fetch(`${base}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      body: `<CompleteMultipartUpload>${xml}</CompleteMultipartUpload>`,
      headers: { 'Content-Type': 'application/xml' },
    });
    const text = await done.text();
    if (!done.ok || text.includes('<Error>')) throw new Error(`S3 CompleteMultipartUpload ${key} -> ${done.status}`);
  } catch (err) {
    await abort().catch(() => {});
    throw err;
  }
}

/**
 * Copy one local original into the bucket (single PUT up to 16 MiB, multipart above). Skipped when
 * the same-size object is already there. Verifies the size afterwards. Never throws.
 */
export async function mirrorOriginal(galleryId: string, filename: string): Promise<boolean> {
  try {
    if (!originalsEnabled() || !galleryUsesObjectStore(galleryId)) return false;
    const s = client();
    if (!s) return false;
    const file = originalPath(galleryId, filename);
    if (!fs.existsSync(file)) return false;
    const size = fs.statSync(file).size;
    const key = originalKey(s.cfg, galleryId, filename);
    if ((await objectSize(s, key)) === size) return true;
    const contentType = contentTypeOf(filename);
    if (size <= MIRROR_PART_BYTES) {
      await putSigned(s.c, objectUrl(s.cfg, key), fs.readFileSync(file) as Buffer<ArrayBuffer>,{ 'Content-Type': contentType });
    } else {
      await uploadMultipart(s, key, file, size, contentType);
    }
    if ((await objectSize(s, key)) !== size) throw new Error(`size mismatch after upload ${key}`);
    return true;
  } catch (err) {
    console.error(`[object-store] mirror original failed ${galleryId}/${filename}:`, err);
    return false;
  }
}

/** Downloads share one in-flight promise per local path. */
const inflightOriginals = new Map<string, Promise<void>>();

async function downloadOriginal(galleryId: string, filename: string, local: string): Promise<void> {
  const s = client();
  if (!s) return;
  const key = originalKey(s.cfg, galleryId, filename);
  const res = await s.c.fetch(objectUrl(s.cfg, key), { method: 'GET' });
  if (!res.ok || !res.body) throw new Error(`S3 GET ${key} -> ${res.status}`);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const tmp = `${local}.${process.pid}.${Date.now()}.tmp`;
  try {
    await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), fs.createWriteStream(tmp));
    const expected = res.headers.get('content-length');
    const written = fs.statSync(tmp).size;
    if (expected !== null && written !== Number(expected)) {
      throw new Error(`short download ${key}: ${written} of ${expected} bytes`);
    }
    fs.renameSync(tmp, local);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Make sure the original exists locally (streamed from the bucket when missing). Never throws. */
export async function ensureLocalOriginal(galleryId: string, filename: string): Promise<void> {
  try {
    const local = originalPath(galleryId, filename);
    if (fs.existsSync(local) || !originalsEnabled() || !galleryUsesObjectStore(galleryId)) return;
    let job = inflightOriginals.get(local);
    if (!job) {
      job = downloadOriginal(galleryId, filename, local).finally(() => inflightOriginals.delete(local));
      inflightOriginals.set(local, job);
    }
    await job;
  } catch (err) {
    console.error(`[object-store] restore original failed ${galleryId}/${filename}:`, err);
  }
}

/** Server-side copy of a staged upload to the original key. True on 200, false otherwise. Never throws. */
export async function copyStagingToOriginal(stagingKey: string, galleryId: string, filename: string): Promise<boolean> {
  try {
    const s = client();
    if (!s) return false;
    const source = `/${s.cfg.bucket}/${stagingKey.split('/').map(encodeURIComponent).join('/')}`;
    const res = await s.c.fetch(objectUrl(s.cfg, originalKey(s.cfg, galleryId, filename)), {
      method: 'PUT',
      headers: { 'x-amz-copy-source': source },
    });
    if (res.status !== 200) console.error(`[object-store] copy staging -> original ${res.status}: ${stagingKey}`);
    return res.status === 200;
  } catch (err) {
    console.error(`[object-store] copy staging -> original failed: ${stagingKey}`, err);
    return false;
  }
}

/** Best-effort: move one original to the bucket trash. */
export async function trashOriginal(galleryId: string, filename: string): Promise<void> {
  if (!originalsEnabled()) return;
  const s = client();
  if (!s) return;
  try {
    await moveToTrash(s, originalKey(s.cfg, galleryId, filename));
  } catch (err) {
    console.error(`[object-store] trash original failed ${galleryId}/${filename}:`, err);
  }
}
