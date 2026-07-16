import { expect, test, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import {
  adminLogin,
  createGallery,
  createUploadToken,
  ensureVisitor,
  patchGallery,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

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

async function makeFakeRaw(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const jpeg = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  const header = Buffer.alloc(128, 0);
  header[0] = 0x49;
  header[1] = 0x49;
  header[2] = 0x2a;
  header[3] = 0x00;
  header.writeUInt32LE(8, 4);
  fs.writeFileSync(filePath, Buffer.concat([header, jpeg]));
}

async function makeJpegWithGps(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const exifBody = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x4e, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const app1Len = exifBody.length + 2;
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff]),
    exifBody,
  ]);
  const jpegCore = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  fs.writeFileSync(filePath, Buffer.concat([jpegCore.subarray(0, 2), app1, jpegCore.subarray(2)]));
}

test('2A: auto-publish appears in client view via live poll', async ({ page }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Live ${Date.now()}`,
    type: 'client',
    published: false,
    downloadEnabled: true,
    autoPublishOnUpload: true,
  });
  const { token } = await createUploadToken(adminCtx, env.baseUrl, `live-${Date.now()}`);

  const img1 = tempImagePath('live1.jpg');
  await makeTestJpeg(img1, { r: 10, g: 20, b: 30 });
  const pub1 = await adminCtx.post(`${env.baseUrl}/api/publish/${g.id}/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: fs.createReadStream(img1) },
  });
  expect(pub1.status()).toBe(201);
  const photo1 = await pub1.json();
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo1.id);

  const refreshed = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`);
  expect((await refreshed.json()).published).toBe(true);

  await page.goto(`/g/${g.slug}`);
  await expect(page.getByText('Live — updating')).toBeVisible();

  const img2 = tempImagePath('live2.jpg');
  await makeTestJpeg(img2, { r: 200, g: 10, b: 10 });
  const pub2 = await adminCtx.post(`${env.baseUrl}/api/publish/${g.id}/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: fs.createReadStream(img2) },
  });
  expect(pub2.status()).toBe(201);
  const photo2 = await pub2.json();
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo2.id);

  const live = await page.request.get(`${env.baseUrl}/api/g/${g.slug}/live-photos?since=0`);
  expect(live.ok()).toBeTruthy();
  const liveData = await live.json();
  expect(liveData.photos.length).toBeGreaterThanOrEqual(2);

  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator(`img[src*="${photo2.id}"]`).count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  fs.rmSync(img1, { force: true });
  fs.rmSync(img2, { force: true });
});

test('2B: RAW ingest delivers JPEG unless deliverRaw on', async () => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E RAW ${Date.now()}`,
    type: 'client',
    published: true,
    downloadEnabled: true,
    downloadOfferOriginal: true,
  });

  const rawPath = tempImagePath('sample.dng');
  await makeFakeRaw(rawPath);
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, rawPath);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);

  const list = await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/photos`);
  const row = ((await list.json()) as { id: string; isRaw?: boolean }[]).find(
    (p) => p.id === photo.id,
  );
  expect(row?.isRaw).toBe(true);

  const dl = await adminCtx.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  expect(dl.ok()).toBeTruthy();
  expect(dl.headers()['content-type'] ?? '').toMatch(/jpeg|jpg/i);
  const bytes = Buffer.from(await dl.body());
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);

  await patchGallery(adminCtx, env.baseUrl, g.id, { deliverRaw: true });
  const rawDl = await adminCtx.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  expect(rawDl.ok()).toBeTruthy();
  const rawBytes = Buffer.from(await rawDl.body());
  expect(rawBytes[0]).toBe(0x49);

  const bad = tempImagePath('bad.cr2');
  const junk = Buffer.alloc(2048, 0x41);
  junk[0] = 0x49;
  junk[1] = 0x49;
  junk[2] = 0x2a;
  junk[3] = 0x00;
  fs.writeFileSync(bad, junk);
  const badRes = await adminCtx.post(`${env.baseUrl}/api/admin/galleries/${g.id}/photos`, {
    multipart: { file: fs.createReadStream(bad) },
  });
  expect(badRes.status()).toBe(415);
  const err = await badRes.json();
  expect(String(err.error ?? '')).toMatch(/decode|RAW/i);

  fs.rmSync(rawPath, { force: true });
  fs.rmSync(bad, { force: true });
});

