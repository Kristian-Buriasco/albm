import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';

// Set before the dynamic import: env.ts reads DATA_DIR at import time.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'os-data-'));
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
const { objectStoreConfig, derivativeKey, offloadDerivatives, fetchDerivative, removeDerivatives,
  removeGalleryDerivatives, galleryObjectKeys, hasObject, uploadDerivative } = store;

const BUCKET = 'test-bucket';
const PAGE_SIZE = 2; // small page so listing pagination is exercised
const S3_VARS = ['STORAGE_BACKEND', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY', 'S3_KEY_PREFIX', 'S3_KEEP_LOCAL'];

// ---- fake S3 server -------------------------------------------------------

let server;
let endpoint;
const objects = new Map(); // key (without bucket) -> { body, contentType, cacheControl }
const failPut = new Set(); // keys whose PUT answers 500
const requests = []; // { method, key, auth }
let listCalls = 0;

function startFakeS3() {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const [bucket, ...rest] = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const key = rest.join('/');
      const auth = String(req.headers.authorization ?? '');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      requests.push({ method: req.method, key, auth });

      if (!auth.startsWith('AWS4-HMAC-SHA256')) return void res.writeHead(403).end();
      if (bucket !== BUCKET) return void res.writeHead(404).end();

      if (!key && req.method === 'GET' && url.searchParams.get('list-type') === '2') {
        listCalls++;
        const prefix = url.searchParams.get('prefix') ?? '';
        const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const start = Number(url.searchParams.get('continuation-token') ?? 0);
        const page = all.slice(start, start + PAGE_SIZE);
        const truncated = start + PAGE_SIZE < all.length;
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>' +
          `<Name>${BUCKET}</Name><Prefix>${prefix}</Prefix>` +
          `<IsTruncated>${truncated}</IsTruncated>` +
          (truncated ? `<NextContinuationToken>${start + PAGE_SIZE}</NextContinuationToken>` : '') +
          page.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('') +
          '</ListBucketResult>';
        return void res.writeHead(200, { 'Content-Type': 'application/xml' }).end(xml);
      }

      if (req.method === 'PUT') {
        if (failPut.has(key)) return void res.writeHead(500).end();
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
        res.writeHead(200, { 'Content-Type': obj.contentType ?? 'application/octet-stream' });
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
  failPut.clear();
  requests.length = 0;
  listCalls = 0;
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
    ...extra,
  });
}

const put = (key, body, contentType = 'image/webp') => objects.set(key, { body: Buffer.from(body), contentType });

// ---- local file layout ----------------------------------------------------

function writeLocal(galleryId, variant, stem, body = `${variant}:${stem}`) {
  const dir = path.join(DATA_DIR, 'photos', galleryId, variant);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stem}.webp`);
  fs.writeFileSync(file, body);
  return file;
}

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

test('objectStoreConfig is null when STORAGE_BACKEND is unset or local', () => {
  delete process.env.STORAGE_BACKEND;
  assert.equal(objectStoreConfig(), null);
  withS3Env({ STORAGE_BACKEND: 'local' });
  assert.equal(objectStoreConfig(), null);
});

test('objectStoreConfig is null when any S3 var is missing', () => {
  mock.method(console, 'error', () => {});
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    withS3Env({ [k]: '' });
    assert.equal(objectStoreConfig(), null, `missing ${k}`);
  }
});

test('objectStoreConfig is populated with all vars; prefix ends in "/", endpoint has no trailing slash', () => {
  withS3Env({ S3_ENDPOINT: `${endpoint}///`, S3_KEY_PREFIX: '/photos' });
  assert.deepEqual(objectStoreConfig(), {
    endpoint,
    bucket: BUCKET,
    region: 'auto',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'secret',
    prefix: 'photos/',
    keepLocal: true,
  });
  withS3Env({ S3_KEY_PREFIX: 'a/', S3_REGION: 'eu-west-1' });
  assert.equal(objectStoreConfig().prefix, 'a/');
  assert.equal(objectStoreConfig().region, 'eu-west-1');
});

test('keepLocal is true by default and false for S3_KEEP_LOCAL=0', () => {
  assert.equal(objectStoreConfig().keepLocal, true);
  withS3Env({ S3_KEEP_LOCAL: '1' });
  assert.equal(objectStoreConfig().keepLocal, true);
  withS3Env({ S3_KEEP_LOCAL: '0' });
  assert.equal(objectStoreConfig().keepLocal, false);
  withS3Env({ S3_KEEP_LOCAL: 'false' });
  assert.equal(objectStoreConfig().keepLocal, false);
});

