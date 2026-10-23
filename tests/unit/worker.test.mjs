import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cleanAlt } from '../../worker/engines/alt-ollama.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(root, 'worker', 'albm-worker.mjs');
const TOKEN = 'test-token';
const JOBS = [
  { photoId: 'p1', galleryId: 'g1', filename: 'a.jpg', width: 10, height: 10, imageUrl: '/api/worker/image/p1?variant=web' },
  { photoId: 'bad-photo', galleryId: 'g1', filename: 'b.jpg', width: 10, height: 10, imageUrl: '/api/worker/image/bad-photo?variant=web' },
  { photoId: 'p3', galleryId: 'g1', filename: 'c.jpg', width: 10, height: 10, imageUrl: '/api/worker/image/p3?variant=web' },
];

// Mock Albm: jobs are served once per task, then empty. mode '401' rejects everything.
async function mockAlbm({ mode = 'ok' } = {}) {
  const requests = [];
  const results = [];
  const served = new Set();
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const body = [];
    for await (const c of req) body.push(c);
    requests.push({ method: req.method, path: u.pathname, query: u.searchParams, auth: req.headers.authorization });
    const json = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (mode === '401' || req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: 'unauthorized' });
    if (u.pathname === '/api/worker/jobs') {
      const task = u.searchParams.get('task');
      if (served.has(task)) return json(200, { jobs: [], remaining: 0 });
      served.add(task);
      return json(200, { jobs: JOBS, remaining: 0 });
    }
    if (u.pathname.startsWith('/api/worker/image/')) {
      res.writeHead(200, { 'content-type': 'image/webp' });
      return res.end(Buffer.from('RIFF0000WEBPVP8 fake'));
    }
    if (u.pathname === '/api/worker/results' && req.method === 'POST') {
      const parsed = JSON.parse(Buffer.concat(body).toString());
      results.push(parsed);
      return json(200, { ok: true, applied: parsed.results.length, skipped: [] });
    }
    json(404, { error: 'not found' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    results,
    close: () => new Promise((r) => server.close(r)),
  };
}

function runCli(args, env = {}) {
  const base = { ...process.env, WORKER_FAKE_ENGINES: '1' };
  delete base.ALBM_URL;
  delete base.ALBM_WORKER_TOKEN;
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...base, ...env }, timeout: 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

test('full loop posts bibs and alt results with engine, version, shapes and auth', async () => {
  const srv = await mockAlbm();
  try {
    const r = await runCli(['--url', srv.url, '--token', TOKEN]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(srv.requests.every((q) => q.auth === `Bearer ${TOKEN}`));
    const bibs = srv.results.find((b) => b.task === 'bibs');
    const alt = srv.results.find((b) => b.task === 'alt');
    assert.equal(bibs.engine, 'fake-bibs');
    assert.equal(bibs.version, 1);
    assert.equal(alt.engine, 'fake-alt');
    assert.equal(alt.version, 1);
    const ok = bibs.results.find((x) => x.photoId === 'p1');
    assert.deepEqual(ok.bibs, [{ number: '20', confidence: 0.99 }, { number: '7', confidence: 0.8 }]);
    assert.deepEqual(alt.results.find((x) => x.photoId === 'p1'), { photoId: 'p1', alt: 'A test photo.' });
    assert.match(r.stdout, /done: analysed=6 errors=0/);
  } finally {
    await srv.close();
  }
});

test('a 401 from the server exits 1 immediately', async () => {
  const srv = await mockAlbm({ mode: '401' });
  try {
    const t0 = Date.now();
    const r = await runCli(['--url', srv.url, '--token', 'wrong', '--loop']);
    assert.equal(r.code, 1);
    assert.ok(Date.now() - t0 < 10_000, 'did not sleep or retry');
    assert.equal(srv.results.length, 0);
  } finally {
    await srv.close();
  }
});

test('a failing photo posts an error item and the run continues', async () => {
  const srv = await mockAlbm();
  try {
    const r = await runCli(['--url', srv.url, '--token', TOKEN], { WORKER_FAKE_FAIL: 'bad' });
    assert.equal(r.code, 0, r.stderr);
    for (const task of ['bibs', 'alt']) {
      const body = srv.results.find((b) => b.task === task);
      assert.equal(body.results.length, 3);
      const err = body.results.find((x) => x.photoId === 'bad-photo');
      assert.match(err.error, /simulated failure/);
      assert.equal(err.bibs, undefined);
      assert.ok(body.results.find((x) => x.photoId === 'p3').bibs ?? body.results.find((x) => x.photoId === 'p3').alt);
    }
  } finally {
    await srv.close();
  }
});

test('--dry-run posts nothing', async () => {
  const srv = await mockAlbm();
  try {
    const r = await runCli(['--url', srv.url, '--token', TOKEN, '--dry-run']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(srv.results.length, 0);
    assert.ok(srv.requests.some((q) => q.path === '/api/worker/jobs'));
    assert.match(r.stdout, /dry-run: nothing was posted/);
  } finally {
    await srv.close();
  }
});

test('a trailing slash in --url works', async () => {
  const srv = await mockAlbm();
  try {
    const r = await runCli(['--url', `${srv.url}/`, '--token', TOKEN]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(srv.results.length, 2);
    assert.ok(srv.requests.every((q) => !q.path.startsWith('//')));
  } finally {
    await srv.close();
  }
});

test('missing --url exits 2', async () => {
  const r = await runCli(['--token', TOKEN]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /missing --url/);
});

test('cleanAlt keeps one sentence, strips quotes, caps length', () => {
  assert.equal(cleanAlt('  "A dog runs on the beach. It is happy."  '), 'A dog runs on the beach.');
  assert.equal(cleanAlt('Two riders\n\nsprint uphill'), 'Two riders sprint uphill');
  assert.equal(cleanAlt('x'.repeat(300)).length, 160);
  assert.equal(cleanAlt(''), '');
});

test('parseScore reads the first number and clamps it to 1-10', async () => {
  const { parseScore } = await import('../../worker/engines/score-ollama.mjs');
  assert.equal(parseScore('7'), 7);
  assert.equal(parseScore('Score: 8.5/10'), 8.5);
  assert.equal(parseScore('42'), 10);
  assert.equal(parseScore('0'), 1);
  assert.equal(parseScore('no idea'), null);
});
