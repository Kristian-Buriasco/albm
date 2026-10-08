import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIngest } from '../ftp-ingest.mjs';

// ---------- fake Albm ----------
async function fakeAlbm(handler) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const m = body.toString('latin1').match(/filename="([^"]+)"/);
      const hit = { url: req.url, auth: req.headers.authorization, filename: m?.[1], size: body.length, body };
      hits.push(hit);
      const [status, json] = handler(hit, hits.length);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

// ---------- tiny FTP client ----------
function ftpClient(port) {
  const sock = net.connect(port, '127.0.0.1');
  sock.setEncoding('utf8');
  let buf = '';
  const waiters = [];
  sock.on('data', (d) => {
    buf += d;
    flush();
  });
  function flush() {
    // A reply is complete at a line "NNN text" (single) — good enough for tests.
    while (waiters.length) {
      const lines = buf.split('\r\n');
      const idx = lines.findIndex((l) => /^\d{3} /.test(l));
      if (idx === -1) return;
      const reply = lines.slice(0, idx + 1).join('\r\n');
      buf = lines.slice(idx + 1).join('\r\n');
      waiters.shift()(reply);
    }
  }
  const read = () => new Promise((r) => (waiters.push(r), flush()));
  const cmd = async (c) => {
    sock.write(c + '\r\n');
    return read();
  };
  return {
    sock,
    greeting: read(),
    cmd,
    async login(user, pass) {
      await cmd(`USER ${user}`);
      return cmd(`PASS ${pass}`);
    },
    async dataPort(mode = 'PASV') {
      const r = await cmd(mode);
      if (mode === 'EPSV') return Number(r.match(/\|\|\|(\d+)\|/)[1]);
      const n = r.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
      return Number(n[5]) * 256 + Number(n[6]);
    },
    async stor(name, data, mode = 'PASV') {
      const port = await this.dataPort(mode);
      const d = net.connect(port, '127.0.0.1');
      await new Promise((r) => d.once('connect', r));
      const first = cmd(`STOR ${name}`); // 150
      const r150 = await first;
      d.end(data);
      const r226 = await read();
      return [r150, r226];
    },
    close: () => sock.destroy(),
  };
}

async function setup(handler, extra = {}) {
  const albm = await fakeAlbm(handler);
  const spool = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
  const cfg = {
    albmUrl: albm.url,
    listen: { host: '127.0.0.1', port: 0, pasvHost: '127.0.0.1', pasvMin: 52000, pasvMax: 52999 },
    spoolDir: spool,
    retryBaseMs: 15,
    users: [{ name: 'cam1', password: 'pw1', galleryId: 'G1', token: 'TOK1' }],
    ...extra,
  };
  const ingest = createIngest(cfg, { log: () => {} });
  const port = await ingest.start();
  const client = ftpClient(port);
  await client.greeting;
  return { albm, ingest, client, spool, cfg, port, async done() { client.close(); await ingest.stop(); await albm.close(); } };
}

const until = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
};
// Structurally complete JPEG: SOI ... EOI.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
const listSpool = (spool, sub) => {
  const d = path.join(spool, 'cam1', sub);
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

test('rejects a wrong password, accepts the right one', async () => {
  const t = await setup(() => [201, {}]);
  assert.match(await t.client.login('cam1', 'nope'), /^530/);
  assert.match(await t.client.login('cam1', 'pw1'), /^230/);
  await t.done();
});

test('uploads a JPEG to the right gallery with the bearer token (PASV)', async () => {
  const t = await setup(() => [201, { id: 'p1' }]);
  await t.client.login('cam1', 'pw1');
  const [r150, r226] = await t.client.stor('IMG_0001.JPG', JPEG);
  assert.match(r150, /^150/);
  assert.match(r226, /^226/);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  assert.equal(t.albm.hits[0].url, '/api/publish/G1/photos');
  assert.equal(t.albm.hits[0].auth, 'Bearer TOK1');
  assert.equal(t.albm.hits[0].filename, 'IMG_0001.JPG');
  assert.ok(t.albm.hits[0].body.includes(JPEG));
  assert.ok(await until(() => listSpool(t.spool, 'pending').length === 0), 'spool cleaned after upload');
  await t.done();
});

test('works over EPSV too', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  const [, r226] = await t.client.stor('a.jpg', JPEG, 'EPSV');
  assert.match(r226, /^226/);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  await t.done();
});

test('non-image files (RAW sidecars) are accepted by FTP but never uploaded', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  const [, r226] = await t.client.stor('IMG_0002.CR3', Buffer.alloc(5000));
  assert.match(r226, /^226/, 'camera must not see an error');
  assert.equal(t.ingest.stats.skipped, 1);
  assert.equal(t.albm.hits.length, 0);
  await t.done();
});

