// Shared code for the database backup tools: chunked AES-256-GCM file encryption, gzip, SQLite
// snapshot and integrity helpers, and a small S3 client on aws4fetch (same style as
// migrate-derivatives.mjs). Used by backup-db-to-r2.mjs, restore-db-from-r2.mjs and the unit tests.
//
// Encrypted file format (all integers big-endian):
//   header: 8 bytes magic "ALBMBK01" + 8 random bytes (IV prefix)
//   chunk i, repeated: u32 ciphertext length (<= 1 MiB) | ciphertext | 16-byte GCM tag
//   IV of chunk i:  IV prefix (8) + u32 counter i (4)
//   AAD of chunk i: u32 index i (4) + u8 isLast (1 for the final chunk, else 0)
// The final chunk is the one that ends exactly at end of file, so a file cut at a chunk boundary
// makes its last chunk look non-final and fails authentication. Plaintext of 0 bytes is one empty
// final chunk. Trailing bytes after the final chunk make it fail too.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import Database from 'better-sqlite3';
import { AwsClient } from 'aws4fetch';

export const MAGIC = Buffer.from('ALBMBK01');
export const HEADER_BYTES = 16;
export const CHUNK_BYTES = 1024 * 1024;
const TAG_BYTES = 16;
export const PART_BYTES = 16 * 1024 * 1024; // single PUT up to this size, multipart above
const PART_ATTEMPTS = 3;

/** Parse BACKUP_ENCRYPTION_KEY. Never echoes the value. */
export function parseKeyHex(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes); generate one with: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

function checkKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('encryption key must be a 32-byte Buffer');
}

function chunkIv(prefix, index) {
  const iv = Buffer.alloc(12);
  prefix.copy(iv, 0, 0, 8);
  iv.writeUInt32BE(index, 8);
  return iv;
}

function chunkAad(index, isLast) {
  const aad = Buffer.alloc(5);
  aad.writeUInt32BE(index, 0);
  aad[4] = isLast ? 1 : 0;
  return aad;
}

/** Fill buf from fd at position; returns bytes read (short only at end of file). */
function readAt(fd, buf, len, position) {
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, buf, got, len - got, position + got);
    if (n === 0) break;
    got += n;
  }
  return got;
}

function writeAll(fd, buf) {
  let off = 0;
  while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
}

/** Encrypt inPath to outPath (overwritten if it exists). */
export async function encryptFile(inPath, outPath, key) {
  checkKey(key);
  const size = fs.statSync(inPath).size;
  const prefix = crypto.randomBytes(8);
  const inFd = fs.openSync(inPath, 'r');
  const outFd = fs.openSync(outPath, 'w', 0o600);
  let ok = false;
  try {
    writeAll(outFd, Buffer.concat([MAGIC, prefix]));
    const buf = Buffer.allocUnsafe(CHUNK_BYTES);
    let offset = 0;
    for (let index = 0; ; index++) {
      const n = readAt(inFd, buf, CHUNK_BYTES, offset);
      offset += n;
      const isLast = n < CHUNK_BYTES || offset >= size;
      const cipher = crypto.createCipheriv('aes-256-gcm', key, chunkIv(prefix, index), { authTagLength: TAG_BYTES });
      cipher.setAAD(chunkAad(index, isLast));
      const ct = Buffer.concat([cipher.update(buf.subarray(0, n)), cipher.final()]);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(ct.length, 0);
      writeAll(outFd, len);
      writeAll(outFd, ct);
      writeAll(outFd, cipher.getAuthTag());
      if (isLast) break;
    }
    ok = true;
  } finally {
    fs.closeSync(inFd);
    fs.closeSync(outFd);
    if (!ok) fs.rmSync(outPath, { force: true });
  }
}

/** Decrypt inPath to outPath. Fails (and removes outPath) on a wrong key, any tampering, truncation or reordering. */
export async function decryptFile(inPath, outPath, key) {
  checkKey(key);
  const size = fs.statSync(inPath).size;
  const inFd = fs.openSync(inPath, 'r');
  const outFd = fs.openSync(outPath, 'wx', 0o600);
  let ok = false;
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    if (readAt(inFd, header, HEADER_BYTES, 0) !== HEADER_BYTES || !header.subarray(0, 8).equals(MAGIC)) {
      throw new Error('not an encrypted Albm backup (bad or missing header)');
    }
    const prefix = header.subarray(8, 16);
    let pos = HEADER_BYTES;
    for (let index = 0; ; index++) {
      const lenBuf = Buffer.alloc(4);
      if (readAt(inFd, lenBuf, 4, pos) !== 4) throw new Error(`truncated: no chunk header at chunk ${index}`);
      const ctLen = lenBuf.readUInt32BE(0);
      if (ctLen > CHUNK_BYTES) throw new Error(`corrupt chunk length at chunk ${index}`);
      pos += 4;
      const body = Buffer.alloc(ctLen + TAG_BYTES);
      if (readAt(inFd, body, body.length, pos) !== body.length) throw new Error(`truncated inside chunk ${index}`);
      pos += body.length;
      const isLast = pos === size;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, chunkIv(prefix, index), { authTagLength: TAG_BYTES });
      decipher.setAAD(chunkAad(index, isLast));
      decipher.setAuthTag(body.subarray(ctLen));
      let plain;
      try {
        plain = Buffer.concat([decipher.update(body.subarray(0, ctLen)), decipher.final()]);
      } catch {
        throw new Error(`authentication failed at chunk ${index} (wrong key, or the file is tampered, truncated or reordered)`);
      }
      writeAll(outFd, plain);
      if (isLast) break;
    }
    ok = true;
  } finally {
    fs.closeSync(inFd);
    fs.closeSync(outFd);
    if (!ok) fs.rmSync(outPath, { force: true });
  }
}

