import { expect, test } from '@playwright/test';
import { loadTestEnv } from './helpers/env';

// Web updater: owner-only, and a clear "not configured" answer when UPDATER_URL/UPDATER_TOKEN are unset.
test('update endpoint needs an admin and reports a missing updater', async ({ playwright }) => {
  const env = loadTestEnv();
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${env.baseUrl}/api/admin/update`)).status()).toBe(401);
  expect((await anon.post(`${env.baseUrl}/api/admin/update`)).status()).toBe(401);
  const { adminLogin } = await import('./helpers/api');
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  expect((await admin.get(`${env.baseUrl}/api/admin/update`)).status()).toBe(501);
  expect((await admin.post(`${env.baseUrl}/api/admin/update`)).status()).toBe(501);
  expect((await (await admin.get(`${env.baseUrl}/api/admin/version`)).json()).canUpdate).toBe(false);
  await admin.dispose();
  await anon.dispose();
});
