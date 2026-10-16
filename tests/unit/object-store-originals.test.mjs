import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';

// Set before the dynamic import: env.ts reads DATA_DIR at import time.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'os-orig-'));
process.env.DATA_DIR = DATA_DIR;

// object-store.ts (like paths.ts) imports siblings extensionless ('./paths'); native ESM
// needs the extension, so resolve a relative specifier to its .ts file when it is missing.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (err.code !== 'ERR_MODULE_NOT_FOUND' || !relative || !context.parentURL?.startsWith('file:')) throw err;
    const file = fileURLToPath(new URL(specifier, context.parentURL)) + '.ts';
    if (!fs.existsSync(file)) throw err;
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
}`),
);

const store = await import('../../src/lib/object-store.ts');
const { originalsEnabled, originalKey, mirrorOriginal, ensureLocalOriginal, copyStagingToOriginal,
  trashOriginal, galleryUsesObjectStore } = store;

const BUCKET = 'test-bucket';
const MiB = 1024 * 1024;
const S3_VARS = ['STORAGE_BACKEND', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY', 'S3_KEY_PREFIX', 'S3_KEEP_LOCAL', 'S3_ORIGINALS', 'S3_GALLERIES'];

// ---- fake S3 server -------------------------------------------------------

let server;
let endpoint;
const objects = new Map(); // key (without bucket) -> { body, contentType }
const uploads = new Map(); // uploadId -> { key, contentType, parts: Map<partNumber, Buffer> }
const failPut = new Set(); // keys whose single PUT answers 500
const failPart = new Set(); // part numbers whose PUT answers 500
const requests = []; // { method, key, search, auth }
let uploadSeq = 0;

function startFakeS3() {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const [bucket, ...rest] = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const key = rest.join('/');
      const auth = String(req.headers.authorization ?? '');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      requests.push({ method: req.method, key, search: url.search, auth });

      if (!auth.startsWith('AWS4-HMAC-SHA256')) return void res.writeHead(403).end();
      if (bucket !== BUCKET) return void res.writeHead(404).end();

      // Multipart: create, then per-upload part PUT / complete POST / abort DELETE.
      if (url.searchParams.has('uploads') && req.method === 'POST') {
        const uploadId = `up${++uploadSeq}`;
        uploads.set(uploadId, { key, contentType: req.headers['content-type'], parts: new Map() });
        return void res.writeHead(200, { 'Content-Type': 'application/xml' }).end(
          `<?xml version="1.0"?><InitiateMultipartUploadResult><Bucket>${BUCKET}</Bucket><Key>${key}</Key>` +
          `<UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
        );
      }
      if (url.searchParams.has('uploadId')) {
        const up = uploads.get(url.searchParams.get('uploadId'));
        if (!up) return void res.writeHead(404).end();
        if (req.method === 'PUT' && url.searchParams.has('partNumber')) {
          const n = Number(url.searchParams.get('partNumber'));
          if (failPart.has(n)) return void res.writeHead(500).end();
          up.parts.set(n, Buffer.concat(chunks));
          return void res.writeHead(200, { ETag: `"etag-${n}"` }).end();
        }
        if (req.method === 'POST') {
          const xml = Buffer.concat(chunks).toString();
          const listed = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>([^<]*)<\/ETag>/g)];
          const bodies = [];
          for (const [, n] of listed) {
            const part = up.parts.get(Number(n));
            if (!part) return void res.writeHead(400).end('<Error>missing part</Error>');
            bodies.push(part);
          }
          objects.set(up.key, { body: Buffer.concat(bodies), contentType: up.contentType });
          uploads.delete(url.searchParams.get('uploadId'));
          return void res.writeHead(200, { 'Content-Type': 'application/xml' }).end(
            '<CompleteMultipartUploadResult/>',
          );
        }
        if (req.method === 'DELETE') {
          uploads.delete(url.searchParams.get('uploadId'));
          return void res.writeHead(204).end();
        }
      }

      if (req.method === 'PUT') {
        if (failPut.has(key)) return void res.writeHead(500).end();
        const copySource = req.headers['x-amz-copy-source'];
        if (copySource) {
          const from = objects.get(decodeURIComponent(String(copySource)).replace(`/${BUCKET}/`, ''));
          if (!from) return void res.writeHead(404).end();
          objects.set(key, { ...from });
          return void res.writeHead(200).end('<CopyObjectResult/>');
        }
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers['content-type'],
          cacheControl: req.headers['cache-control'],
        });
        return void res.writeHead(200).end();
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const obj = objects.get(key);
        if (!obj) return void res.writeHead(404).end();
        res.writeHead(200, {
          'Content-Type': obj.contentType ?? 'application/octet-stream',
          'Content-Length': obj.body.length,
        });
        return void res.end(req.method === 'GET' ? obj.body : undefined);
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      res.writeHead(405).end();
    });
    server.listen(0, '127.0.0.1', () => {
      endpoint = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

function resetFake() {
  objects.clear();
  uploads.clear();
  failPut.clear();
  failPart.clear();
  requests.length = 0;
}

/** Point the process env at the fake server; S3 vars not listed are removed. */
function withS3Env(extra = {}) {
  for (const k of S3_VARS) delete process.env[k];
  Object.assign(process.env, {
    STORAGE_BACKEND: 's3',
    S3_ENDPOINT: endpoint,
    S3_BUCKET: BUCKET,
    S3_ACCESS_KEY_ID: 'AKIATEST',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_ORIGINALS: '1',
    ...extra,
  });
}

const put = (key, body, contentType = 'application/octet-stream') => objects.set(key, { body: Buffer.from(body), contentType });

// ---- local file layout ----------------------------------------------------

function writeOriginal(galleryId, filename, body) {
  const dir = path.join(DATA_DIR, 'photos', galleryId, 'originals');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  fs.writeFileSync(file, body);
  return file;
}

const silence = () => mock.method(console, 'error', () => {});

before(startFakeS3);
after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  resetFake();
  withS3Env();
});

