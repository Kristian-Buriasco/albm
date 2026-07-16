import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  ensureVisitor,
  favoritePhoto,
  patchGallery,
  tempImagePath,
  unlockGallery,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;

let portfolioTitle: string;
let portfolioSlug: string;
let clientSlug: string;
let clientGalleryId: string;
let clientPhotoId: string;
let clientFilename: string;
let passwordSlug: string;
let passwordPhotoId: string;
let pinSlug: string;
let pinPhotoId: string;
let downloadSlug: string;
let downloadPhotoId: string;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);

  const img = tempImagePath('seed.jpg');
  await makeTestJpeg(img, { r: 40, g: 90, b: 160 });

  portfolioTitle = `E2E Portfolio ${Date.now()}`;
  const portfolio = await createGallery(admin, env.baseUrl, {
    title: portfolioTitle,
    type: 'portfolio',
    published: true,
    featured: true,
  });
  portfolioSlug = portfolio.slug;
  const portfolioPhoto = await uploadPhoto(admin, env.baseUrl, portfolio.id, img);
  await waitForPhotoReady(admin, env.baseUrl, portfolio.id, portfolioPhoto.id);
  await patchGallery(admin, env.baseUrl, portfolio.id, {
    coverPhotoId: portfolioPhoto.id,
    published: true,
    featured: true,
  });

  const client = await createGallery(admin, env.baseUrl, {
    title: 'E2E Client Selections',
    type: 'client',
    published: true,
    clientInfoMode: 'off',
    selectionExportEnabled: true,
  });
  clientSlug = client.slug;
  clientGalleryId = client.id;
  const clientPhoto = await uploadPhoto(admin, env.baseUrl, client.id, img);
  clientPhotoId = clientPhoto.id;
  clientFilename = clientPhoto.filename;
  await waitForPhotoReady(admin, env.baseUrl, client.id, clientPhoto.id);
  await patchGallery(admin, env.baseUrl, client.id, { published: true });

  const passwordGallery = await createGallery(admin, env.baseUrl, {
    title: 'E2E Password Gate',
    type: 'client',
    published: true,
    password: 'gate-secret',
    downloadEnabled: true,
    favoritesDownloadEnabled: true,
  });
  passwordSlug = passwordGallery.slug;
  const pwPhoto = await uploadPhoto(admin, env.baseUrl, passwordGallery.id, img);
  passwordPhotoId = pwPhoto.id;
  await waitForPhotoReady(admin, env.baseUrl, passwordGallery.id, pwPhoto.id);
  await patchGallery(admin, env.baseUrl, passwordGallery.id, { published: true });

  const pinGallery = await createGallery(admin, env.baseUrl, {
    title: 'E2E PIN Gate',
    type: 'client',
    published: true,
  });
  pinSlug = pinGallery.slug;
  await patchGallery(admin, env.baseUrl, pinGallery.id, {
    pinEnabled: true,
    pin: '123456',
    published: true,
  });
  const pinPhoto = await uploadPhoto(admin, env.baseUrl, pinGallery.id, img);
  pinPhotoId = pinPhoto.id;
  await waitForPhotoReady(admin, env.baseUrl, pinGallery.id, pinPhoto.id);
  await patchGallery(admin, env.baseUrl, pinGallery.id, { published: true });

  const downloadGallery = await createGallery(admin, env.baseUrl, {
    title: 'E2E Downloads',
    type: 'client',
    published: true,
    password: 'zip-secret',
    downloadEnabled: true,
    favoritesDownloadEnabled: true,
  });
  downloadSlug = downloadGallery.slug;
  const dlPhoto = await uploadPhoto(admin, env.baseUrl, downloadGallery.id, img);
  downloadPhotoId = dlPhoto.id;
  await waitForPhotoReady(admin, env.baseUrl, downloadGallery.id, dlPhoto.id);
  await patchGallery(admin, env.baseUrl, downloadGallery.id, { published: true });

  await admin.dispose();
});

test('admin login and gallery creation (seed)', async () => {
  expect(portfolioSlug).toBeTruthy();
  expect(clientSlug).toBeTruthy();
  expect(passwordSlug).toBeTruthy();
  expect(pinSlug).toBeTruthy();
});

test('homepage lists published portfolio gallery', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(portfolioTitle)).toBeVisible();
});

