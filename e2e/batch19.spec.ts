import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  adminLogin,
  createGallery,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

// Regressions found by the QA round (worker revoke, leasing, long filenames, bad JSON, blank title, NFD passwords).
test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let admin: APIRequestContext;
let worker: APIRequestContext;
let tokenId: string;
let galleryId: string;
let photoId: string;

async function newPhoto(galleryIdArg: string, label: string) {
  const img = tempImagePath(`qa-${label}-${Date.now()}.jpg`);
  const seed = Math.floor(Math.random() * 200);
  await makeTestJpeg(img, { r: 20 + seed, g: 90 + (seed % 90), b: 210 - seed });
  return { img, photo: await uploadPhoto(admin, env.baseUrl, galleryIdArg, img) };
}

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);

  const created = await admin.post(`${env.baseUrl}/api/admin/worker-tokens`, {
    data: { name: `e2e qa ${Date.now()}` },
  });
  const body = (await created.json()) as { token: string; row: { id: string } };
  tokenId = body.row.id;
  worker = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${body.token}` } });

  const g = await createGallery(admin, env.baseUrl, {
    title: `E2E QA ${Date.now()}`,
    type: 'client',
    published: true,
    bibSearch: true,
  });
  galleryId = g.id;
  const { photo } = await newPhoto(galleryId, 'lease');
  photoId = photo.id;
  await waitForPhotoReady(admin, env.baseUrl, galleryId, photoId, 180_000);
});

test.afterAll(async () => {
  await worker?.dispose();
  await admin?.dispose();
});

const jobs = async (query: string) => {
  const res = await worker.get(`${env.baseUrl}/api/worker/jobs?gallery=${galleryId}&${query}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { jobs: { photoId: string }[] };
};

test('a peek (lease=0, used by --dry-run) does not lease the photo', async () => {
  expect((await jobs('task=bibs&lease=0')).jobs.map((j) => j.photoId)).toEqual([photoId]);
  expect((await jobs('task=bibs&lease=0')).jobs.map((j) => j.photoId)).toEqual([photoId]);
  expect((await jobs('task=bibs')).jobs.map((j) => j.photoId)).toEqual([photoId]); // the real lease
  expect((await jobs('task=bibs')).jobs).toHaveLength(0); // now leased
});

test('a redo run with since= visits each photo once and then stops', async () => {
  const done = await worker.post(`${env.baseUrl}/api/worker/results`, {
    data: { task: 'bibs', engine: 'e2e', version: 1, results: [{ photoId, bibs: [{ number: '12', confidence: 0.9 }] }] },
  });
  expect(done.status()).toBe(200);
  const since = Date.now() + 1000; // everything so far was touched before this moment
  const first = await jobs(`task=bibs&redo=1&since=${since}`);
  expect(first.jobs.map((j) => j.photoId)).toEqual([photoId]);
  await worker.post(`${env.baseUrl}/api/worker/results`, {
    data: { task: 'bibs', engine: 'e2e', version: 1, results: [{ photoId, bibs: [] }] },
  });
  const sinceNow = Date.now() - 60_000; // the row was just updated, so it is not older than this
  expect((await jobs(`task=bibs&redo=1&since=${sinceNow}`)).jobs).toHaveLength(0);
});

test('a cleared alt text is offered again without --redo', async () => {
  await jobs('task=alt'); // lease
  await worker.post(`${env.baseUrl}/api/worker/results`, {
    data: { task: 'alt', engine: 'e2e', version: 1, results: [{ photoId, alt: 'A test photo.' }] },
  });
  expect((await jobs('task=alt')).jobs).toHaveLength(0); // done
  const patch = await admin.patch(`${env.baseUrl}/api/admin/photos/${photoId}`, { data: { altText: '' } });
  expect(patch.status()).toBe(200);
  expect((await jobs('task=alt')).jobs.map((j) => j.photoId)).toEqual([photoId]);
});

