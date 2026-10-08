import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  inviteCollaborator,
  patchGallery,
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

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

test('11A: two photographers uploading the same filename at once never overwrite each other', async () => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Same Name ${Date.now()}`,
    type: 'client',
  });
  const a = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `same-a-${Date.now()}@example.com`);
  const b = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `same-b-${Date.now()}@example.com`);
  const ctxA = await collaboratorApiContext(env.baseUrl, env.dataDir, a.collaboratorId);
  const ctxB = await collaboratorApiContext(env.baseUrl, env.dataDir, b.collaboratorId);

  try {
    // Several rounds: each photographer sends IMG_0001.jpg with DIFFERENT content.
    const rounds = 6;
    const sent: { ctx: typeof ctxA; hash: string; buf: Buffer }[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < rounds; i++) {
      for (const [who, ctx] of [['a', ctxA], ['b', ctxB]] as const) {
        const tmp = tempImagePath(`same-${who}-${i}.jpg`);
        // Distinct colour per (photographer, round) => distinct content hash.
        await makeTestJpeg(tmp, {
          r: (i * 40 + (who === 'a' ? 10 : 130)) % 256,
          g: who === 'a' ? 40 : 200,
          b: (i * 25 + 60) % 256,
        });
        const buf = fs.readFileSync(tmp);
        sent.push({ ctx, hash: sha(buf), buf });
        jobs.push(
          ctx.post(`${env.baseUrl}/api/admin/galleries/${g.id}/photos`, {
            multipart: { file: { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: buf } },
          }),
        );
        fs.rmSync(tmp, { force: true });
      }
    }
    const results = (await Promise.all(jobs)) as { status(): number; json(): Promise<unknown> }[];
    expect(results.map((r) => r.status()).every((s) => s === 201)).toBe(true);

    const list = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/photos`);
    const photos = (await list.json()) as { id: string; filename: string }[];
    expect(photos).toHaveLength(rounds * 2);
    // All filenames are unique ...
    expect(new Set(photos.map((p) => p.filename)).size).toBe(rounds * 2);
    // ... and every original on disk still matches exactly one uploaded file.
    const diskHashes = photos.map((p) =>
      sha(fs.readFileSync(`${env.dataDir}/photos/${g.id}/originals/${p.filename}`)),
    );
    expect(new Set(diskHashes).size).toBe(rounds * 2);
    expect(new Set(diskHashes)).toEqual(new Set(sent.map((s) => s.hash)));
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
  }
});

test('11B: collaborator sees thumbnails of a DRAFT gallery they work on, not other galleries', async () => {
  const mine = await createGallery(adminCtx, env.baseUrl, { title: `E2E Draft Mine ${Date.now()}`, type: 'client' });
  const other = await createGallery(adminCtx, env.baseUrl, { title: `E2E Draft Other ${Date.now()}`, type: 'client' });
  const img = tempImagePath('collab-draft.jpg');
  await makeTestJpeg(img, { r: 30, g: 90, b: 160 });
  const myPhoto = await uploadPhoto(adminCtx, env.baseUrl, mine.id, img);
  const otherPhoto = await uploadPhoto(adminCtx, env.baseUrl, other.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, mine.id, myPhoto.id);
  await waitForPhotoReady(adminCtx, env.baseUrl, other.id, otherPhoto.id);
  fs.rmSync(img, { force: true });

  const c = await inviteCollaborator(adminCtx, env.baseUrl, mine.id, `draft-${Date.now()}@example.com`);
  const ctx = await collaboratorApiContext(env.baseUrl, env.dataDir, c.collaboratorId);
  try {
    // Both galleries are unpublished drafts.
    expect((await ctx.get(`${env.baseUrl}/img/${myPhoto.id}/thumb`)).status()).toBe(200);
    expect((await ctx.get(`${env.baseUrl}/img/${myPhoto.id}/md`)).status()).toBe(200);
    expect((await ctx.get(`${env.baseUrl}/img/${otherPhoto.id}/thumb`)).status()).toBe(404);
    // Anonymous visitors still can't see a draft.
    const anon = await (await import('@playwright/test')).request.newContext();
    expect((await anon.get(`${env.baseUrl}/img/${myPhoto.id}/thumb`)).status()).toBe(404);
    await anon.dispose();
  } finally {
    await ctx.dispose();
  }
});

test('11C: invites stay valid for a week', async () => {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `E2E Invite TTL ${Date.now()}`, type: 'client' });
  const inv = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `ttl-${Date.now()}@example.com`);
  const days = (inv.expiresAt - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.1);
});

test('11D: many guests behind one IP are not throttled like abuse', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `E2E Event ${Date.now()}`, type: 'client' });
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true });
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const statuses: number[] = [];
  // 60 distinct guests (fresh cookie jars) from one venue IP in a burst.
  for (let i = 0; i < 60; i++) {
    const guest = await playwright.request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } });
    const res = await guest.post(`${env.baseUrl}/api/g/${g.slug}/visitor`, { data: {} });
    statuses.push(res.status());
    await guest.dispose();
  }
  expect(statuses.filter((s) => s === 429)).toHaveLength(0);
});

test('11E: wrong PIN typos from a crowd do not lock the gallery out', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `E2E Pin Crowd ${Date.now()}`, type: 'client' });
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true, pinEnabled: true, pin: '482910' });
  const base = Math.floor(Math.random() * 100) + 1;
  // 30 typos from 30 different guests (30 failures; old global cap was 20).
  for (let i = 0; i < 30; i++) {
    const guest = await playwright.request.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': `192.0.2.${(base + i) % 250 + 1}` },
    });
    const res = await guest.post(`${env.baseUrl}/api/g/${g.slug}/unlock`, { data: { pin: '000000' } });
    expect(res.status()).toBe(401);
    await guest.dispose();
  }
  // A guest who types it right still gets in.
  const good = await playwright.request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.250' },
  });
  const ok = await good.post(`${env.baseUrl}/api/g/${g.slug}/unlock`, { data: { pin: '482910' } });
  expect(ok.status()).toBe(200);
  await good.dispose();
});

test('11F: client-ip diagnostic is owner-only and reports the derived IP', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${env.baseUrl}/api/admin/client-ip`)).status()).toBe(401);
  await anon.dispose();

  const res = await adminCtx.get(`${env.baseUrl}/api/admin/client-ip`, {
    headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.9' },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { detectedIp: string; looksPrivateOrUnknown: boolean };
  // Default (no TRUSTED_PROXY_HOPS): the last hop is used.
  expect(body.detectedIp).toBe('198.51.100.9');
  expect(body.looksPrivateOrUnknown).toBe(false);
});
