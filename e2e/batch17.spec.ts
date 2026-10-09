import { expect, test, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import { adminLogin, createGallery, inviteCollaborator, patchGallery } from './helpers/api';
import { collaboratorApiContext } from './helpers/collab';
import { loadTestEnv } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await adminCtx.dispose();
});

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 64, b: 112, alpha: 1 } } }).png().toBuffer();

async function setIcon(
  ctx: APIRequestContext,
  galleryId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  return ctx.post(`${env.baseUrl}/api/admin/galleries/${galleryId}/icon`, { multipart: { file } });
}

async function gallery(title: string, type: 'client' | 'portfolio' = 'client', publish = true) {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `${title} ${Date.now()}`, type });
  if (publish) await patchGallery(adminCtx, env.baseUrl, g.id, { published: true });
  return g;
}

const iconLinks = (html: string) =>
  [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*>/g)].map((m) => m[0]);

test('17A: an uploaded icon is served at exactly the supported sizes; other sizes 404', async ({ playwright }) => {
  const g = await gallery('E2E Icon Sizes');
  const res = await setIcon(adminCtx, g.id, { name: 'logo.png', mimeType: 'image/png', buffer: await png(300, 300) });
  expect(res.status()).toBe(200);
  const { version } = (await res.json()) as { version: number };
  expect(version).toBeGreaterThan(0);

  const anon = await playwright.request.newContext();
  for (const size of [32, 180, 192, 512]) {
    const r = await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/${size}?v=${version}`);
    expect(r.status(), `size ${size}`).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
    expect(r.headers()['x-content-type-options']).toBe('nosniff');
    expect(r.headers()['cache-control']).toContain('immutable'); // versioned URL
    const m = await sharp(await r.body()).metadata();
    expect([m.width, m.height, m.format]).toEqual([size, size, 'png']);
  }
  expect((await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/64`)).status()).toBe(404);
  expect((await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/abc`)).status()).toBe(404);
  expect((await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/32`)).headers()['cache-control']).not.toContain('immutable');
  await anon.dispose();
});

test('17B: a gallery without an icon, and an unknown gallery, both 404', async ({ playwright }) => {
  const g = await gallery('E2E Icon None');
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/32`)).status()).toBe(404);
  expect((await anon.get(`${env.baseUrl}/gallery-icon/does-not-exist/32`)).status()).toBe(404);
  await anon.dispose();
});

test('17C: a draft gallery’s icon is visible to the owner only; collaborators and anonymous cannot upload', async ({ playwright }) => {
  const g = await gallery('E2E Icon Draft', 'client', false);
  expect((await setIcon(adminCtx, g.id, { name: 'a.png', mimeType: 'image/png', buffer: await png(64, 64) })).status()).toBe(200);

  const anon = await playwright.request.newContext();
  expect((await anon.get(`${env.baseUrl}/gallery-icon/${g.id}/32`)).status()).toBe(404);
  expect((await adminCtx.get(`${env.baseUrl}/gallery-icon/${g.id}/32`)).status()).toBe(200);

  const buf = await png(64, 64);
  expect((await setIcon(anon, g.id, { name: 'a.png', mimeType: 'image/png', buffer: buf })).status()).toBe(401);
  const inv = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `icon-${Date.now()}@example.com`);
  const collab = await collaboratorApiContext(env.baseUrl, env.dataDir, inv.collaboratorId);
  expect((await setIcon(collab, g.id, { name: 'a.png', mimeType: 'image/png', buffer: buf })).status()).toBe(401);
  expect((await collab.delete(`${env.baseUrl}/api/admin/galleries/${g.id}/icon`)).status()).toBe(401);
  await collab.dispose();
  await anon.dispose();
});

test('17D: uploads are validated — junk, unsafe SVG and oversize are refused; a plain SVG works', async () => {
  const g = await gallery('E2E Icon Validate');
  const junk = await setIcon(adminCtx, g.id, { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('definitely not an image') });
  expect(junk.status()).toBe(415);

  const evil = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  const evilRes = await setIcon(adminCtx, g.id, { name: 'x.svg', mimeType: 'image/svg+xml', buffer: evil });
  expect(evilRes.status()).toBe(415);
  const fileRead = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="file:///etc/passwd" width="10" height="10"/></svg>');
  expect((await setIcon(adminCtx, g.id, { name: 'y.svg', mimeType: 'image/svg+xml', buffer: fileRead })).status()).toBe(415);

  const big = await setIcon(adminCtx, g.id, { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) });
  expect(big.status()).toBe(413);

  // None of the refusals left an icon behind.
  expect(((await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/icon`)).json()) as { exists: boolean }).exists).toBe(false);

  const ok = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#004070"/></svg>');
  expect((await setIcon(adminCtx, g.id, { name: 'ok.svg', mimeType: 'image/svg+xml', buffer: ok })).status()).toBe(200);
  const served = await adminCtx.get(`${env.baseUrl}/gallery-icon/${g.id}/192`);
  expect(served.headers()['content-type']).toBe('image/png'); // never served as SVG
  expect((await sharp(await served.body()).metadata()).format).toBe('png');
});

