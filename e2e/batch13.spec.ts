import { expect, test } from '@playwright/test';
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
import { GALLERY_THEME_PRESETS } from '../src/lib/gallery-theme';
import { readXmpRights } from '../src/lib/xmp';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>;
const YEAR = new Date().getUTCFullYear();
const OWNER = 'Kristian Buriasco'; // default site owner name (NEXT_PUBLIC_SITE_NAME unset in e2e)

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await adminCtx.dispose();
});

async function collabUpload(
  ctx: Awaited<ReturnType<typeof collaboratorApiContext>>,
  galleryId: string,
  name: string,
  color: { r: number; g: number; b: number },
) {
  const tmp = tempImagePath(name);
  await makeTestJpeg(tmp, color);
  const res = await ctx.post(`${env.baseUrl}/api/admin/galleries/${galleryId}/photos`, {
    multipart: { file: { name, mimeType: 'image/jpeg', buffer: fs.readFileSync(tmp) } },
  });
  fs.rmSync(tmp, { force: true });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

/** A published client gallery: one owner photo + one photo by a collaborator named `collabName`. */
async function setupGallery(title: string, collabName: string | null) {
  const g = await createGallery(adminCtx, env.baseUrl, { title: `${title} ${Date.now()}`, type: 'client' });
  const img = tempImagePath(`own-${title}.jpg`);
  await makeTestJpeg(img, { r: 20, g: 90, b: 160 });
  const ownerPhoto = await uploadPhoto(adminCtx, env.baseUrl, g.id, img);
  fs.rmSync(img, { force: true });

  const inv = await inviteCollaborator(adminCtx, env.baseUrl, g.id, `credit-${Date.now()}-${Math.random()}@example.com`);
  if (collabName) {
    const r = await adminCtx.patch(`${env.baseUrl}/api/admin/collaborators/${inv.collaboratorId}`, { data: { name: collabName } });
    expect(r.status()).toBe(200);
  }
  const ctx = await collaboratorApiContext(env.baseUrl, env.dataDir, inv.collaboratorId);
  const collabPhoto = await collabUpload(ctx, g.id, 'collab.jpg', { r: 160, g: 60, b: 40 });
  await ctx.dispose();

  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, ownerPhoto.id);
  await waitForPhotoReady(adminCtx, env.baseUrl, g.id, collabPhoto.id);
  await patchGallery(adminCtx, env.baseUrl, g.id, { published: true, downloadEnabled: true });
  return { g, ownerPhoto, collabPhoto, collaboratorId: inv.collaboratorId };
}

test('13A: gallery footer and lightbox show the holder, the year and photographer credits', async ({ page }) => {
  const { g } = await setupGallery('E2E Credits', 'Ruben V.');
  await patchGallery(adminCtx, env.baseUrl, g.id, { copyrightHolder: 'KU Leuven Sport' });

  await page.goto(`/g/${g.slug}`);
  const footer = page.locator('footer');
  await expect(footer).toContainText(`© ${YEAR} KU Leuven Sport`);
  await expect(footer).toContainText(`Photos: ${OWNER}, Ruben V.`);

  // Lightbox: the collaborator's photo is credited to them.
  await page.locator('main img').nth(1).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`© ${YEAR} KU Leuven Sport`);
  await expect(dialog).toContainText(/Photo: (Ruben V\.|Kristian Buriasco)/);
  const texts: string[] = [];
  for (let i = 0; i < 2; i++) {
    texts.push(await dialog.innerText());
    await page.getByRole('button', { name: 'Next photo' }).click();
  }
  expect(texts.join('\n')).toContain('Photo: Ruben V.');
  expect(texts.join('\n')).toContain(`Photo: ${OWNER}`);
});

test('13B: without a holder the owner is shown; credits can be switched off; unnamed collaborators are not credited', async ({ page }) => {
  const { g } = await setupGallery('E2E Defaults', null);
  await page.goto(`/g/${g.slug}`);
  await expect(page.locator('footer')).toContainText(`© ${YEAR} ${OWNER}`);
  // The unnamed collaborator is omitted rather than mis-credited to the owner.
  const credits = (await page.locator('footer').innerText()).match(/Photos: (.*)/)?.[1];
  expect(credits).toBe(OWNER);

  await patchGallery(adminCtx, env.baseUrl, g.id, { showCredits: false });
  await page.goto(`/g/${g.slug}`);
  await expect(page.locator('footer')).not.toContainText('Photos:');
});

