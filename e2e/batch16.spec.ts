import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
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

type Row = { action: string; summary: string; actorType: string; actorId: string | null };

async function auditRows(action: string): Promise<Row[]> {
  const res = await adminCtx.get(`${env.baseUrl}/api/admin/audit?action=${encodeURIComponent(action)}`);
  return ((await res.json()) as { rows: Row[] }).rows;
}

/** Every file on disk that belongs to this photo (any derivative folder). */
function filesOf(galleryId: string, filename: string): string[] {
  const stem = path.parse(filename).name;
  const root = path.join(env.dataDir, 'photos', galleryId);
  const hits: string[] = [];
  for (const dir of ['originals', 'working', 'print', 'web', 'md', 'thumb']) {
    const d = path.join(root, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (path.parse(f).name === stem) hits.push(`${dir}/${f}`);
  }
  return hits.sort();
}

/** A published gallery with downloads on, so the print derivative can be generated. */
async function setup(title: string) {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `${title} ${Date.now()}`, type: 'client' });
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true, downloadEnabled: true, downloadOfferPrint: true });
  return g;
}

async function photoWithAllDerivatives(galleryId: string, ctx = adminCtx, name = 'del.jpg') {
  const tmp = tempImagePath(`${name}-${Date.now()}.jpg`);
  // Distinct pixels per photo: identical content is rejected as a duplicate upload.
  const seed = Math.floor(Math.random() * 200);
  await makeTestJpeg(tmp, { r: 20 + seed, g: 120, b: 250 - seed });
  let photo: { id: string; filename: string };
  if (ctx === adminCtx) {
    photo = await uploadPhoto(ctx, env.baseUrl, galleryId, tmp);
  } else {
    const res = await ctx.post(`${env.baseUrl}/api/admin/galleries/${galleryId}/photos`, {
      multipart: { file: { name, mimeType: 'image/jpeg', buffer: fs.readFileSync(tmp) } },
    });
    expect(res.status()).toBe(201);
    photo = await res.json();
  }
  fs.rmSync(tmp, { force: true });
  await waitForPhotoReady(adminCtx, env.baseUrl, galleryId, photo.id);
  // Generate the on-demand print derivative too.
  const dl = await adminCtx.get(`${env.baseUrl}/dl/${photo.id}?size=print`);
  expect(dl.status()).toBe(200);
  return photo;
}

test('16A: deleting a photo removes EVERY derivative from disk and is audited (owner)', async () => {
  const g = await setup('E2E Delete Owner');
  const photo = await photoWithAllDerivatives(g.id);
  const before = filesOf(g.id, photo.filename);
  // original + web + md + thumb + print
  expect(before.map((f) => f.split('/')[0])).toEqual(['md', 'originals', 'print', 'thumb', 'web']);

  const res = await adminCtx.delete(`${env.baseUrl}/api/admin/photos/${photo.id}`);
  expect(res.status()).toBe(200);

  expect(filesOf(g.id, photo.filename)).toEqual([]);
  const row = (await auditRows('photo.delete')).find((r) => r.summary.includes(photo.filename));
  expect(row, 'a photo.delete audit entry exists').toBeTruthy();
  expect(row!.actorType).toBe('owner');
});

test('16B: a collaborator deleting a photo is audited with THEIR identity, and files are removed', async () => {
  const g = await setup('E2E Delete Collab');
  const inv = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `deleter-${Date.now()}@example.com`);
  const ctx = await collaboratorApiContext(env.baseUrl, env.dataDir, inv.collaboratorId);
  try {
    const photo = await photoWithAllDerivatives(g.id, ctx, 'collab-del.jpg');
    expect(filesOf(g.id, photo.filename).length).toBeGreaterThanOrEqual(4);
    expect((await ctx.delete(`${env.baseUrl}/api/admin/photos/${photo.id}`)).status()).toBe(200);
    expect(filesOf(g.id, photo.filename)).toEqual([]);
    const row = (await auditRows('photo.delete')).find((r) => r.summary.includes(photo.filename));
    expect(row).toBeTruthy();
    expect(row!.actorType).toBe('collaborator');
    expect(row!.actorId).toBe(inv.collaboratorId);
  } finally {
    await ctx.dispose();
  }
});

test('16C: bulk delete is audited with the count and leaves no files behind', async () => {
  const g = await setup('E2E Delete Bulk');
  const a = await photoWithAllDerivatives(g.id, adminCtx, 'bulk-a.jpg');
  const b = await photoWithAllDerivatives(g.id, adminCtx, 'bulk-b.jpg');
  const res = await adminCtx.post(`${env.baseUrl}/api/admin/galleries/${g.id}/photos/bulk`, {
    data: { action: 'delete', photoIds: [a.id, b.id] },
  });
  expect(res.status()).toBe(200);
  expect(filesOf(g.id, a.filename)).toEqual([]);
  expect(filesOf(g.id, b.filename)).toEqual([]);
  const row = (await auditRows('photos.delete')).find((r) => r.summary.includes('2 photo'));
  expect(row, 'a photos.delete audit entry exists').toBeTruthy();
});

test('16D: deleting the photo set as gallery preview clears the preview pointer', async () => {
  const g = await setup('E2E Delete Preview');
  const photo = await photoWithAllDerivatives(g.id, adminCtx, 'prev.jpg');
  await patchGallery(adminCtx, env.baseUrl, g.id, { previewPhotoId: photo.id, coverPhotoId: photo.id });
  await adminCtx.delete(`${env.baseUrl}/api/admin/photos/${photo.id}`);
  const after = (await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`)).json()) as {
    previewPhotoId: string | null;
    coverPhotoId: string | null;
  };
  expect(after.previewPhotoId).toBeNull();
  expect(after.coverPhotoId).toBeNull();
});