export async function gzipFile(inPath, outPath) {
  await pipeline(fs.createReadStream(inPath), createGzip(), fs.createWriteStream(outPath, { flags: 'wx', mode: 0o600 }));
}

export async function gunzipFile(inPath, outPath) {
  await pipeline(fs.createReadStream(inPath), createGunzip(), fs.createWriteStream(outPath, { flags: 'wx', mode: 0o600 }));
}

export async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Online-consistent copy of a live SQLite database via the backup API. Opened read-only: never writes to the source. */
export async function snapshotDb(dbPath, dest) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }
}

/** Returns 'ok' or the first problem SQLite reports. */
export function integrityCheck(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db.pragma('integrity_check', { simple: true });
  } finally {
    db.close();
  }
}

/** Row count per table, or null when the table does not exist. */
export function tableCounts(file, tables) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const out = {};
    for (const t of tables) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      out[t] = exists ? db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n : null;
    }
    return out;
  } finally {
    db.close();
  }
}

/** Parses BACKUP_PREFIX: no leading slash, trailing slash, default db-backups/. */
export function backupPrefixFromEnv(env) {
  let p = (env.BACKUP_PREFIX || 'db-backups/').replace(/^\/+/, '');
  if (!p.endsWith('/')) p += '/';
  return p;
}

/** Same S3_* variables as the app. Throws naming the missing ones. */
export function s3ConfigFromEnv(env) {
  const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  return {
    endpoint: env.S3_ENDPOINT.replace(/\/+$/, ''),
    bucket: env.S3_BUCKET,
    region: env.S3_REGION || 'auto',
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

const xmlText = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function withRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= PART_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/** Path-style S3 client (R2, B2, MinIO, IONOS, AWS). */
export function createS3(cfg) {
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: cfg.region,
    retries: 2,
  });
  const objectUrl = (key) => `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    objectUrl,

    /** Object size from HEAD, or null when the object does not exist. */
    async headSize(key) {
      const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HEAD -> ${res.status}`);
      return Number(res.headers.get('content-length'));
    },

    /** Single PUT for a small Buffer body. */
    async putObject(key, body, contentType = 'application/octet-stream') {
      await withRetry(async () => {
        const res = await client.fetch(objectUrl(key), { method: 'PUT', body, headers: { 'Content-Type': contentType } });
        if (!res.ok) throw new Error(`PUT -> ${res.status}`);
      });
    },

    /** Multipart upload of a file in PART_BYTES parts, each retried; aborted on failure. */
    async multipartUpload(file, key) {
      const url = objectUrl(key);
      const size = fs.statSync(file).size;
      const created = await client.fetch(`${url}?uploads`, { method: 'POST' });
      const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1];
      if (!created.ok || !uploadId) throw new Error(`CreateMultipartUpload -> ${created.status}`);
      const idQuery = `uploadId=${encodeURIComponent(uploadId)}`;
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.allocUnsafe(PART_BYTES);
      try {
        const parts = [];
        for (let offset = 0, partNumber = 1; offset < size; offset += PART_BYTES, partNumber++) {
          const len = Math.min(PART_BYTES, size - offset);
          if (fs.readSync(fd, buf, 0, len, offset) !== len) throw new Error(`short read at byte ${offset}`);
          const etag = await withRetry(async () => {
            const res = await client.fetch(`${url}?partNumber=${partNumber}&${idQuery}`, {
              method: 'PUT',
              body: buf.subarray(0, len),
            });
            const tag = res.headers.get('etag');
            if (!res.ok || !tag) throw new Error(`UploadPart -> ${res.status}`);
            return tag;
          });
          parts.push(`<Part><PartNumber>${partNumber}</PartNumber><ETag>${etag}</ETag></Part>`);
        }
        const done = await client.fetch(`${url}?${idQuery}`, {
          method: 'POST',
          body: `<CompleteMultipartUpload>${parts.join('')}</CompleteMultipartUpload>`,
        });
        // CompleteMultipartUpload can answer 200 with an <Error> body, so the body is checked too.
        const text = await done.text();
        if (!done.ok || text.includes('<Error>')) throw new Error(`CompleteMultipartUpload -> ${done.status}`);
      } catch (err) {
        await client.fetch(`${url}?${idQuery}`, { method: 'DELETE' }).catch(() => {});
        throw err;
      } finally {
        fs.closeSync(fd);
      }
    },

    /** Stream an object to dest (a new file). Returns the bytes written. */
    async getToFile(key, dest) {
      const res = await client.fetch(objectUrl(key), { method: 'GET' });
      if (!res.ok || !res.body) throw new Error(`GET -> ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 }));
      return fs.statSync(dest).size;
    },

    /** Every object under prefix (all pages): [{ key, size, lastModified }]. */
    async listKeys(prefix) {
      const out = [];
      let token = '';
      do {
        const query =
          `list-type=2&prefix=${encodeURIComponent(prefix)}` +
          (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
        const res = await client.fetch(`${cfg.endpoint}/${cfg.bucket}?${query}`, { method: 'GET' });
        if (!res.ok) throw new Error(`LIST -> ${res.status}`);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = xmlText(/<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] ?? '');
          const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1]);
          const lastModified = /<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1] ?? '';
          out.push({ key, size, lastModified });
        }
        const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? xmlText(next[1]) : '';
      } while (token);
      return out;
    },
  };
}