test('2C: forensic mark differs per client and decodes', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Forensic ${Date.now()}`,
    type: 'client',
    published: true,
    downloadEnabled: true,
    forensicWatermark: true,
    downloadOfferOriginal: true,
    keepExifOnDownload: false,
    allowGpsInDownload: false,
    clientInfoMode: 'optional',
  });
  const img = tempImagePath('forensic.jpg');
  await makeTestJpeg(img, { r: 80, g: 80, b: 80 });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);

  const a = await playwright.request.newContext();
  const b = await playwright.request.newContext();
  await a.post(`${env.baseUrl}/api/g/${g.slug}/visitor`, {
    data: { name: 'Client A', email: 'a@example.com' },
  });
  await b.post(`${env.baseUrl}/api/g/${g.slug}/visitor`, {
    data: { name: 'Client B', email: 'b@example.com' },
  });

  const dlA = await a.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  const dlB = await b.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  expect(dlA.ok()).toBeTruthy();
  expect(dlB.ok()).toBeTruthy();
  const bufA = Buffer.from(await dlA.body());
  const bufB = Buffer.from(await dlB.body());
  expect(bufA.equals(bufB)).toBe(false);

  const decode = await adminCtx.post(`${env.baseUrl}/api/admin/forensic-decode`, {
    multipart: {
      file: {
        name: 'leak.jpg',
        mimeType: 'image/jpeg',
        buffer: bufA,
      },
    },
  });
  expect(decode.ok()).toBeTruthy();
  const decoded = await decode.json();
  expect(decoded.found).toBe(true);
  expect(decoded.photoId).toBe(photo.id);
  expect(decoded.visitorId).toBeTruthy();
  expect(decoded.visitorEmail).toBe('a@example.com');

  fs.rmSync(img, { force: true });
  await a.dispose();
  await b.dispose();
});

test('2D: multi-res download sizes', async ({ playwright }) => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E Multires ${Date.now()}`,
    type: 'client',
    published: true,
    downloadEnabled: true,
    downloadOfferWeb: true,
    downloadOfferPrint: true,
    downloadOfferOriginal: true,
  });
  const img = tempImagePath('multi.jpg');
  await makeTestJpeg(img, { r: 1, g: 2, b: 3 });
  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);

  const client = await playwright.request.newContext();
  await ensureVisitor(client, env.baseUrl, g.slug);

  const web = await client.get(`${env.baseUrl}/dl/${photo.id}?size=web`);
  expect(web.ok()).toBeTruthy();
  expect(web.headers()['content-type']).toMatch(/webp|jpeg/i);

  const print = await client.get(`${env.baseUrl}/dl/${photo.id}?size=print`);
  expect(print.ok()).toBeTruthy();
  expect(print.headers()['content-type']).toMatch(/jpeg/i);

  const original = await client.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  expect(original.ok()).toBeTruthy();

  await patchGallery(adminCtx, env.baseUrl, g.id, { downloadOfferWeb: false });
  const blocked = await client.get(`${env.baseUrl}/dl/${photo.id}?size=web`);
  expect(blocked.status()).toBe(403);

  fs.rmSync(img, { force: true });
  await client.dispose();
});

test('2E: GPS absent from downloaded original by default', async () => {
  const g = await createGallery(adminCtx, env.baseUrl, {
    title: `E2E GPS ${Date.now()}`,
    type: 'client',
    published: true,
    downloadEnabled: true,
    downloadOfferOriginal: true,
    keepExifOnDownload: false,
    allowGpsInDownload: false,
  });
  const img = tempImagePath('gps.jpg');
  await makeJpegWithGps(img);
  expect(fs.readFileSync(img).includes(Buffer.from('Exif'))).toBe(true);

  const photo = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, photo.id);

  const dl = await adminCtx.get(`${env.baseUrl}/dl/${photo.id}?size=original`);
  expect(dl.ok()).toBeTruthy();
  const out = Buffer.from(await dl.body());
  const meta = await sharp(out).metadata();
  if (meta.exif) {
    const parsed = exifReader(meta.exif);
    expect(parsed.GPSInfo).toBeFalsy();
  } else {
    expect(meta.exif).toBeFalsy();
  }

  fs.rmSync(img, { force: true });
});
