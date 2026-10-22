import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { adminLogin } from './helpers/api';
import { loadTestEnv } from './helpers/env';

// API tokens: read = GET only, write = create/update but never delete, session-only routes stay closed.
test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let admin: APIRequestContext;
let anon: APIRequestContext;
let readToken = '';
let writeToken = '';
let readId = '';

const call = (token: string, method: string, path: string, data?: unknown, extra: Record<string, string> = {}) =>
  anon.fetch(`${env.baseUrl}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, ...extra } });

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  admin = await playwright.request.newContext();
  anon = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await admin.dispose();
  await anon.dispose();
});

test('tokens are created by the owner session only, and shown once', async () => {
  expect((await anon.post(`${env.baseUrl}/api/admin/api-tokens`, { data: { name: 'x', scope: 'read' } })).status()).toBe(401);
  expect((await admin.post(`${env.baseUrl}/api/admin/api-tokens`, { data: { name: 'x', scope: 'root' } })).status()).toBe(400);
  const r = await (await admin.post(`${env.baseUrl}/api/admin/api-tokens`, { data: { name: 'e2e read', scope: 'read' } })).json();
  readToken = r.token;
  readId = r.row.id;
  expect(readToken.startsWith('albm_')).toBe(true);
  writeToken = (await (await admin.post(`${env.baseUrl}/api/admin/api-tokens`, { data: { name: 'e2e write', scope: 'write' } })).json()).token;
  const list = JSON.stringify(await (await admin.get(`${env.baseUrl}/api/admin/api-tokens`)).json());
  expect(list).not.toContain(readToken);
});

test('a read token can read but not write, and cannot reach session-only routes', async () => {
  expect((await call(readToken, 'GET', '/api/admin/galleries')).status()).toBe(200);
  expect((await call(readToken, 'POST', '/api/admin/galleries', { title: 'nope', type: 'client' })).status()).toBe(401);
  for (const p of ['/api/admin/settings', '/api/admin/api-tokens', '/api/admin/sessions', '/api/admin/security', '/api/admin/storage/settings', '/api/admin/audit']) {
    expect((await call(readToken, 'GET', p)).status(), p).toBe(401);
  }
  expect((await call(readToken, 'GET', '/api/publish/galleries')).status()).toBe(401);
});

test('a write token creates and updates but never deletes, and cannot mint tokens', async () => {
  const created = await call(writeToken, 'POST', '/api/admin/galleries', { title: `Token gallery ${Date.now()}`, type: 'client' });
  expect(created.ok()).toBe(true);
  const id = (await created.json()).id as string;
  expect((await call(writeToken, 'PATCH', `/api/admin/galleries/${id}`, { description: 'via token' })).ok()).toBe(true);
  expect((await call(writeToken, 'DELETE', `/api/admin/galleries/${id}`)).status()).toBe(401);
  expect((await call(writeToken, 'POST', '/api/admin/api-tokens', { name: 'evil', scope: 'write' })).status()).toBe(401);
  expect((await call(writeToken, 'POST', '/api/admin/settings', { homeHeadline: 'pwned' })).status()).toBe(401);
  expect((await call(writeToken, 'POST', `/api/admin/galleries/${id}/photos`, {})).status()).toBe(401);
  expect((await call(writeToken, 'GET', '/api/publish/galleries')).status()).toBe(200);
  await admin.delete(`${env.baseUrl}/api/admin/galleries/${id}`);
});

test('forged headers and bad tokens do not authenticate', async () => {
  expect((await call('albm_notarealtoken', 'GET', '/api/admin/galleries')).status()).toBe(401);
  const forged = { 'x-albm-method': 'GET', 'x-albm-path': '/api/admin/galleries', 'x-albm-gate': 'deadbeef' };
  expect((await call(readToken, 'POST', '/api/admin/galleries', { title: 'x', type: 'client' }, forged)).status()).toBe(401);
  // Token-shaped bearer on a non-admin owner route is not honoured either.
  expect((await call(writeToken, 'GET', '/api/health')).status()).toBe(200);
});

test('writes are audit-logged by token name, and revoking stops the token', async () => {
  const audit = JSON.stringify(await (await admin.get(`${env.baseUrl}/api/admin/audit`)).json());
  expect(audit).toContain('api_token.write');
  expect((await admin.delete(`${env.baseUrl}/api/admin/api-tokens`, { data: { id: readId } })).ok()).toBe(true);
  expect((await call(readToken, 'GET', '/api/admin/galleries')).status()).toBe(401);
});
