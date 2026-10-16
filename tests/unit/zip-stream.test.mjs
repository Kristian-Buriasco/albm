import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';

// zip-stream.ts imports nothing extensionless itself, but keep the same TS resolve hook as the
// other suites so sibling imports keep working if that changes.
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

const { streamZip } = await import('../../src/lib/zip-stream.ts');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-stream-'));

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function unzipTest(zipPath) {
  const r = spawnSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

function entryNames(zipPath) {
  const r = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean);
}

const hasUnzip = spawnSync('unzip', ['-v']).error === undefined;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('streams a valid store-only zip with file, buffer and folder entries', async () => {
  const filePath = path.join(TMP, 'source.jpg');
  fs.writeFileSync(filePath, Buffer.from('file-bytes'));
  const stream = streamZip(
    (async function* () {
      yield { name: 'from-file.jpg', file: filePath };
      yield { name: 'buf-one.jpg', body: Buffer.from('one') };
      yield { name: 'sub/a.jpg', body: Buffer.from('two') };
    })(),
  );
  const bytes = await readAll(stream);
  assert.ok(bytes.length > 0);
  assert.deepEqual(bytes.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  const zipPath = path.join(TMP, 'out.zip');
  fs.writeFileSync(zipPath, bytes);
  if (hasUnzip) {
    unzipTest(zipPath);
    assert.deepEqual(entryNames(zipPath).sort(), ['buf-one.jpg', 'from-file.jpg', 'sub/a.jpg']);
  } else {
    console.warn('unzip not installed; skipping unzip -t assertions');
  }
});

test('pulls entries lazily: the next one is not requested until the previous is read', async () => {
  const requested = [];
  const big = Buffer.alloc(1024 * 1024, 7); // larger than the stream buffer, so it needs reads
  const stream = streamZip(
    (async function* () {
      requested.push('first');
      yield { name: 'first.bin', body: big };
      requested.push('second');
      yield { name: 'second.bin', body: Buffer.from('2') };
      requested.push('third');
      yield { name: 'third.bin', body: Buffer.from('3') };
    })(),
  );
  const reader = stream.getReader();
  const firstChunk = await reader.read();
  assert.ok(!firstChunk.done);
  await new Promise((resolve) => setTimeout(resolve, 50)); // give a runaway feed time to show
  assert.deepEqual(requested, ['first'], 'second entry must wait for the client to read');

  const chunks = [firstChunk.value];
  for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value);
  assert.deepEqual(requested, ['first', 'second', 'third']);

  const zipPath = path.join(TMP, 'lazy.zip');
  fs.writeFileSync(zipPath, Buffer.concat(chunks.map((c) => Buffer.from(c))));
  if (hasUnzip) unzipTest(zipPath);
});

test('client cancel stops the feed', async () => {
  const requested = [];
  const big = Buffer.alloc(1024 * 1024, 1);
  const stream = streamZip(
    (async function* () {
      for (let i = 0; i < 20; i++) {
        requested.push(i);
        yield { name: `e${i}.bin`, body: big };
      }
    })(),
  );
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel('client gone');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(requested.length < 20, `feed kept going after cancel (${requested.length} entries)`);
});

test('a generator error errors the stream instead of hanging', async () => {
  const stream = streamZip(
    (async function* () {
      yield { name: 'ok.bin', body: Buffer.from('fine') };
      throw new Error('boom');
    })(),
  );
  const TIMEOUT = Symbol('timeout');
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), 5000);
  });
  try {
    const result = await Promise.race([readAll(stream).then(() => 'resolved', (err) => err), timeout]);
    assert.notEqual(result, TIMEOUT, 'stream hung after generator error');
    assert.ok(result instanceof Error, 'stream should error');
    assert.equal(result.message, 'boom');
  } finally {
    clearTimeout(timer);
  }
});
