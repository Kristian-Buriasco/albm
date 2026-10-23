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
  expect(body.source).toBe('local');
  expect(body.picks.length).toBe(3);

  const pick = async (data: object) => (await admin.post(`${env.baseUrl}/api/admin/galleries/${g.id}/carousel`, { data })).json();
  expect((await pick({ count: 2 })).picks.length).toBe(2);
  for (const mode of ['spread', 'top', 'sections']) expect((await pick({ mode, count: 3 })).picks.length).toBe(3);

  // Local AI scoring: a worker leases `score` jobs (medium image), posts scores, and the picker follows them.
  const tok = await admin.post(`${env.baseUrl}/api/admin/worker-tokens`, { data: { name: `carousel ${Date.now()}` } });
  const worker = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${(await tok.json()).token}` } });
  const jobs = await (await worker.get(`${env.baseUrl}/api/worker/jobs?task=score&gallery=${g.id}&limit=10`)).json();
  expect(jobs.jobs.length).toBe(3);
  expect(jobs.jobs[0].imageUrl).toContain('variant=md');
  const scores: Record<string, number> = { [ids[0]]: 1, [ids[1]]: 10, [ids[2]]: 9 };
  const posted = await worker.post(`${env.baseUrl}/api/worker/results`, {
    data: { task: 'score', engine: 'e2e', version: 1, results: ids.map((photoId) => ({ photoId, score: scores[photoId] })) },
  });
  expect((await posted.json()).applied).toBe(3);
  const prog = await (await admin.get(`${env.baseUrl}/api/admin/galleries/${g.id}/carousel`)).json();
  expect(prog.score.done).toBe(3);
  const scored = await pick({ mode: 'top', count: 2 });
  expect(scored.scored).toBe(3);
  expect(scored.picks.map((x: { id: string }) => x.id).sort()).toEqual([ids[1], ids[2]].sort());
  await worker.dispose();

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
