import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers/api';
import { loadTestEnv } from './helpers/env';
import { restartE2eServer } from './helpers/restart-server';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;

test.beforeAll(() => {
  env = loadTestEnv();
});

test('3A: rate-limit failures persist across server restart', async ({ playwright }) => {
  // Use a unique X-Forwarded-For so we don't trip global limits from earlier suites.
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const ctx = await playwright.request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });

  for (let i = 0; i < 10; i++) {
    const res = await ctx.post(`${env.baseUrl}/api/admin/login`, {
      data: { password: 'wrong-password-for-rl' },
    });
    expect(res.status()).toBe(401);
  }

  const limited = await ctx.post(`${env.baseUrl}/api/admin/login`, {
    data: { password: 'wrong-password-for-rl' },
  });
  expect(limited.status()).toBe(429);
  await ctx.dispose();

  await restartE2eServer();

  const after = await playwright.request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });
  const stillLimited = await after.post(`${env.baseUrl}/api/admin/login`, {
    data: { password: 'wrong-password-for-rl' },
  });
  expect(stillLimited.status()).toBe(429);
  await after.dispose();
});

test('3B: revoking an admin session returns 401 on next request', async ({ playwright }) => {
  const a = await playwright.request.newContext();
  const b = await playwright.request.newContext();
  await adminLogin(a, env.baseUrl, env.password);
  await adminLogin(b, env.baseUrl, env.password);

  const okB = await b.get(`${env.baseUrl}/api/admin/version`);
  expect(okB.ok()).toBeTruthy();

  const list = await a.get(`${env.baseUrl}/api/admin/sessions`);
  expect(list.ok()).toBeTruthy();
  const data = await list.json();
  const other = (data.sessions as { id: string; isCurrent: boolean }[]).find((s) => !s.isCurrent);
  expect(other).toBeTruthy();

  const revoke = await a.post(`${env.baseUrl}/api/admin/sessions`, {
    data: { id: other!.id },
  });
  expect(revoke.ok()).toBeTruthy();

  const denied = await b.get(`${env.baseUrl}/api/admin/version`);
  expect(denied.status()).toBe(401);

  const stillA = await a.get(`${env.baseUrl}/api/admin/version`);
  expect(stillA.ok()).toBeTruthy();

  await a.dispose();
  await b.dispose();
});

test('3C: analytics HTML gated on consent cookie', async ({ playwright, page }) => {
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const marker = `window.__E2E_ANALYTICS_${Date.now()}__=1`;
  await admin.post(`${env.baseUrl}/api/admin/settings`, {
    data: {
      analyticsHeadHtml: `<script>${marker}</script>`,
    },
  });
  await admin.dispose();

  await page.context().clearCookies();
  await page.goto('/');
  const htmlNoConsent = await page.content();
  expect(htmlNoConsent).not.toContain(marker);
  await expect(page.getByRole('dialog', { name: /Cookie/i })).toBeVisible();

  await page.context().addCookies([
    {
      name: 'cookie_consent',
      value: 'analytics',
      url: env.baseUrl,
    },
  ]);
  await page.goto('/');
  const htmlWithConsent = await page.content();
  expect(htmlWithConsent).toContain(marker);
});