afterEach(() => {
  mock.restoreAll();
  for (const k of S3_VARS) delete process.env[k];
});

// ---- (a) config -----------------------------------------------------------

test('originalsEnabled is false by default and when the backend is local', () => {
  withS3Env();
  delete process.env.S3_ORIGINALS;
  assert.equal(originalsEnabled(), false, 'S3_ORIGINALS unset');
  withS3Env({ S3_ORIGINALS: '1', STORAGE_BACKEND: 'local' });
  assert.equal(originalsEnabled(), false, 'backend local');
});

test('originalsEnabled accepts 1/true/yes case-insensitively and rejects other values', () => {
  for (const v of ['1', 'true', 'yes', 'TRUE', 'Yes']) {
    withS3Env({ S3_ORIGINALS: v });
    assert.equal(originalsEnabled(), true, `S3_ORIGINALS=${v}`);
  }
  for (const v of ['0', 'false', 'no', '', 'on']) {
    withS3Env({ S3_ORIGINALS: v });
    assert.equal(originalsEnabled(), false, `S3_ORIGINALS=${v}`);
  }
});

test('originals respect the S3_GALLERIES allowlist', async () => {
  withS3Env({ S3_GALLERIES: 'only-this' });
  assert.equal(galleryUsesObjectStore('other'), false);
  writeOriginal('other', 'IMG_A.jpg', 'x');
  assert.equal(await mirrorOriginal('other', 'IMG_A.jpg'), false);
  await ensureLocalOriginal('other', 'IMG_B.jpg');
  assert.equal(requests.length, 0, 'no network call for a gallery outside the allowlist');
});

// ---- (b) keys -------------------------------------------------------------

test('originalKey builds <prefix><gallery>/originals/<filename>', () => {
  assert.equal(originalKey({ prefix: 'p/' }, 'gal', 'IMG_1.CR3'), 'p/gal/originals/IMG_1.CR3');
  assert.equal(originalKey({ prefix: '' }, 'gal', 'IMG_1.jpg'), 'gal/originals/IMG_1.jpg');
});

