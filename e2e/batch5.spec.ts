import { expect, test, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  adminLogin,
  createGallery,
  ensureVisitor,
  patchGallery,
  tempImagePath,
  unlockGallery,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: Awaited<ReturnType<typeof playwrightRequest.newContext>>;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await adminCtx.dispose();
});

async function makeBibJpeg(filePath: string, number: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="400" fill="#111111"/>
    <text x="400" y="260" font-size="200" font-family="Arial, Helvetica, sans-serif"
      font-weight="700" fill="#ffffff" text-anchor="middle">${number}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(filePath);
}

async function waitForFaceBatch(
  galleryId: string,
  timeoutMs = 180_000,
): Promise<{ status: string; faceCount: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${galleryId}/face-batch`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    if (data.status === 'done' || data.status === 'error') return data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Face batch did not finish');
}

test('3A: bib OCR at upload + public search respects gating', async ({ page }) => {
  test.setTimeout(240_000);
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Bib ${Date.now()}`,
    type: 'client',
    published: true,
    bibSearch: true,
    password: 'secret99',
  });

  const img = tempImagePath('bib247.jpg');
  await makeBibJpeg(img, '247');
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id, 180_000);

  // Locked gallery: bib search must not bypass password (anonymous client)
  const anon = await playwrightRequest.newContext();
  try {
    const locked = await anon.get(`${env.baseUrl}/api/g/${g.slug}/bib-search?number=247`);
    expect(locked.status()).toBe(404);

    await unlockGallery(anon, env.baseUrl, g.slug, { password: 'secret99' });
    const search = await anon.get(`${env.baseUrl}/api/g/${g.slug}/bib-search?number=247`);
    expect(search.ok()).toBeTruthy();
    const body = await search.json();
    expect(body.number).toBe('247');
    expect(body.photoIds).toContain(photo.id);
    expect(body.label).toMatch(/photos matching #247/i);
  } finally {
    await anon.dispose();
  }

  await unlockGallery(page.request, env.baseUrl, g.slug, { password: 'secret99' });
  await page.goto(`/g/${g.slug}/find`);
  await expect(page.getByRole('heading', { name: g.title })).toBeVisible();
  await page.getByPlaceholder(/247|e\.g\./i).fill('247');
  await page.getByRole('button', { name: /search/i }).click();
  await expect(page.getByText(/photos matching #247/i)).toBeVisible({ timeout: 15_000 });
});

test('3B: face batch populates vectors + selfie match + selfie not stored', async () => {
  test.setTimeout(240_000);
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Face ${Date.now()}`,
    type: 'client',
    published: true,
    faceSearch: true,
  });

  const facePath = path.join(process.cwd(), 'e2e', 'fixtures', 'face.jpg');
  expect(fs.existsSync(facePath)).toBeTruthy();
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, facePath);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id, 120_000);

  const start = await adminCtx.post(`${env.baseUrl}/api/admin/galleries/${g.id}/face-batch`);
  expect(start.ok()).toBeTruthy();

  const progress = await waitForFaceBatch(g.id);
  expect(progress.status).toBe('done');
  expect(progress.faceCount).toBeGreaterThan(0);

  // Selfie search with same image — in-memory only
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(facePath)], { type: 'image/jpeg' });
  form.append('selfie', blob, 'selfie.jpg');
  const matchRes = await fetch(`${env.baseUrl}/api/g/${g.slug}/face-search`, {
    method: 'POST',
    body: form,
  });
  expect(matchRes.ok).toBeTruthy();
  const match = await matchRes.json();
  expect(match.selfieStored).toBe(false);
  expect(match.facesDetected).toBeGreaterThan(0);
  expect(match.photoIds).toContain(photo.id);

  // Selfie must not appear as a new photo / file under gallery storage
  const photosRes = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/photos`);
  const photos = await photosRes.json();
  expect(photos).toHaveLength(1);

  const purge = await adminCtx.delete(`${env.baseUrl}/api/admin/galleries/${g.id}/face-batch`);
  expect(purge.ok()).toBeTruthy();
  const after = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/face-batch`);
  expect((await after.json()).faceCount).toBe(0);
});

test('3C: event page renders + gated when off; save matches to favorites', async ({ page }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Event ${Date.now()}`,
    type: 'client',
    published: true,
    eventPage: false,
    bibSearch: true,
  });

  const off = await page.goto(`/g/${g.slug}/event`);
  expect(off?.status()).toBe(404);

  await patchGallery(adminCtx, env.baseUrl, g.id, { eventPage: true });

  const img = tempImagePath('event-bib.jpg');
  await makeBibJpeg(img, '91');
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id, 120_000);

  await page.goto(`/g/${g.slug}/event`);
  await expect(page.getByRole('heading', { name: g.title })).toBeVisible();
  await expect(page.getByText(/get your photos/i)).toBeVisible();

  await page.getByPlaceholder(/91|e\.g\./i).fill('91');
  await page.getByRole('button', { name: /search/i }).click();
  await expect(page.getByText(/photos matching #91/i)).toBeVisible({ timeout: 15_000 });

  await ensureVisitor(page.request, env.baseUrl, g.slug);
  await page.getByRole('button', { name: /save to my favorites/i }).click();
  await expect(page.getByText(/saved to your favorites/i)).toBeVisible({ timeout: 10_000 });

  const sel = await page.request.get(`${env.baseUrl}/api/g/${g.slug}/selections`);
  expect(sel.ok()).toBeTruthy();
  const selBody = await sel.json();
  expect(selBody.photoIds).toContain(photo.id);
});