test('password-gated gallery blocks without access and allows with password', async ({
  playwright,
}) => {
  const anon = await playwright.request.newContext();
  const blocked = await anon.get(`${env.baseUrl}/img/${passwordPhotoId}/thumb`);
  expect(blocked.status()).toBe(403);

  const bad = await anon.post(`${env.baseUrl}/api/g/${passwordSlug}/unlock`, {
    data: { password: 'wrong' },
  });
  expect(bad.status()).toBe(401);

  await unlockGallery(anon, env.baseUrl, passwordSlug, { password: 'gate-secret' });
  const allowed = await anon.get(`${env.baseUrl}/img/${passwordPhotoId}/thumb`);
  expect(allowed.status()).toBe(200);
  await anon.dispose();
});

test('PIN-gated gallery blocks without access and allows with PIN', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  const blocked = await anon.get(`${env.baseUrl}/img/${pinPhotoId}/thumb`);
  expect(blocked.status()).toBe(403);

  const bad = await anon.post(`${env.baseUrl}/api/g/${pinSlug}/unlock`, {
    data: { pin: '0000' },
  });
  expect(bad.status()).toBe(401);

  await unlockGallery(anon, env.baseUrl, pinSlug, { pin: '123456' });
  const allowed = await anon.get(`${env.baseUrl}/img/${pinPhotoId}/thumb`);
  expect(allowed.status()).toBe(200);
  await anon.dispose();
});

test('client favorites appear in admin CSV export', async ({ playwright }) => {
  const client = await playwright.request.newContext();
  await ensureVisitor(client, env.baseUrl, clientSlug);
  await favoritePhoto(client, env.baseUrl, clientSlug, clientPhotoId);
  await client.dispose();

  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const csvRes = await admin.get(
    `${env.baseUrl}/api/admin/galleries/${clientGalleryId}/selections.csv`,
  );
  expect(csvRes.ok()).toBeTruthy();
  const csv = await csvRes.text();
  expect(csv).toContain('filename,visitor_name,visitor_email,list_name,selected_at');
  expect(csv).toContain(clientFilename);
  await admin.dispose();
});

test('ZIP and /dl endpoints require gallery access', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  const zipBlocked = await anon.get(`${env.baseUrl}/dl/gallery/${downloadSlug}.zip`);
  expect(zipBlocked.status()).toBe(403);
  const imgBlocked = await anon.get(`${env.baseUrl}/img/${downloadPhotoId}/thumb`);
  expect(imgBlocked.status()).toBe(403);
  const dlBlocked = await anon.get(`${env.baseUrl}/dl/${downloadPhotoId}`);
  expect(dlBlocked.status()).toBe(403);

  await unlockGallery(anon, env.baseUrl, downloadSlug, { password: 'zip-secret' });
  await ensureVisitor(anon, env.baseUrl, downloadSlug);
  await favoritePhoto(anon, env.baseUrl, downloadSlug, downloadPhotoId);

  const zipOk = await anon.get(`${env.baseUrl}/dl/gallery/${downloadSlug}.zip`);
  expect(zipOk.status()).toBe(200);
  const favZip = await anon.get(`${env.baseUrl}/dl/favorites/${downloadSlug}.zip`);
  expect(favZip.status()).toBe(200);
  const imgOk = await anon.get(`${env.baseUrl}/img/${downloadPhotoId}/thumb`);
  expect(imgOk.status()).toBe(200);
  await anon.dispose();
});

test('/api/health returns ok', async ({ request }) => {
  const res = await request.get(`${env.baseUrl}/api/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toEqual({ ok: true });
});

test('sitemap includes portfolio but excludes client galleries', async ({ request }) => {
  const res = await request.get(`${env.baseUrl}/sitemap.xml`);
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  expect(xml).toContain(`/portfolio/${portfolioSlug}`);
  expect(xml).not.toContain(`/g/${clientSlug}`);
  expect(xml).not.toContain(`/g/${passwordSlug}`);
  expect(xml).not.toContain(`/g/${pinSlug}`);
});

test('audit log records gallery creation', async ({ playwright }) => {
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const res = await admin.get(`${env.baseUrl}/api/admin/audit`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.rows.some((r: { action: string }) => r.action === 'gallery.create')).toBeTruthy();
  await admin.dispose();
});

test.afterAll(() => {
  fs.rmSync(tempImagePath('seed.jpg'), { force: true });
});
