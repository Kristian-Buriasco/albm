import { expect, test, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adminLogin, createGallery, patchGallery, uploadPhoto, waitForPhotoReady } from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

test('md variant serves + lazy-regenerates', async ({ playwright }) => {
  test.setTimeout(60_000);
  const env = loadTestEnv();
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);

  const g = await createGallery(admin, env.baseUrl, { title: 'Img Variants', type: 'portfolio' });
  const f = path.join(os.tmpdir(), 'imgtest.jpg');
  await makeTestJpeg(f, { r: 100, g: 120, b: 140 });
  const ph = await uploadPhoto(admin, env.baseUrl, g.id, f);
  await waitForPhotoReady(admin, env.baseUrl, g.id, ph.id);
  await patchGallery(admin, env.baseUrl, g.id, { published: true });
  await admin.dispose();

  const anon = await playwright.request.newContext();

  // md serves as webp.
  const r1 = await anon.get(`${env.baseUrl}/img/${ph.id}/md`);
  expect(r1.status()).toBe(200);
  expect(r1.headers()['content-type']).toBe('image/webp');

  // Delete the md file on disk, then re-request → lazy regeneration.
  const mdFile = path.join(env.dataDir, 'photos', g.id, 'md', `${ph.id.slice(0, 0)}`);
  // Find the actual md file (filename is the stored filename, not the id).
  const mdDir = path.join(env.dataDir, 'photos', g.id, 'md');
  const files = fs.existsSync(mdDir) ? fs.readdirSync(mdDir) : [];
  expect(files.length).toBeGreaterThan(0);
  fs.rmSync(path.join(mdDir, files[0]));
  expect(fs.existsSync(path.join(mdDir, files[0]))).toBe(false);

  const r2 = await anon.get(`${env.baseUrl}/img/${ph.id}/md`);
  expect(r2.status()).toBe(200);
  expect(r2.headers()['content-type']).toBe('image/webp');
  expect(fs.existsSync(path.join(mdDir, files[0]))).toBe(true); // regenerated

  // Versioned request → immutable cache header.
  const r3 = await anon.get(`${env.baseUrl}/img/${ph.id}/md?v=123`);
  expect(r3.headers()['cache-control']).toContain('immutable');

  await anon.dispose();
  void mdFile;
});

test('unknown gallery renders the branded 404', async ({ page }) => {
  const env = loadTestEnv();
  const res = await page.goto(`${env.baseUrl}/g/does-not-exist-xyz`);
  // Proper 404 status (no route-level loading.tsx Suspense boundary on the
  // public gallery routes, so notFound() resolves before the response flushes).
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This page doesn't exist")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});
