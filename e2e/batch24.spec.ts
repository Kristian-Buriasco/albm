import fs from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { adminLogin, createGallery, tempImagePath, uploadPhoto, waitForPhotoReady } from './helpers/api';
import { loadTestEnv } from './helpers/env';

// Distinct patterns, so the near-duplicate filter keeps all of them.
async function pattern(file: string, kind: number) {
  const w = 400;
  const h = 300;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = kind === 0 ? 255 - (x * 255) / w : kind === 1 ? (y * 255) / h : (Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? 190 : 60;
      raw.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
    }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toFile(file);
}

test('instagram carousel picks photos and zips 4:5 slides', async ({ playwright }) => {
  const env = loadTestEnv();
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const g = await createGallery(admin, env.baseUrl, { title: `Carousel ${Date.now()}`, type: 'portfolio' });
  const ids: string[] = [];
  for (let k = 0; k < 3; k++) {
    const f = tempImagePath(`carousel-${Date.now()}-${k}.jpg`);
    await pattern(f, k);
    const p = await uploadPhoto(admin, env.baseUrl, g.id, f);
    await waitForPhotoReady(admin, env.baseUrl, g.id, p.id);
    fs.rmSync(f, { force: true });
    ids.push(p.id);
  }

  const res = await admin.post(`${env.baseUrl}/api/admin/galleries/${g.id}/carousel`, { data: {} });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('sharp');
  expect(body.picks.length).toBe(3);

  const zip = await admin.get(`${env.baseUrl}/api/admin/galleries/${g.id}/carousel/zip?fit=pad&ids=${ids.join(',')}`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toBe('application/zip');
  const buf = await zip.body();
  expect(buf.subarray(0, 2).toString()).toBe('PK');
  expect(buf.includes(Buffer.from('01.jpg'))).toBe(true);
  expect(buf.includes(Buffer.from('03.jpg'))).toBe(true);

  const anon = await playwright.request.newContext();
  expect((await anon.post(`${env.baseUrl}/api/admin/galleries/${g.id}/carousel`, { data: {} })).status()).toBe(401);
  await admin.dispose();
  await anon.dispose();
});