// ---- (c) mirror -----------------------------------------------------------

test('mirrorOriginal uploads a small file with the right key and content type; a second call is a no-op', async () => {
  writeOriginal('m1', 'IMG_1.JPG', 'small-jpeg-bytes');
  writeOriginal('m1', 'RAW_2.png', 'png-bytes');
  writeOriginal('m1', 'RAW_3.CR3', 'raw-bytes');

  assert.equal(await mirrorOriginal('m1', 'IMG_1.JPG'), true);
  assert.equal(await mirrorOriginal('m1', 'RAW_2.png'), true);
  assert.equal(await mirrorOriginal('m1', 'RAW_3.CR3'), true);

  const jpg = objects.get('m1/originals/IMG_1.JPG');
  assert.equal(jpg.body.toString(), 'small-jpeg-bytes');
  assert.equal(jpg.contentType, 'image/jpeg');
  assert.equal(objects.get('m1/originals/RAW_2.png').contentType, 'image/png');
  assert.equal(objects.get('m1/originals/RAW_3.CR3').contentType, 'application/octet-stream');

  const puts = requests.filter((r) => r.method === 'PUT').length;
  assert.equal(await mirrorOriginal('m1', 'IMG_1.JPG'), true);
  assert.equal(requests.filter((r) => r.method === 'PUT').length, puts, 'second call sends no PUT');
});

test('mirrorOriginal returns false when the local file is missing or the upload fails', async () => {
  const errorLog = silence();
  assert.equal(await mirrorOriginal('m2', 'NOPE.jpg'), false);
  writeOriginal('m2', 'FAIL.jpg', 'x');
  failPut.add('m2/originals/FAIL.jpg');
  assert.equal(await mirrorOriginal('m2', 'FAIL.jpg'), false);
  assert.ok(!objects.has('m2/originals/FAIL.jpg'));
  assert.equal(errorLog.mock.callCount(), 1);
});

test('mirrorOriginal of a 40 MiB file uses multipart and stores identical bytes', async () => {
  const body = crypto.randomBytes(40 * MiB);
  writeOriginal('m3', 'BIG_1.jpg', body);

  assert.equal(await mirrorOriginal('m3', 'BIG_1.jpg'), true);

  const stored = objects.get('m3/originals/BIG_1.jpg');
  assert.ok(stored, 'object exists');
  assert.equal(stored.body.length, body.length);
  assert.ok(Buffer.compare(stored.body, body) === 0, 'bytes equal');
  assert.equal(stored.contentType, 'image/jpeg');

  const multipart = requests.filter((r) => r.key === 'm3/originals/BIG_1.jpg' && r.search.includes('uploadId'));
  const partNumbers = requests
    .filter((r) => r.method === 'PUT' && r.search.includes('partNumber='))
    .map((r) => Number(/partNumber=(\d+)/.exec(r.search)[1]));
  assert.deepEqual(partNumbers, [1, 2, 3], '40 MiB in three 16 MiB parts');
  assert.ok(multipart.length >= 4, 'part PUTs plus completion');
  assert.equal(uploads.size, 0, 'no dangling upload');
});

test('a failing multipart part aborts the upload, leaves no object and returns false', async () => {
  const errorLog = silence();
  writeOriginal('m4', 'BIG_2.jpg', crypto.randomBytes(40 * MiB));
  failPart.add(2);

  assert.equal(await mirrorOriginal('m4', 'BIG_2.jpg'), false);

  assert.ok(!objects.has('m4/originals/BIG_2.jpg'), 'no object written');
  assert.equal(uploads.size, 0, 'upload aborted');
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.search.includes('uploadId=')), 'abort sent');
  assert.equal(requests.filter((r) => r.method === 'PUT' && r.search.includes('partNumber=2')).length, 3, 'part 2 retried 3 times');
  assert.equal(errorLog.mock.callCount(), 1);
});