// ---- (b) keys -------------------------------------------------------------

test('derivativeKey builds <prefix><gallery>/<variant>/<stem>.webp', () => {
  assert.equal(derivativeKey({ prefix: 'p/' }, 'gal', 'thumb', 'IMG_1.jpg'), 'p/gal/thumb/IMG_1.webp');
  assert.equal(derivativeKey({ prefix: '' }, 'gal', 'md', 'IMG_1.jpg'), 'gal/md/IMG_1.webp');
});

test('derivativeKey turns IMG_1.CR3 into IMG_1.webp', () => {
  assert.equal(derivativeKey({ prefix: '' }, 'gal', 'web', 'IMG_1.CR3'), 'gal/web/IMG_1.webp');
});

// ---- (c) offload ----------------------------------------------------------

test('offloadDerivatives uploads thumb/md/web with webp type and immutable cache headers, keeps local files by default', async () => {
  const files = ['thumb', 'md', 'web'].map((v) => writeLocal('g1', v, 'IMG_1', `bytes-${v}`));
  await offloadDerivatives('g1', 'IMG_1.CR3');

  for (const v of ['thumb', 'md', 'web']) {
    const obj = objects.get(`g1/${v}/IMG_1.webp`);
    assert.ok(obj, `${v} uploaded`);
    assert.equal(obj.body.toString(), `bytes-${v}`);
    assert.equal(obj.contentType, 'image/webp');
    assert.equal(obj.cacheControl, 'public, max-age=31536000, immutable');
  }
  for (const f of files) assert.ok(fs.existsSync(f), `kept ${f}`);
});

test('offloadDerivatives deletes local files after upload when S3_KEEP_LOCAL=0', async () => {
  withS3Env({ S3_KEEP_LOCAL: '0' });
  const files = ['thumb', 'md', 'web'].map((v) => writeLocal('g2', v, 'IMG_2'));
  await offloadDerivatives('g2', 'IMG_2.jpg');

  assert.equal(objects.size, 3);
  for (const f of files) assert.ok(!fs.existsSync(f), `removed ${f}`);
});

test('offloadDerivatives keeps the local file whose PUT failed and never throws', async () => {
  withS3Env({ S3_KEEP_LOCAL: '0' });
  const errorLog = mock.method(console, 'error', () => {});
  failPut.add('g3/md/IMG_3.webp');
  const files = ['thumb', 'md', 'web'].map((v) => writeLocal('g3', v, 'IMG_3'));

  await assert.doesNotReject(offloadDerivatives('g3', 'IMG_3.jpg'));

  assert.ok(objects.has('g3/thumb/IMG_3.webp'));
  assert.ok(objects.has('g3/web/IMG_3.webp'));
  assert.ok(!objects.has('g3/md/IMG_3.webp'));
  assert.ok(fs.existsSync(files[1]), 'md kept locally after failed PUT');
  assert.ok(!fs.existsSync(files[0]), 'thumb removed after successful PUT');
  assert.ok(!fs.existsSync(files[2]), 'web removed after successful PUT');
  assert.equal(errorLog.mock.callCount(), 1);
});

test('uploadDerivative returns false when the local file does not exist', async () => {
  assert.equal(await uploadDerivative('nope', 'thumb', 'IMG_9.jpg'), false);
  assert.equal(objects.size, 0);
});

// ---- (d) fetch ------------------------------------------------------------

test('fetchDerivative returns a Response with the stored bytes, null for a missing key', async () => {
  put('g4/web/IMG_4.webp', [1, 2, 3, 250]);
  const res = await fetchDerivative('g4', 'web', 'IMG_4.CR2');
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  assert.deepEqual([...Buffer.from(await res.arrayBuffer())], [1, 2, 3, 250]);

  assert.equal(await fetchDerivative('g4', 'md', 'IMG_4.CR2'), null);
});

// ---- (e) removal ----------------------------------------------------------

test('removeDerivatives deletes the three variants of one photo and leaves others', async () => {
  put('g5/thumb/IMG_5.webp', 't');
  put('g5/md/IMG_5.webp', 'm');
  put('g5/web/IMG_5.webp', 'w');
  put('g5/web/IMG_6.webp', 'other');

  await removeDerivatives('g5', 'IMG_5.jpg');

  assert.deepEqual([...objects.keys()], ['g5/web/IMG_6.webp']);
});