test('temp-name upload followed by RNTO is published under the final name', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  await t.client.stor('IMG_0003.jpg.tmp', JPEG);
  assert.equal(t.albm.hits.length, 0, 'nothing uploaded under the temp name');
  assert.match(await t.client.cmd('RNFR IMG_0003.jpg.tmp'), /^350/);
  assert.match(await t.client.cmd('RNTO IMG_0003.jpg'), /^250/);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  assert.equal(t.albm.hits[0].filename, 'IMG_0003.jpg');
  await t.done();
});

test('path traversal in the filename is neutralised', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  await t.client.stor('../../../etc/evil.jpg', JPEG);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  assert.equal(t.albm.hits[0].filename, 'evil.jpg');
  await t.done();
});

test('transient server errors are retried until they succeed', async () => {
  const t = await setup((_h, n) => (n <= 2 ? [503, { error: 'busy' }] : [201, {}]));
  await t.client.login('cam1', 'pw1');
  await t.client.stor('retry.jpg', JPEG);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  assert.equal(t.albm.hits.length, 3);
  await t.done();
});

test('429 rate limiting is retried, not dropped', async () => {
  const t = await setup((_h, n) => (n === 1 ? [429, { error: 'Too many requests' }] : [201, {}]));
  await t.client.login('cam1', 'pw1');
  await t.client.stor('rl.jpg', JPEG);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  await t.done();
});

test('duplicates (HTTP 200) are counted and not retried', async () => {
  const t = await setup(() => [200, { duplicate: true, existingFilename: 'x.jpg' }]);
  await t.client.login('cam1', 'pw1');
  await t.client.stor('dup.jpg', JPEG);
  assert.ok(await until(() => t.ingest.stats.duplicates === 1));
  assert.equal(t.albm.hits.length, 1);
  await t.done();
});

test('permanent rejections (415) go to failed/ with a reason', async () => {
  const t = await setup(() => [415, { error: 'Only JPEG, PNG' }]);
  await t.client.login('cam1', 'pw1');
  await t.client.stor('bad.jpg', JPEG);
  assert.ok(await until(() => listSpool(t.spool, 'failed').length === 1));
  assert.equal(t.ingest.stats.failed, 1);
  const failed = listSpool(t.spool, 'failed');
  assert.match(fs.readFileSync(path.join(t.spool, 'cam1', 'failed', failed[0], 'REASON.txt'), 'utf8'), /415/);
  await t.done();
});

test('a rejected token pauses the user, keeps files, and a restart recovers them', async () => {
  const t = await setup(() => [401, { error: 'Unauthorized' }]);
  await t.client.login('cam1', 'pw1');
  await t.client.stor('keep1.jpg', JPEG);
  await t.client.stor('keep2.jpg', JPEG);
  assert.ok(await until(() => t.albm.hits.length >= 1));
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(t.albm.hits.length, 1, 'stopped hammering Albm after the 401');
  assert.equal(listSpool(t.spool, 'pending').length, 2, 'files kept');
  t.client.close();
  await t.ingest.stop();

  // "Fixed token" + restart.
  const good = await fakeAlbm(() => [201, {}]);
  const again = createIngest({ ...t.cfg, albmUrl: good.url }, { log: () => {} });
  await again.start();
  assert.ok(await until(() => again.stats.uploaded === 2));
  assert.deepEqual(good.hits.map((h) => h.filename).sort(), ['keep1.jpg', 'keep2.jpg']);
  await again.stop();
  await good.close();
  await t.albm.close();
});

test('a burst of frames all arrive (concurrent uploads)', async () => {
  const t = await setup(() => [201, {}], { concurrency: 3 });
  await t.client.login('cam1', 'pw1');
  for (let i = 0; i < 25; i++) await t.client.stor(`burst-${i}.jpg`, JPEG);
  assert.ok(await until(() => t.ingest.stats.uploaded === 25, 8000));
  assert.equal(new Set(t.albm.hits.map((h) => h.filename)).size, 25);
  await t.done();
});

test('a truncated transfer (dropped connection) is discarded, never published', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  const [, r] = await t.client.stor('half.jpg', JPEG.subarray(0, 300)); // no EOI marker
  assert.match(r, /^426/, 'camera is told to resend');
  assert.equal(t.albm.hits.length, 0);
  assert.equal(t.ingest.stats.incomplete, 1);
  assert.equal(listSpool(t.spool, 'pending').length, 0);
  // A complete resend then goes through.
  const [, ok] = await t.client.stor('half.jpg', JPEG);
  assert.match(ok, /^226/);
  assert.ok(await until(() => t.ingest.stats.uploaded === 1));
  await t.done();
});

test('PNG completeness is checked via IEND', async () => {
  const t = await setup(() => [201, {}]);
  await t.client.login('cam1', 'pw1');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82])]);
  assert.match((await t.client.stor('ok.png', png))[1], /^226/);
  assert.match((await t.client.stor('cut.png', png.subarray(0, 50)))[1], /^426/);
  await t.done();
});