test('revoking a worker token from the admin panel request shape works', async () => {
  const res = await admin.delete(`${env.baseUrl}/api/admin/worker-tokens`, { data: { id: tokenId } });
  expect(res.status()).toBe(200);
  const status = await worker.get(`${env.baseUrl}/api/worker/status`);
  expect(status.status()).toBe(401);
});

test('a very long filename is stored shortened instead of failing', async () => {
  const img = tempImagePath(`qa-long-${Date.now()}.jpg`);
  const seed = Math.floor(Math.random() * 200);
  await makeTestJpeg(img, { r: 200 - seed, g: 40 + seed, b: 100 });
  const res = await admin.post(`${env.baseUrl}/api/admin/galleries/${galleryId}/photos`, {
    multipart: { file: { name: `${'a'.repeat(300)}.jpg`, mimeType: 'image/jpeg', buffer: fs.readFileSync(img) } },
  });
  expect(res.status()).toBe(201);
  const photo = (await res.json()) as { filename: string };
  expect(photo.filename.length).toBeLessThanOrEqual(120);
  expect(photo.filename.endsWith('.jpg')).toBe(true);
});

test('non-object JSON bodies get a 400, never a 500', async () => {
  const bad = { headers: { 'content-type': 'application/json' }, data: 'null' };
  for (const url of [`/api/admin/galleries/${galleryId}`]) {
    const res = await admin.patch(`${env.baseUrl}${url}`, bad);
    expect(res.status(), url).toBe(400);
  }
  expect((await admin.post(`${env.baseUrl}/api/admin/galleries`, bad)).status()).toBe(400);
  const anon = await fetch(`${env.baseUrl}/api/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  expect(anon.status).toBe(400);
});

test('saving a blank title is rejected instead of silently ignored', async () => {
  for (const title of ['', '   ', null]) {
    const res = await admin.patch(`${env.baseUrl}/api/admin/galleries/${galleryId}`, { data: { title } });
    expect(res.status(), JSON.stringify(title)).toBe(400);
  }
});

test('a gallery password works in composed and decomposed Unicode forms', async ({ playwright }) => {
  const g = await createGallery(admin, env.baseUrl, { title: `E2E NFD ${Date.now()}`, type: 'client', published: true });
  const nfc = 'pässwörd-漢字'.normalize('NFC');
  const set = await admin.patch(`${env.baseUrl}/api/admin/galleries/${g.id}`, { data: { password: nfc } });
  expect(set.status()).toBe(200);
  for (const attempt of [nfc, nfc.normalize('NFD')]) {
    const visitor = await playwright.request.newContext();
    const res = await visitor.post(`${env.baseUrl}/api/g/${g.slug}/unlock`, { data: { password: attempt } });
    expect(res.status(), `unlock with ${attempt.length} code points`).toBe(200);
    await visitor.dispose();
  }
});

test('wrong guesses on one locked gallery do not lock the visitor out of another', async ({ playwright }) => {
  const a = await createGallery(admin, env.baseUrl, { title: `E2E lock A ${Date.now()}`, type: 'client', published: true });
  const b = await createGallery(admin, env.baseUrl, { title: `E2E lock B ${Date.now()}`, type: 'client', published: true });
  for (const g of [a, b]) {
    const set = await admin.patch(`${env.baseUrl}/api/admin/galleries/${g.id}`, { data: { password: 'right-password' } });
    expect(set.status()).toBe(200);
  }
  const visitor = await playwright.request.newContext();
  try {
    for (let i = 0; i < 11; i++) {
      await visitor.post(`${env.baseUrl}/api/g/${a.slug}/unlock`, { data: { password: `wrong-${i}` } });
    }
    const blocked = await visitor.post(`${env.baseUrl}/api/g/${a.slug}/unlock`, { data: { password: 'right-password' } });
    expect(blocked.status()).toBe(429); // gallery A is rate limited
    const other = await visitor.post(`${env.baseUrl}/api/g/${b.slug}/unlock`, { data: { password: 'right-password' } });
    expect(other.status()).toBe(200); // gallery B is not
  } finally {
    await visitor.dispose();
  }
});
