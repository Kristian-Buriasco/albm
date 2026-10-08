import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  patchGallery,
  tempImagePath,
  unlockGallery,
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

async function publishedClientGallery(title: string, color: { r: number; g: number; b: number }) {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `${title} ${Date.now()}`,
    type: 'client',
  });
  const img = tempImagePath(`${title.replace(/\W+/g, '-')}.jpg`);
  await makeTestJpeg(img, color);
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);
  fs.rmSync(img, { force: true });
  return { gallery: g, photo };
}

test('10A: changing the gallery password revokes existing unlocks', async ({ playwright }) => {
  const { gallery, photo } = await publishedClientGallery('E2E Rotate', { r: 10, g: 120, b: 200 });
  await patchGallery(adminCtx, env.baseUrl, gallery.id, {
    published: true,
    password: 'first-secret',
  });

  const anon = await playwright.request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
  });
  try {
    const locked = await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`);
    expect(locked.status()).toBe(403);

    await unlockGallery(anon, env.baseUrl, gallery.slug, { password: 'first-secret' });
    const open = await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`);
    expect(open.status()).toBe(200);

    // Owner rotates the password: the old unlock cookie must stop working.
    await patchGallery(adminCtx, env.baseUrl, gallery.id, { password: 'second-secret' });
    const revoked = await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`);
    expect(revoked.status()).toBe(403);

    // The old password no longer unlocks; the new one does.
    const stale = await anon.post(`${env.baseUrl}/api/g/${gallery.slug}/unlock`, {
      data: { password: 'first-secret' },
    });
    expect(stale.status()).toBe(401);
    await unlockGallery(anon, env.baseUrl, gallery.slug, { password: 'second-secret' });
    const reopened = await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`);
    expect(reopened.status()).toBe(200);

    // Removing the password entirely opens the gallery (no gate left to satisfy).
    await patchGallery(adminCtx, env.baseUrl, gallery.id, { password: '' });
    const fresh = await playwright.request.newContext();
    try {
      const ungated = await fresh.get(`${env.baseUrl}/img/${photo.id}/thumb`);
      expect(ungated.status()).toBe(200);
    } finally {
      await fresh.dispose();
    }
  } finally {
    await anon.dispose();
  }
});

test('10B: unlocking one gallery does not unlock another', async ({ playwright }) => {
  const a = await publishedClientGallery('E2E Iso A', { r: 200, g: 40, b: 40 });
  const b = await publishedClientGallery('E2E Iso B', { r: 40, g: 200, b: 40 });
  await patchGallery(adminCtx, env.baseUrl, a.gallery.id, { published: true, password: 'same-pass' });
  await patchGallery(adminCtx, env.baseUrl, b.gallery.id, { published: true, password: 'same-pass' });

  const anon = await playwright.request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
  });
  try {
    await unlockGallery(anon, env.baseUrl, a.gallery.slug, { password: 'same-pass' });
    expect((await anon.get(`${env.baseUrl}/img/${a.photo.id}/thumb`)).status()).toBe(200);
    expect((await anon.get(`${env.baseUrl}/img/${b.photo.id}/thumb`)).status()).toBe(403);

    // Unlocking B keeps A unlocked too (multiple entries coexist in the cookie).
    await unlockGallery(anon, env.baseUrl, b.gallery.slug, { password: 'same-pass' });
    expect((await anon.get(`${env.baseUrl}/img/${a.photo.id}/thumb`)).status()).toBe(200);
    expect((await anon.get(`${env.baseUrl}/img/${b.photo.id}/thumb`)).status()).toBe(200);
  } finally {
    await anon.dispose();
  }
});

test('10C: expired gallery images 404 for visitors but not the owner', async ({ playwright }) => {
  const { gallery, photo } = await publishedClientGallery('E2E Expired', { r: 120, g: 120, b: 30 });
  await patchGallery(adminCtx, env.baseUrl, gallery.id, { published: true });

  const anon = await playwright.request.newContext();
  try {
    expect((await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`)).status()).toBe(200);

    await patchGallery(adminCtx, env.baseUrl, gallery.id, {
      autoExpire: true,
      expiresAt: Date.now() - 60_000,
    });
    expect((await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`)).status()).toBe(404);
    expect((await anon.get(`${env.baseUrl}/img/${photo.id}/web`)).status()).toBe(404);
    // Owner can still see it (preview / extend flow).
    expect((await adminCtx.get(`${env.baseUrl}/img/${photo.id}/thumb`)).status()).toBe(200);

    // Extending the expiry restores access.
    await patchGallery(adminCtx, env.baseUrl, gallery.id, { expiresAt: Date.now() + 3_600_000 });
    expect((await anon.get(`${env.baseUrl}/img/${photo.id}/thumb`)).status()).toBe(200);
  } finally {
    await anon.dispose();
  }
});
