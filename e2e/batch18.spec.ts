import { expect, test, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  adminLogin,
  createGallery,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: APIRequestContext;
let workerCtx: APIRequestContext;
let token: string;
let tokenId: string;
let galleryId: string;
let slug: string;
let photoId: string;

type AdminPhoto = { id: string; altText: string | null; altSource: string | null };

async function adminPhoto(): Promise<AdminPhoto> {
  const res = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${galleryId}/photos`);
  const photos = (await res.json()) as AdminPhoto[];
  return photos.find((p) => p.id === photoId)!;
}

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);

  const created = await adminCtx.post(`${env.baseUrl}/api/admin/worker-tokens`, {
    data: { name: `e2e worker ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { token: string; row: { id: string } };
  token = body.token;
  tokenId = body.row.id;
  workerCtx = await playwright.request.newContext({
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  });

  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Worker ${Date.now()}`,
    type: 'client',
    published: true,
    bibSearch: true,
  });
  galleryId = g.id;
  slug = g.slug;

  // Distinct pixels per run: identical uploads are rejected as duplicates.
  const img = tempImagePath(`worker-${Date.now()}.jpg`);
  const seed = Math.floor(Math.random() * 200);
  await makeTestJpeg(img, { r: 30 + seed, g: 140, b: 230 - seed });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, galleryId, img);
  photoId = photo.id;
  await waitForPhotoReady(adminCtx, env.baseUrl, galleryId, photoId, 180_000);
});

test.afterAll(async () => {
  await workerCtx?.dispose();
  await adminCtx?.dispose();
});

test('worker routes reject a missing or wrong token', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  const wrong = await playwright.request.newContext({
    extraHTTPHeaders: { authorization: 'Bearer not-a-real-token' },
  });
  try {
    expect((await anon.get(`${env.baseUrl}/api/worker/jobs?task=bibs`)).status()).toBe(401);
    expect((await wrong.get(`${env.baseUrl}/api/worker/jobs?task=bibs`)).status()).toBe(401);
    expect((await wrong.get(`${env.baseUrl}/api/worker/status`)).status()).toBe(401);
    expect((await anon.get(`${env.baseUrl}/api/worker/image/${photoId}`)).status()).toBe(401);
    const post = await wrong.post(`${env.baseUrl}/api/worker/results`, {
      data: { task: 'bibs', engine: 'x', version: 1, results: [{ photoId, bibs: [] }] },
    });
    expect(post.status()).toBe(401);
  } finally {
    await anon.dispose();
    await wrong.dispose();
  }
});

test('bib job is leased once, served as webp, and stored normalised', async () => {
  const first = await workerCtx.get(
    `${env.baseUrl}/api/worker/jobs?task=bibs&gallery=${galleryId}&limit=10`,
  );
  expect(first.status()).toBe(200);
  const leased = (await first.json()) as { jobs: { photoId: string; imageUrl: string }[] };
  expect(leased.jobs.map((j) => j.photoId)).toEqual([photoId]);
  expect(leased.jobs[0].imageUrl).toBe(`/api/worker/image/${photoId}?variant=web`);

  const second = (await (
    await workerCtx.get(`${env.baseUrl}/api/worker/jobs?task=bibs&gallery=${galleryId}`)
  ).json()) as { jobs: unknown[]; remaining: number };
  expect(second.jobs).toEqual([]);
  expect(second.remaining).toBe(0);

  const image = await workerCtx.get(`${env.baseUrl}${leased.jobs[0].imageUrl}`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/webp');

  const post = await workerCtx.post(`${env.baseUrl}/api/worker/results`, {
    data: {
      task: 'bibs',
      engine: 'e2e-engine',
      version: 1,
      results: [
        {
          photoId,
          bibs: [
            { number: '007', confidence: 0.9 },
            { number: '20', confidence: 0.8 },
            { number: '20', confidence: 0.4 },
            { number: 'x1' },
          ],
        },
      ],
    },
  });
  expect(post.status()).toBe(200);
  expect(await post.json()).toEqual({ ok: true, applied: 1, skipped: [] });

  // Public bib search reads photo_bibs: 007 is stored as 7, the junk "x1" is dropped.
  const anon = await playwrightRequest.newContext();
  try {
    const find = async (n: string) =>
      (await (await anon.get(`${env.baseUrl}/api/g/${slug}/bib-search?number=${n}`)).json()) as {
        photoIds: string[];
      };
    expect((await find('7')).photoIds).toContain(photoId);
    expect((await find('20')).photoIds).toContain(photoId);
    expect((await find('1')).photoIds).not.toContain(photoId);
  } finally {
    await anon.dispose();
  }

  const status = (await (
    await workerCtx.get(`${env.baseUrl}/api/worker/status?gallery=${galleryId}`)
  ).json()) as { tasks: { bibs: { done: number; pending: number } } };
  expect(status.tasks.bibs.done).toBe(1);
  expect(status.tasks.bibs.pending).toBe(0);

  const after = (await (
    await workerCtx.get(`${env.baseUrl}/api/worker/jobs?task=bibs&gallery=${galleryId}`)
  ).json()) as { jobs: unknown[] };
  expect(after.jobs).toEqual([]);
});

test('alt results are stored as ai text and never overwrite human edits', async () => {
  const post = await workerCtx.post(`${env.baseUrl}/api/worker/results`, {
    data: {
      task: 'alt',
      engine: 'e2e-engine',
      version: 1,
      results: [{ photoId, alt: '  A   dog\u0007runs \n on   grass  ' }],
    },
  });
  expect(post.status()).toBe(200);
  expect((await post.json()).applied).toBe(1);
  let photo = await adminPhoto();
  expect(photo.altText).toBe('A dog runs on grass');
  expect(photo.altSource).toBe('ai');

  const patch = await adminCtx.patch(`${env.baseUrl}/api/admin/photos/${photoId}`, {
    data: { altText: 'Written by a person' },
  });
  expect(patch.status()).toBe(200);

  const again = await workerCtx.post(`${env.baseUrl}/api/worker/results`, {
    data: { task: 'alt', engine: 'e2e-engine', version: 2, results: [{ photoId, alt: 'Machine text' }] },
  });
  expect(await again.json()).toEqual({
    ok: true,
    applied: 0,
    skipped: [{ photoId, reason: 'human-edited' }],
  });
  photo = await adminPhoto();
  expect(photo.altText).toBe('Written by a person');
  expect(photo.altSource).toBe('human');
});

test('bad worker bodies get 400, never 500', async () => {
  const bad = [
    { task: 'nope', engine: 'x', version: 1, results: [{ photoId }] },
    { task: 'bibs', engine: 'x', version: 0, results: [{ photoId, bibs: [] }] },
    { task: 'bibs', engine: 'x', version: 1, results: [] },
    { task: 'bibs', engine: 'x', version: 1, results: [{ photoId }] },
    { task: 'alt', engine: 'x', version: 1, results: [{ photoId, alt: 5 }] },
  ];
  for (const data of bad) {
    const res = await workerCtx.post(`${env.baseUrl}/api/worker/results`, { data });
    expect(res.status(), JSON.stringify(data)).toBe(400);
  }
  const notJson = await workerCtx.post(`${env.baseUrl}/api/worker/results`, {
    headers: { 'content-type': 'application/json' },
    data: '{not json',
  });
  expect(notJson.status()).toBe(400);
  const limit = await workerCtx.get(`${env.baseUrl}/api/worker/jobs?task=bibs&limit=0`);
  expect(limit.status()).toBe(400);
});

test('a revoked worker token is refused', async () => {
  const del = await adminCtx.delete(`${env.baseUrl}/api/admin/worker-tokens?id=${tokenId}`);
  expect(del.status()).toBe(200);
  expect((await workerCtx.get(`${env.baseUrl}/api/worker/jobs?task=bibs`)).status()).toBe(401);
});
