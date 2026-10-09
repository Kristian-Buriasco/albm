import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  inviteCollaborator,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { collaboratorApiContext } from './helpers/collab';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await adminCtx.dispose();
});

async function galleryWithPhotos(title: string, n: number) {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `${title} ${Date.now()}`, type: 'client' });
  const photos: { id: string; filename: string }[] = [];
  for (let i = 0; i < n; i++) {
    const img = tempImagePath(`tag-${title}-${i}.jpg`);
    await makeTestJpeg(img, { r: 40 + i * 50, g: 90, b: 160 });
    const p = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
    await waitForPhotoReady(adminCtx, env.baseUrl, g.id, p.id);
    fs.rmSync(img, { force: true });
    photos.push({ id: p.id, filename: p.filename });
  }
  return { g, photos };
}

async function tag(photoIds: string[], tagName: string) {
  const r = await adminCtx.post(`${env.baseUrl}/api/admin/photos/tags`, { data: { photoIds, tagName } });
  expect(r.status()).toBe(200);
}

async function serverTags(galleryId: string, photoId: string): Promise<string[]> {
  const res = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${galleryId}/photos?tags=1`);
  const data = (await res.json()) as { photoTags: Record<string, { name: string }[]> };
  return (data.photoTags[photoId] ?? []).map((t) => t.name);
}

async function openAdmin(page: Page, galleryId: string) {
  await page.context().addCookies((await adminCtx.storageState()).cookies);
  await page.goto(`/admin/galleries/${galleryId}`);
}

const chipsOf = (page: Page, photoId: string) =>
  page.locator(`[data-photo-tile="${photoId}"] [data-tag-chip]`);

test('14A: a photo keeps ALL its tags, listed in the order they were added (none hidden or dropped)', async ({ page }) => {
  const { g, photos } = await galleryWithPhotos('E2E Tag Order', 1);
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
  for (const n of names) await tag([photos[0].id], n);

  expect(await serverTags(g.id, photos[0].id)).toEqual(names);

  await openAdmin(page, g.id);
  await expect(chipsOf(page, photos[0].id)).toHaveText(names);
});

test('14B: a tag can be removed from a single photo with its × button', async ({ page }) => {
  const { g, photos } = await galleryWithPhotos('E2E Tag Remove', 2);
  for (const n of ['alpha', 'bravo', 'charlie']) await tag([photos[0].id], n);
  await tag([photos[1].id], 'bravo');

  await openAdmin(page, g.id);
  const tile = page.locator(`[data-photo-tile="${photos[0].id}"]`);
  await tile.getByRole('button', { name: 'Remove tag bravo' }).click();

  await expect(chipsOf(page, photos[0].id)).toHaveText(['alpha', 'charlie']);
  expect(await serverTags(g.id, photos[0].id)).toEqual(['alpha', 'charlie']);
  // The same tag on ANOTHER photo is untouched.
  expect(await serverTags(g.id, photos[1].id)).toEqual(['bravo']);
});

test('14C: a tag can be removed from all selected photos at once', async ({ page }) => {
  const { g, photos } = await galleryWithPhotos('E2E Tag Bulk', 3);
  for (const p of photos) await tag([p.id], 'keep');
  for (const p of photos.slice(0, 2)) await tag([p.id], 'drop');
  await tag([photos[2].id], 'drop'); // all three carry "drop"

  await openAdmin(page, g.id);
  await page.locator(`[data-photo-tile="${photos[0].id}"]`).getByRole('button', { name: /^Select / }).click();
  await page.locator(`[data-photo-tile="${photos[1].id}"]`).getByRole('button', { name: /^Select / }).click();

  const bar = page.locator('[data-selected-tags]');
  await expect(bar).toContainText('drop');
  await bar.getByRole('button', { name: 'Remove tag drop from selected photos' }).click();

  await expect(chipsOf(page, photos[0].id)).toHaveText(['keep']);
  await expect(chipsOf(page, photos[1].id)).toHaveText(['keep']);
  expect(await serverTags(g.id, photos[2].id)).toEqual(['keep', 'drop']); // unselected photo keeps it
});

test('14D: removing a tag needs organize rights on that gallery', async ({ playwright }) => {
  const { g, photos } = await galleryWithPhotos('E2E Tag Authz', 1);
  const other = await galleryWithPhotos('E2E Tag Authz Other', 1);
  await tag([photos[0].id], 'secret');

  const inv = await inviteCollaborator(adminCtx, env.baseUrl, other.g.id, `tagger-${Date.now()}@example.com`);
  const ctx = await collaboratorApiContext(env.baseUrl, env.dataDir, inv.collaboratorId);
  const denied = await ctx.delete(`${env.baseUrl}/api/admin/photos/tags`, {
    data: { photoIds: [photos[0].id], tagId: 'x' },
  });
  expect([401, 404]).toContain(denied.status());
  await ctx.dispose();

  const anon = await playwright.request.newContext();
  const noAuth = await anon.delete(`${env.baseUrl}/api/admin/photos/tags`, { data: { photoIds: [photos[0].id], tagId: 'x' } });
  expect(noAuth.status()).toBe(401);
  await anon.dispose();
  expect(await serverTags(g.id, photos[0].id)).toEqual(['secret']);
});
