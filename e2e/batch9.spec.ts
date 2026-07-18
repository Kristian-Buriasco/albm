import { expect, test, request as playwrightRequest } from '@playwright/test';
import path from 'node:path';
import Database from 'better-sqlite3';
import { adminLogin } from './helpers/api';
import { loadTestEnv } from './helpers/env';

test.describe.configure({ mode: 'serial' });

test('idle timeout revokes a stale session', async ({ playwright }) => {
  const env = loadTestEnv();
  const ctx = await playwrightRequest.newContext();
  await adminLogin(ctx, env.baseUrl, env.password);

  // Sanity: authenticated.
  expect((await ctx.get(`${env.baseUrl}/api/admin/sessions`)).status()).toBe(200);

  // Age every active session past the 48h idle window.
  const db = new Database(path.join(env.dataDir, 'gallery.db'));
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE revoked_at IS NULL').run(threeDaysAgo);
  db.close();

  // Next request must be rejected (session auto-revoked on touch).
  const res = await ctx.get(`${env.baseUrl}/api/admin/sessions`);
  expect(res.status()).toBe(401);
  await ctx.dispose();
});

test('login is audit-logged and audit supports actor filter + CSV export', async ({ playwright }) => {
  const env = loadTestEnv();
  const ctx = await playwrightRequest.newContext();
  await adminLogin(ctx, env.baseUrl, env.password);

  // A login event exists in the audit log.
  const auditRes = await ctx.get(`${env.baseUrl}/api/admin/audit?actor=owner`);
  expect(auditRes.status()).toBe(200);
  const { rows } = await auditRes.json();
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.every((r: { actorType: string }) => r.actorType === 'owner')).toBe(true);
  expect(rows.some((r: { action: string }) => r.action.startsWith('admin.login'))).toBe(true);

  // CSV export returns a CSV attachment with a header row.
  const csvRes = await ctx.get(`${env.baseUrl}/api/admin/audit?format=csv`);
  expect(csvRes.status()).toBe(200);
  expect(csvRes.headers()['content-type']).toContain('text/csv');
  const body = await csvRes.text();
  expect(body.split('\n')[0]).toContain('timestamp,action,actor_type');
  await ctx.dispose();
});

test('sessions list exposes device + location fields', async ({ playwright }) => {
  const env = loadTestEnv();
  const ctx = await playwrightRequest.newContext();
  await adminLogin(ctx, env.baseUrl, env.password);
  const res = await ctx.get(`${env.baseUrl}/api/admin/sessions`);
  const { sessions } = await res.json();
  expect(sessions.length).toBeGreaterThan(0);
  // Keys present (values may be null without a geo DB / real UA).
  expect(sessions[0]).toHaveProperty('device');
  expect(sessions[0]).toHaveProperty('location');
  await ctx.dispose();
});