// ---- (d) ensureLocalOriginal ---------------------------------------------

test('ensureLocalOriginal streams a missing original back with identical bytes', async () => {
  const body = crypto.randomBytes(300 * 1024);
  put('d1/originals/IMG_D1.jpg', body);
  const local = path.join(DATA_DIR, 'photos', 'd1', 'originals', 'IMG_D1.jpg');
  assert.ok(!fs.existsSync(local));

  await ensureLocalOriginal('d1', 'IMG_D1.jpg');

  assert.ok(Buffer.compare(fs.readFileSync(local), body) === 0, 'bytes equal');
  assert.deepEqual(fs.readdirSync(path.dirname(local)), ['IMG_D1.jpg'], 'no temp file left behind');
});

test('ensureLocalOriginal is a no-op when the local original exists', async () => {
  put('d2/originals/IMG_D2.jpg', 'remote');
  const local = writeOriginal('d2', 'IMG_D2.jpg', 'local');
  const before = requests.length;

  await ensureLocalOriginal('d2', 'IMG_D2.jpg');

  assert.equal(requests.length, before, 'no GET');
  assert.equal(fs.readFileSync(local, 'utf8'), 'local');
});

test('two concurrent ensureLocalOriginal calls share one GET', async () => {
  put('d3/originals/IMG_D3.jpg', 'concurrent-bytes');
  const local = path.join(DATA_DIR, 'photos', 'd3', 'originals', 'IMG_D3.jpg');

  await Promise.all([ensureLocalOriginal('d3', 'IMG_D3.jpg'), ensureLocalOriginal('d3', 'IMG_D3.jpg')]);

  assert.equal(requests.filter((r) => r.method === 'GET' && r.key === 'd3/originals/IMG_D3.jpg').length, 1);
  assert.equal(fs.readFileSync(local, 'utf8'), 'concurrent-bytes');
});

test('ensureLocalOriginal never throws when the bucket object is missing', async () => {
  const errorLog = silence();
  await assert.doesNotReject(ensureLocalOriginal('d4', 'GONE.jpg'));
  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'photos', 'd4', 'originals', 'GONE.jpg')));
  assert.equal(errorLog.mock.callCount(), 1);
});

// ---- (e) staging copy -----------------------------------------------------

test('copyStagingToOriginal copies the staged bytes to the original key', async () => {
  put('incoming/e1/abc123.bin', 'staged-original');

  assert.equal(await copyStagingToOriginal('incoming/e1/abc123.bin', 'e1', 'IMG_E1.CR3'), true);

  const copy = objects.get('e1/originals/IMG_E1.CR3');
  assert.equal(copy.body.toString(), 'staged-original');
  assert.ok(objects.has('incoming/e1/abc123.bin'), 'staging object left for the caller to delete');
});

test('copyStagingToOriginal returns false when the source is missing', async () => {
  const errorLog = silence();
  assert.equal(await copyStagingToOriginal('incoming/e2/missing.bin', 'e2', 'IMG_E2.jpg'), false);
  assert.ok(!objects.has('e2/originals/IMG_E2.jpg'));
  assert.equal(errorLog.mock.callCount(), 1);
});

// ---- (f) trash ------------------------------------------------------------

test('trashOriginal moves the original to trash/<key>', async () => {
  put('t1/originals/IMG_T1.jpg', 'original-bytes');

  await trashOriginal('t1', 'IMG_T1.jpg');

  assert.equal(objects.get('trash/t1/originals/IMG_T1.jpg').body.toString(), 'original-bytes');
  assert.ok(!objects.has('t1/originals/IMG_T1.jpg'));
});

test('trashOriginal makes no network call when originals are off', async () => {
  withS3Env({ S3_ORIGINALS: '0' });
  put('t2/originals/IMG_T2.jpg', 'keep');

  await trashOriginal('t2', 'IMG_T2.jpg');

  assert.equal(requests.length, 0);
  assert.ok(objects.has('t2/originals/IMG_T2.jpg'));
});
