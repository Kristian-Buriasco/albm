#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo123';
const OUT = path.join(process.cwd(), 'docs', 'screenshots');

async function login(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  const passwordBtn = page.getByRole('button', { name: /password/i });
  if (await passwordBtn.isVisible().catch(() => false)) {
    await passwordBtn.click();
  }
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
}

async function shot(page, file, opts = {}) {
  await page.screenshot({ path: path.join(OUT, file), ...opts });
  console.log('wrote', file);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  await context.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  });
  const page = await context.newPage();

  let clientSlug = 'aq22fgJba3aQCW';
  try {
    clientSlug = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'demo-data', 'seed-info.json'), 'utf8'),
    ).client;
  } catch {
    /* demo seed optional */
  }

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // Dismiss cookie banner if present (keeps screenshots clean).
  const decline = page.getByRole('button', { name: /essential only|decline|reject/i });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  // Scroll-reveal uses IntersectionObserver; below-fold items stay at
  // opacity 0 in a full-page screenshot. Force them visible before capture.
  await page.evaluate(() =>
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible')),
  );
  await page.waitForTimeout(300);
  await shot(page, 'portfolio.png', { fullPage: true });

  await page.goto(`${BASE}/g/${clientSlug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const skip = page.getByRole('button', { name: /^skip$/i }).or(page.getByText(/^skip$/i));
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const thumb = page.locator('img[src*="/img/"]').first();
  if (await thumb.count()) await thumb.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, 'client-gallery.png');

  await login(page);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'admin.png', { fullPage: true });

  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /^Passkeys$/i }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, 'security.png');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
