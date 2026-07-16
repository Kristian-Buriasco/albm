import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  createUploadToken,
  ensureVisitor,
  favoritePhoto,
  patchGallery,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
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

test('2A: gallery defaults apply on create', async () => {
  await adminCtx.post(`${env.baseUrl}/api/admin/settings`, {
    data: {
      galleryDefaults: {
        shared: {
          watermarkEnabled: true,
          downloadEnabled: true,
          showExif: true,
        },
      },
    },
  });

  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Defaults ${Date.now()}`,
    type: 'client',
  });
  expect(g.watermarkEnabled).toBe(true);
  expect(g.downloadEnabled).toBe(true);
  expect(g.showExif).toBe(true);

  const override = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Override ${Date.now()}`,
    type: 'client',
    watermarkEnabled: false,
  });
  expect(override.watermarkEnabled).toBe(false);
});

test('2B: external publish API adds photo; revoked token 401', async () => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: 'E2E Publish API',
    type: 'client',
    published: true,
  });
  const { token, id: tokenId } = await createUploadToken(adminCtx, env.baseUrl, 'e2e');

  const img = tempImagePath('publish.jpg');
  await makeTestJpeg(img, { r: 200, g: 50, b: 50 });

  const pub = await adminCtx.post(`${env.baseUrl}/api/publish/${g.id}/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: fs.createReadStream(img) },
  });
  expect(pub.status()).toBe(201);
  const photo = await pub.json();
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);

  await adminCtx.delete(`${env.baseUrl}/api/admin/upload-tokens`, { data: { id: tokenId } });
  const blocked = await adminCtx.post(`${env.baseUrl}/api/publish/${g.id}/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: fs.createReadStream(img) },
  });
  expect(blocked.status()).toBe(401);
  fs.rmSync(img, { force: true });
});

test('2D: admin gallery folders group galleries', async () => {
  const folderRes = await adminCtx.post(`${env.baseUrl}/api/admin/folders`, {
    data: { name: `E2E Folder ${Date.now()}` },
  });
  expect(folderRes.ok()).toBeTruthy();
  const folder = await folderRes.json();

  const g = await createGallery(adminCtx, env.baseUrl, {
    title: 'E2E In Folder',
    type: 'client',
  });
  await patchGallery(adminCtx, env.baseUrl, g.id, { folderId: folder.id });

  const refreshed = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`);
  const row = await refreshed.json();
  expect(row.folderId).toBe(folder.id);

  await adminCtx.delete(`${env.baseUrl}/api/admin/folders/${folder.id}`);
  const afterDelete = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`);
  const ungrouped = await afterDelete.json();
  expect(ungrouped.folderId).toBeNull();
});

test('2E: homepage work search filters portfolios', async ({ page }) => {
  const title = `E2E Search Target ${Date.now()}`;
  const g = await createGallery(adminCtx, env.baseUrl, {
    title,
    type: 'portfolio',
    published: true,
  });
  const img = tempImagePath('search.jpg');
  await makeTestJpeg(img, { r: 100, g: 100, b: 100 });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true, coverPhotoId: photo.id });

  await page.goto('/#work');
  await page.getByPlaceholder(/Search projects/i).fill(title);
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  fs.rmSync(img, { force: true });
});

test('2F: multiple favorite lists and CSV list_name', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: 'E2E Lists',
    type: 'client',
    published: true,
    selectionExportEnabled: true,
  });
  const img = tempImagePath('lists.jpg');
  await makeTestJpeg(img, { r: 100, g: 100, b: 100 });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true });

  const client = await playwright.request.newContext();
  await ensureVisitor(client, env.baseUrl, g.slug);

  const album = await client.put(`${env.baseUrl}/api/g/${g.slug}/selections`, {
    data: { name: 'Album' },
  });
  expect(album.status()).toBe(201);
  const albumList = await album.json();

  await client.post(`${env.baseUrl}/api/g/${g.slug}/selections`, {
    data: { photoId: photo.id, listId: albumList.id },
  });

  const csvRes = await adminCtx.get(
    `${env.baseUrl}/api/admin/galleries/${g.id}/selections.csv`,
  );
  const csv = await csvRes.text();
  expect(csv).toContain('list_name');
  expect(csv).toContain('Album');
  await client.dispose();
  fs.rmSync(img, { force: true });
});

test('2G: magic link merges selections across sessions', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: 'E2E Magic Link',
    type: 'client',
    published: true,
    clientInfoMode: 'off',
  });
  const img = tempImagePath('magic.jpg');
  await makeTestJpeg(img, { r: 100, g: 100, b: 100 });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true });

  const phone = await playwright.request.newContext();
  await ensureVisitor(phone, env.baseUrl, g.slug);
  await favoritePhoto(phone, env.baseUrl, g.slug, photo.id);

  const linkRes = await phone.post(`${env.baseUrl}/api/g/${g.slug}/magic-link`, {
    data: { email: `e2e-${Date.now()}@example.com` },
  });
  expect(linkRes.ok()).toBeTruthy();
  const { url } = await linkRes.json();

  const phoneSel = await phone.get(`${env.baseUrl}/api/g/${g.slug}/selections`);
  expect((await phoneSel.json()).photoIds).toContain(photo.id);

  const token = new URL(url).searchParams.get('token');
  expect(token).toBeTruthy();

  const desktop = await playwright.request.newContext();
  const verify = await desktop.get(
    `${env.baseUrl}/api/g/${g.slug}/magic-link/verify?token=${encodeURIComponent(token!)}`,
  );
  expect(verify.ok()).toBeTruthy();

  const sel = await desktop.get(`${env.baseUrl}/api/g/${g.slug}/selections`);
  const data = await sel.json();
  expect(data.photoIds).toContain(photo.id);
  await phone.dispose();
  await desktop.dispose();
  fs.rmSync(img, { force: true });
});