test('removeDerivatives tolerates objects that are already gone', async () => {
  await assert.doesNotReject(removeDerivatives('g5', 'MISSING.jpg'));
});

test('removeGalleryDerivatives paginates through every key of the gallery and spares other galleries', async () => {
  for (const k of ['g6/thumb/a.webp', 'g6/thumb/b.webp', 'g6/md/a.webp', 'g6/web/a.webp', 'g6/web/c.webp']) {
    put(k, k);
  }
  put('g60/thumb/x.webp', 'keep'); // shares the "g6" string prefix but is a different gallery
  put('g6x.webp', 'keep');

  listCalls = 0;
  await removeGalleryDerivatives('g6');

  assert.ok(listCalls >= 3, `expected >=3 list pages for 5 keys at page size ${PAGE_SIZE}, got ${listCalls}`);
  assert.deepEqual([...objects.keys()].sort(), ['g60/thumb/x.webp', 'g6x.webp']);
});

// ---- (f) listing ----------------------------------------------------------

test('galleryObjectKeys returns every key of the gallery (across pages) and hasObject matches', async () => {
  withS3Env({ S3_KEY_PREFIX: 'site' });
  put('site/g7/thumb/IMG_1.webp', 'a');
  put('site/g7/md/IMG_1.webp', 'b');
  put('site/g7/web/IMG_1.webp', 'c');
  put('site/g7/web/IMG_2.webp', 'd');
  put('site/g8/thumb/IMG_1.webp', 'e');

  const keys = await galleryObjectKeys('g7');
  assert.deepEqual(keys, new Set([
    'site/g7/thumb/IMG_1.webp',
    'site/g7/md/IMG_1.webp',
    'site/g7/web/IMG_1.webp',
    'site/g7/web/IMG_2.webp',
  ]));

  assert.equal(hasObject(keys, 'g7', 'thumb', 'IMG_1.CR3'), true);
  assert.equal(hasObject(keys, 'g7', 'md', 'IMG_2.jpg'), false);
  assert.equal(hasObject(null, 'g7', 'thumb', 'IMG_1.CR3'), false);
});

// ---- (g) store off --------------------------------------------------------

test('with STORAGE_BACKEND unset every function is a no-op and makes no network call', async () => {
  // Valid S3 vars present, but the backend switch is off: nothing may reach the fake server.
  withS3Env();
  delete process.env.STORAGE_BACKEND;
  const local = writeLocal('g9', 'thumb', 'IMG_9', 'local');
  put('g9/thumb/IMG_9.webp', 'remote');

  assert.equal(await offloadDerivatives('g9', 'IMG_9.jpg'), undefined);
  assert.equal(await fetchDerivative('g9', 'thumb', 'IMG_9.jpg'), null);
  assert.equal(await removeDerivatives('g9', 'IMG_9.jpg'), undefined);
  assert.equal(await removeGalleryDerivatives('g9'), undefined);
  assert.equal(await galleryObjectKeys('g9'), null);
  assert.equal(hasObject(null, 'g9', 'thumb', 'IMG_9.jpg'), false);
  assert.equal(await uploadDerivative('g9', 'thumb', 'IMG_9.jpg'), false);

  assert.equal(requests.length, 0, 'no network call');
  assert.ok(fs.existsSync(local), 'local file untouched');
  assert.ok(objects.has('g9/thumb/IMG_9.webp'), 'bucket object untouched');
});

test('S3_GALLERIES limits which galleries use the bucket', async () => {
  const { galleryUsesObjectStore } = store;
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { STORAGE_BACKEND: 's3', S3_ENDPOINT: 'http://127.0.0.1:1', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' });
    delete process.env.S3_GALLERIES;
    assert.equal(galleryUsesObjectStore('any'), true);
    process.env.S3_GALLERIES = 'g1, g2';
    assert.equal(galleryUsesObjectStore('g1'), true);
    assert.equal(galleryUsesObjectStore('g2'), true);
    assert.equal(galleryUsesObjectStore('g3'), false);
    process.env.STORAGE_BACKEND = 'local';
    assert.equal(galleryUsesObjectStore('g1'), false);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
