#!/usr/bin/env node
/**
 * Capture README screenshots at ~1440px (light theme).
 * Requires a running server + seed-demo output in demo-data/seed-info.json.
 * Usage: node scripts/capture-screenshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo123';
const OUT = path.join(process.cwd(), 'docs', 'screenshots');

async function dismissCookieBanner(page) {
  const decline = page.getByRole('button', { name: /essential only|alleen essentieel|solo essenziali/i });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function forceReveals(page) {
  await page.evaluate(() =>
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible')),
  );
}

async function login(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await dismissCookieBanner(page);
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

function loadSeed() {
  const defaults = {
    client: 'aq22fgJba3aQCW',
    clientId: null,
    event: null,
  };
  try {
    return {
      ...defaults,
      ...JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'demo-data', 'seed-info.json'), 'utf8'),
      ),
    };
  } catch {
    return defaults;
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seed = loadSeed();
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

  // —— Public portfolio ——
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await dismissCookieBanner(page);
  await forceReveals(page);
  await page.waitForTimeout(300);
  await shot(page, 'portfolio.png', { fullPage: true });

  // —— Contact ——
  await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await dismissCookieBanner(page);
  await forceReveals(page);
  await shot(page, 'contact.png', { fullPage: true });

  // —— Client gallery grid ——
  await page.goto(`${BASE}/g/${seed.client}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await dismissCookieBanner(page);
  const skip = page.getByRole('button', { name: /^skip$/i }).or(page.getByText(/^skip$/i));
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await forceReveals(page);
  await page.waitForTimeout(400);
  await shot(page, 'client-gallery.png');

  // —— Client lightbox (favorites + slideshow control) ——
  const thumb = page.locator('img[src*="/img/"]').first();
  if (await thumb.count()) {
    await thumb.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    const favorite = page.getByRole('button', { name: /add to selection|remove from selection/i });
    if (await favorite.isVisible().catch(() => false)) {
      await favorite.click().catch(() => {});
      await page.waitForTimeout(200);
    }
    await shot(page, 'client-lightbox.png');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  } else {
    console.warn('No thumbnail for lightbox; skipping client-lightbox.png');
  }

  // —— Event self-service page ——
  if (seed.event) {
    await page.goto(`${BASE}/g/${seed.event}/event`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await dismissCookieBanner(page);
    await forceReveals(page);
    await shot(page, 'event-page.png', { fullPage: true });
  } else {
    console.warn('No event slug in seed-info; skipping event-page.png');
  }

  // —— Admin ——
  await login(page);

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'admin.png', { fullPage: true });

  // —— Admin gallery detail (sections / tags / bulk) ——
  if (seed.clientId) {
    await page.goto(`${BASE}/admin/galleries/${seed.clientId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const sectionsHeading = page.getByText(/sections, tags\s*&\s*bulk/i);
    if (await sectionsHeading.isVisible().catch(() => false)) {
      await sectionsHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    }
    const selectAll = page.getByRole('button', { name: /select all visible/i });
    if (await selectAll.isVisible().catch(() => false)) {
      await selectAll.click().catch(() => {});
      await page.waitForTimeout(400);
    } else {
      // Fallback: click a few thumbnails in the sections grid
      const cells = page.locator('button, [role="button"]').filter({ has: page.locator('img[src*="/img/"]') });
      const n = Math.min(3, await cells.count());
      for (let i = 0; i < n; i++) {
        await cells.nth(i).click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(300);
    }
    await shot(page, 'admin-gallery.png');
  } else {
    console.warn('No clientId in seed-info; skipping admin-gallery.png');
  }

  // —— Security (passkeys) ——
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const passkeys = page.getByRole('heading', { name: /^Passkeys$/i });
  if (await passkeys.isVisible().catch(() => false)) {
    await passkeys.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await shot(page, 'security.png');

  // —— Audit log ——
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, 'audit.png', { fullPage: true });

  await browser.close();
  console.log('All screenshots written to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
