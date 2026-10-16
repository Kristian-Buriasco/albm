import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptFile, encryptFile, parseKeyHex, HEADER_BYTES, CHUNK_BYTES } from '../../scripts/db-backup-lib.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-test-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));

let seq = 0;
const work = () => path.join(root, `f${seq++}`);
const KEY = crypto.randomBytes(32);

/** Encrypt bytes and return the encrypted file path. */
async function encryptBytes(data, key = KEY) {
  const plain = work();
  const enc = work();
  fs.writeFileSync(plain, data);
  await encryptFile(plain, enc, key);
  return enc;
}

async function roundTrip(size) {
  const data = crypto.randomBytes(size);
  const enc = await encryptBytes(data);
  const out = work();
  await decryptFile(enc, out, KEY);
  assert.ok(fs.readFileSync(out).equals(data), `round trip of ${size} bytes`);
}

test('round trip: 0 bytes', () => roundTrip(0));
test('round trip: 1 byte', () => roundTrip(1));
test('round trip: exactly 1 MiB', () => roundTrip(CHUNK_BYTES));
test('round trip: 1 MiB + 1 byte', () => roundTrip(CHUNK_BYTES + 1));
test('round trip: 5 MiB', () => roundTrip(5 * CHUNK_BYTES));

test('wrong key fails and leaves no output file', async () => {
  const enc = await encryptBytes(crypto.randomBytes(1000));
  const out = work();
  await assert.rejects(decryptFile(enc, out, crypto.randomBytes(32)), /authentication failed/);
  assert.equal(fs.existsSync(out), false);
});

test('a flipped byte in the ciphertext fails', async () => {
  const enc = await encryptBytes(crypto.randomBytes(1000));
  const buf = fs.readFileSync(enc);
  buf[HEADER_BYTES + 4 + 10] ^= 0x01;
  fs.writeFileSync(enc, buf);
  await assert.rejects(decryptFile(enc, work(), KEY), /authentication failed/);
});

test('a flipped byte in the IV prefix fails', async () => {
  const enc = await encryptBytes(crypto.randomBytes(1000));
  const buf = fs.readFileSync(enc);
  buf[10] ^= 0x80;
  fs.writeFileSync(enc, buf);
  await assert.rejects(decryptFile(enc, work(), KEY), /authentication failed/);
});

// 2.5 MiB = three chunks: 1 MiB, 1 MiB, 0.5 MiB (final). Each full chunk is 4 + 1 MiB + 16 bytes on disk.
const SEG = 4 + CHUNK_BYTES + 16;
const multi = crypto.randomBytes(2.5 * CHUNK_BYTES);

test('truncated at a chunk boundary fails (no final-flagged chunk)', async () => {
  const enc = await encryptBytes(multi);
  fs.truncateSync(enc, HEADER_BYTES + SEG);
  await assert.rejects(decryptFile(enc, work(), KEY), /authentication failed/);
});

test('truncated mid-chunk fails', async () => {
  const enc = await encryptBytes(multi);
  fs.truncateSync(enc, HEADER_BYTES + SEG + 500);
  await assert.rejects(decryptFile(enc, work(), KEY), /truncated/);
});

test('header only, or a file shorter than a header, fails', async () => {
  const enc = await encryptBytes(multi);
  fs.truncateSync(enc, HEADER_BYTES);
  await assert.rejects(decryptFile(enc, work(), KEY), /truncated/);
  fs.truncateSync(enc, 5);
  await assert.rejects(decryptFile(enc, work(), KEY), /bad or missing header/);
});

test('reordering two full chunks fails', async () => {
  const enc = await encryptBytes(multi);
  const buf = fs.readFileSync(enc);
  const a = buf.subarray(HEADER_BYTES, HEADER_BYTES + SEG);
  const b = buf.subarray(HEADER_BYTES + SEG, HEADER_BYTES + 2 * SEG);
  const swapped = Buffer.concat([buf.subarray(0, HEADER_BYTES), b, a, buf.subarray(HEADER_BYTES + 2 * SEG)]);
  fs.writeFileSync(enc, swapped);
  await assert.rejects(decryptFile(enc, work(), KEY), /authentication failed/);
});

test('trailing bytes after the final chunk fail', async () => {
  const enc = await encryptBytes(crypto.randomBytes(1000));
  fs.appendFileSync(enc, Buffer.alloc(20));
  await assert.rejects(decryptFile(enc, work(), KEY), /authentication failed/);
});

test('parseKeyHex accepts 64 hex chars and rejects anything else', () => {
  assert.equal(parseKeyHex('ab'.repeat(32)).length, 32);
  assert.equal(parseKeyHex('AB'.repeat(32)).length, 32);
  assert.throws(() => parseKeyHex('ab'.repeat(31)), /exactly 64 hex/);
  assert.throws(() => parseKeyHex('zz'.repeat(32)), /exactly 64 hex/);
  assert.throws(() => parseKeyHex(undefined), /exactly 64 hex/);
});
