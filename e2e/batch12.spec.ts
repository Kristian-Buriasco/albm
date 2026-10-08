import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  adminLogin,
  createGallery,
  patchGallery,
  tempImagePath,
  uploadPhoto,
  waitForPhotoReady,
} from './helpers/api';
import { loadTestEnv, makeTestJpeg } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let clientSlug = '';
let portfolioSlug = '';

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const colors = [
    { r: 200, g: 60, b: 60 },
    { r: 60, g: 200, b: 60 },
    { r: 60, g: 60, b: 200 },
  ];
  for (const type of ['client', 'portfolio'] as const) {
    const g = await createGallery(admin, env.baseUrl, { title: `E2E UX ${type} ${Date.now()}`, type });
    for (let i = 0; i < colors.length; i++) {
      const img = tempImagePath(`ux-${type}-${i}.jpg`);
      await makeTestJpeg(img, colors[i]);
      const p = await uploadPhoto(admin, env.baseUrl, g.id, img);
      await waitForPhotoReady(admin, env.baseUrl, g.id, p.id);
      fs.rmSync(img, { force: true });
    }
    await patchGallery(admin, env.baseUrl, g.id, { published: true });
    if (type === 'client') clientSlug = g.slug;
    else portfolioSlug = g.slug;
  }
  await admin.dispose();
});

test('12A: lightbox has prev/next buttons, an opaque backdrop, and sits above the cookie banner', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/g/${clientSlug}`);
  await expect(page.getByRole('dialog', { name: /cookie/i })).toBeVisible();
  await page.locator('main img').first().click();

  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/^1 \/ 3$/)).toBeVisible();

  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(page.getByText(/^2 \/ 3$/)).toBeVisible();
  await page.getByRole('button', { name: 'Previous photo' }).click();
  await expect(page.getByText(/^1 \/ 3$/)).toBeVisible();

  // Fully opaque backdrop: the page behind must not ghost through.
  const alpha = await dialog.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
    return m.length === 4 ? Number(m[3]) : 1;
  });
  expect(alpha).toBe(1);

  // The cookie banner must NOT paint over the open lightbox.
  const bannerBox = await page.getByRole('dialog', { name: /cookie/i }).boundingBox();
  expect(bannerBox).not.toBeNull();
  const topAtBanner = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[aria-modal="true"]') !== null,
    { x: bannerBox!.x + bannerBox!.width / 2, y: bannerBox!.y + bannerBox!.height / 2 },
  );
  expect(topAtBanner).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('12B: contact form reports every problem at once and focuses the first bad field', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: /send message/i }).click();
  await expect(page.getByText('Please enter your name.')).toBeVisible();
  await expect(page.getByText('Please enter a valid email.')).toBeVisible();
  await expect(page.getByText('Please write a short message.')).toBeVisible();
  await expect(page.locator('#c-name')).toBeFocused();
  await expect(page.locator('#c-name')).toHaveAttribute('aria-invalid', 'true');

  // Fixing a field clears just its own error.
  await page.locator('#c-name').fill('Ada');
  await expect(page.getByText('Please enter your name.')).toBeHidden();
  await expect(page.getByText('Please enter a valid email.')).toBeVisible();
});

test('12C: accessibility basics — h1s, skip link, labelled like buttons', async ({ page }) => {
  for (const path of ['/about', '/contact']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
  }

  await page.goto('/about');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await expect(page.locator('main#main')).toHaveCount(1);

  await page.goto(`/portfolio/${portfolioSlug}`);
  const hearts = page.getByRole('button', { name: /^(Like|Unlike) photo$/ });
  await expect(hearts).toHaveCount(3);
  await hearts.first().click({ force: true });
  await expect(page.getByRole('button', { name: 'Unlike photo' })).toHaveCount(1);
});

test('12D: fresh install shows the admin password form straight away', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('12E: cookie banner is compact on phones', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${env.baseUrl}/`);
  const banner = page.getByRole('dialog', { name: /cookie/i });
  await expect(banner).toBeVisible();
  const box = await banner.boundingBox();
  expect(box!.height).toBeLessThan(844 * 0.22);
  await ctx.close();
});