test('17E: the gallery page, its lock screen and the portfolio page advertise the gallery icon', async ({ request }) => {
  // Client gallery, open.
  const open = await gallery('E2E Icon Open');
  const { version } = (await (await setIcon(adminCtx, open.id, { name: 'a.png', mimeType: 'image/png', buffer: await png(256, 256) })).json()) as { version: number };
  const html = await (await request.get(`${env.baseUrl}/g/${open.slug}`)).text();
  const links = iconLinks(html);
  expect(links.some((l) => l.includes(`/gallery-icon/${open.id}/32?v=${version}`))).toBe(true);
  expect(links.some((l) => l.includes(`/gallery-icon/${open.id}/180?v=${version}`) && /apple-touch-icon/.test(l))).toBe(true);
  // The site-wide icon must not compete with it.
  expect(links.filter((l) => !l.includes('/gallery-icon/') && /rel="icon"/.test(l))).toEqual([]);

  // Password-protected: the lock screen already carries the icon.
  const gated = await gallery('E2E Icon Gated');
  await patchGallery(adminCtx, env.baseUrl, gated.id, { password: 'sesame' });
  await setIcon(adminCtx, gated.id, { name: 'a.png', mimeType: 'image/png', buffer: await png(256, 256) });
  const gatedHtml = await (await request.get(`${env.baseUrl}/g/${gated.slug}`)).text();
  expect(gatedHtml).toContain(`/gallery-icon/${gated.id}/32`);
  expect(gatedHtml).not.toContain('<img'.concat(' src="/img/')); // still no gallery photos on the gate

  // Portfolio page.
  const pf = await gallery('E2E Icon Portfolio', 'portfolio');
  await setIcon(adminCtx, pf.id, { name: 'a.png', mimeType: 'image/png', buffer: await png(256, 256) });
  const pfHtml = await (await request.get(`${env.baseUrl}/portfolio/${pf.slug}`)).text();
  expect(iconLinks(pfHtml).some((l) => l.includes(`/gallery-icon/${pf.id}/32`))).toBe(true);

  // Secondary pages of the gallery (find / event / kiosk) too.
  await patchGallery(adminCtx, env.baseUrl, open.id, { eventPage: true, bibSearch: true, kioskEnabled: true });
  for (const sub of ['find', 'event']) {
    const subHtml = await (await request.get(`${env.baseUrl}/g/${open.slug}/${sub}`)).text();
    expect(subHtml, `/${sub}`).toContain(`/gallery-icon/${open.id}/32`);
  }
});

test('17F: galleries without an icon keep the site icon, and removing the icon restores it', async ({ request }) => {
  const g = await gallery('E2E Icon Default');
  const plain = iconLinks(await (await request.get(`${env.baseUrl}/g/${g.slug}`)).text());
  expect(plain.some((l) => l.includes('/icon'))).toBe(true);
  expect(plain.some((l) => l.includes('/gallery-icon/'))).toBe(false);

  await setIcon(adminCtx, g.id, { name: 'a.png', mimeType: 'image/png', buffer: await png(128, 128) });
  expect((await request.get(`${env.baseUrl}/g/${g.slug}`).then((r) => r.text())).includes('/gallery-icon/')).toBe(true);

  expect((await adminCtx.delete(`${env.baseUrl}/api/admin/galleries/${g.id}/icon`)).status()).toBe(200);
  const after = await (await request.get(`${env.baseUrl}/g/${g.slug}`)).text();
  expect(after.includes('/gallery-icon/')).toBe(false);
  expect((await request.get(`${env.baseUrl}/gallery-icon/${g.id}/32`)).status()).toBe(404);
});

test('17G: the Design tab uploads, previews, replaces and removes the icon', async ({ page }) => {
  const g = await gallery('E2E Icon UI');
  await page.context().addCookies((await adminCtx.storageState()).cookies);
  await page.goto(`/admin/galleries/${g.id}?tab=design`);

  const panel = page.locator('[data-gallery-icon-panel]');
  await expect(panel.getByText('Using the site icon.')).toBeVisible();

  await panel.locator('#gallery-icon-file').setInputFiles({ name: 'tab.png', mimeType: 'image/png', buffer: await png(400, 400) });
  await expect(panel.getByAltText('Tab icon preview')).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('Icon saved');
  await expect(panel.getByText('Replace icon')).toBeVisible();
  expect(((await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/icon`)).json()) as { exists: boolean }).exists).toBe(true);

  // A bad file shows the server's reason and keeps the existing icon.
  await panel.locator('#gallery-icon-file').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(panel.getByRole('alert')).toContainText(/PNG, JPEG, WebP or SVG|Could not read/i);
  await expect(panel.getByAltText('Tab icon preview')).toBeVisible();

  await panel.getByRole('button', { name: 'Remove' }).click();
  await expect(panel.getByText('Using the site icon.')).toBeVisible();
  expect(((await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/icon`)).json()) as { exists: boolean }).exists).toBe(false);
});