test('13C: collaborator display name is owner-only and can be cleared', async ({ playwright }) => {
  const { g, collaboratorId } = await setupGallery('E2E Rename', 'First Name');
  const ctx = await collaboratorApiContext(env.baseUrl, env.dataDir, collaboratorId);
  const denied = await ctx.patch(`${env.baseUrl}/api/admin/collaborators/${collaboratorId}`, { data: { name: 'Hacker' } });
  expect(denied.status()).toBe(401);
  await ctx.dispose();

  const anon = await playwright.request.newContext();
  expect((await anon.patch(`${env.baseUrl}/api/admin/collaborators/${collaboratorId}`, { data: { name: 'x' } })).status()).toBe(401);
  await anon.dispose();

  const list = await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/collaborators`)).json();
  expect(list.collaborators[0].name).toBe('First Name');
  await adminCtx.patch(`${env.baseUrl}/api/admin/collaborators/${collaboratorId}`, { data: { name: '  ' } });
  const after = await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}/collaborators`)).json();
  expect(after.collaborators[0].name).toBeNull();
});

test('13D: downloaded JPEGs carry the photographer copyright by default, with the artist; override works', async ({ playwright }) => {
  const { g, ownerPhoto, collabPhoto } = await setupGallery('E2E Xmp', 'Ruben V.');
  // The page shows the CLIENT's name; the file keeps the photographer's own copyright.
  await patchGallery(adminCtx, env.baseUrl, g.id, { copyrightHolder: 'KU Leuven Sport', downloadOfferPrint: true });
  const anon = await playwright.request.newContext();

  const own = Buffer.from(await (await anon.get(`${env.baseUrl}/dl/${ownerPhoto.id}?size=original`)).body());
  expect(readXmpRights(own)).toEqual({ copyright: `© ${YEAR} ${OWNER}`, artists: [OWNER] });

  const collab = Buffer.from(await (await anon.get(`${env.baseUrl}/dl/${collabPhoto.id}?size=original`)).body());
  expect(readXmpRights(collab)).toEqual({ copyright: `© ${YEAR} ${OWNER}`, artists: ['Ruben V.'] });

  // The print size is a different code path (re-encoded derivative) — same guarantee.
  const printRes = await anon.get(`${env.baseUrl}/dl/${collabPhoto.id}?size=print`);
  expect(printRes.status()).toBe(200);
  const print = Buffer.from(await printRes.body());
  expect(readXmpRights(print).copyright).toBe(`© ${YEAR} ${OWNER}`);

  // Owner overrides the embedded copyright for this gallery.
  await patchGallery(adminCtx, env.baseUrl, g.id, { xmpCopyright: 'KU Leuven Sport' });
  const over = Buffer.from(await (await anon.get(`${env.baseUrl}/dl/${ownerPhoto.id}?size=original`)).body());
  expect(readXmpRights(over).copyright).toBe(`© ${YEAR} KU Leuven Sport`);
  await patchGallery(adminCtx, env.baseUrl, g.id, { xmpCopyright: '© 2024 Studio X' });
  const verbatim = Buffer.from(await (await anon.get(`${env.baseUrl}/dl/${ownerPhoto.id}?size=original`)).body());
  expect(readXmpRights(verbatim).copyright).toBe('© 2024 Studio X');
  await anon.dispose();
});

test('13E: the KU Leuven Sport preset applies to a real gallery page', async ({ page }) => {
  const { g } = await setupGallery('E2E KU Theme', 'Ruben V.');
  const ku = GALLERY_THEME_PRESETS.find((p) => p.id === 'ku-leuven-sport')!;
  await patchGallery(adminCtx, env.baseUrl, g.id, { themeConfig: ku.theme });

  await page.goto(`/g/${g.slug}`);
  const css = await page.locator('style').allInnerTexts();
  const joined = css.join('\n').toLowerCase();
  expect(joined).toContain('#004070'); // KU Leuven navy (light-mode accent)
  expect(joined).toContain('#00122f'); // dark-mode paper
  // The gallery itself keeps working under the theme.
  await expect(page.locator('main img').first()).toBeVisible();
  await expect(page.locator('footer')).toContainText('Photos:');
});

test('13F: the Design tab offers the preset and the Settings tab saves copyright fields', async ({ page }) => {
  const { g } = await setupGallery('E2E Admin UI', 'Ruben V.');
  await page.context().addCookies((await adminCtx.storageState()).cookies);

  await page.goto(`/admin/galleries/${g.id}?tab=settings`);
  await page.locator('#copyright-holder').fill('KU Leuven Sport');
  await page.locator('#xmp-copyright').fill('Studio Kristian');
  const card = page.locator('section', { has: page.locator('#copyright-holder') });
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Saved')).toBeVisible();
  const saved = (await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`)).json()) as {
    copyrightHolder: string | null;
    xmpCopyright: string | null;
    showCredits: boolean;
  };
  expect(saved.copyrightHolder).toBe('KU Leuven Sport');
  expect(saved.xmpCopyright).toBe('Studio Kristian');
  expect(saved.showCredits).toBe(true);
});

test('13G: picking the KU Leuven preset in the Design tab and saving themes the live gallery', async ({ page }) => {
  const { g } = await setupGallery('E2E Preset UI', 'Ruben V.');
  await page.context().addCookies((await adminCtx.storageState()).cookies);
  await page.goto(`/admin/galleries/${g.id}?tab=design`);

  await page.locator('#design-preset').click(); // custom Select button
  await page.getByRole('option', { name: 'KU Leuven Sport' }).click();
  // The editor now holds the preset's navy accent (hex input in the light-mode row).
  await expect(page.locator('input[value="#004070" i]').first()).toBeVisible();
  await page.getByRole('button', { name: /save design/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  const saved = (await (await adminCtx.get(`${env.baseUrl}/api/admin/galleries/${g.id}`)).json()) as { themeConfig: string | null };
  expect(JSON.parse(saved.themeConfig!).colors.light.accent).toBe('#004070');
  expect(JSON.parse(saved.themeConfig!).font.pairId).toBe('academic-serif');

  await page.goto(`/g/${g.slug}`);
  const css = (await page.locator('style').allInnerTexts()).join('\n').toLowerCase();
  expect(css).toContain('#004070');
});

test('13H: in dark mode the KU theme really recolours the gallery (navy, not the default grey)', async ({ browser }) => {
  const { g } = await setupGallery('E2E KU Dark', 'Ruben V.');
  const ku = GALLERY_THEME_PRESETS.find((p) => p.id === 'ku-leuven-sport')!;
  await patchGallery(adminCtx, env.baseUrl, g.id, { themeConfig: ku.theme });

  for (const [scheme, bg, ink] of [
    ['dark', 'rgb(0, 18, 47)', 'rgb(232, 241, 248)'],
    ['light', 'rgb(246, 250, 253)', 'rgb(0, 25, 75)'],
  ] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${env.baseUrl}/g/${g.slug}`);
    const root = page.locator('[data-gallery-theme]').first();
    await expect(root).toBeVisible();
    const colors = await root.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    expect(colors.bg, `${scheme} page background`).toBe(bg);
    expect(colors.fg, `${scheme} text colour`).toBe(ink);
    // The sticky gallery toolbar (uses bg-paper / dark:bg-paper-dark) follows the theme too.
    // Convert whatever colour syntax the browser reports (it may be oklab) to plain RGB.
    const [r, gch, b] = await page.locator('header').first().evaluate((el) => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.fillStyle = getComputedStyle(el).backgroundColor;
      c.fillRect(0, 0, 1, 1);
      const d = c.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    const want = bg.match(/\d+/g)!.map(Number);
    for (const [got, exp] of [[r, want[0]], [gch, want[1]], [b, want[2]]]) expect(Math.abs(got - exp)).toBeLessThanOrEqual(8);
    await ctx.close();
  }
});

