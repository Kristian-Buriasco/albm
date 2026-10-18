import http from 'node:http';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { adminLogin } from './helpers/api';
import { loadTestEnv } from './helpers/env';

// Settings > Storage: validation, never saving credentials that fail, secret never returned, reset.
test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let admin: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await admin.delete(`${env.baseUrl}/api/admin/storage/settings`);
  await admin.dispose();
});

const form = (over: Record<string, unknown> = {}) => ({
  enabled: false,
  endpoint: 'https://example.r2.cloudflarestorage.com',
  bucket: 'albm-test',
  region: 'auto',
  accessKeyId: 'AKIATESTKEY',
  secretAccessKey: 'super-secret-value',
  prefix: '',
  keepLocal: true,
  originals: true,
  galleries: [],
  ...over,
});

test('storage settings need an admin session', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${env.baseUrl}/api/admin/storage/settings`)).status()).toBe(401);
  expect((await anon.post(`${env.baseUrl}/api/admin/storage/test`, { data: form() })).status()).toBe(401);
  await anon.dispose();
});

test('invalid input is rejected with a clear message', async () => {
  for (const bad of [
    { endpoint: 'not a url' },
    { endpoint: 'http://example.com' },
    { endpoint: 'https://example.com/some/path' },
    { bucket: 'X' },
    { accessKeyId: '' },
    { galleries: ['ok', '../etc'] },
  ]) {
    const res = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, { data: form(bad) });
    expect(res.status(), JSON.stringify(bad)).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
  }
  const nonObject = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, {
    headers: { 'content-type': 'application/json' },
    data: 'null',
  });
  expect(nonObject.status()).toBe(400);
});

test('turning storage on with unreachable credentials is refused and nothing is saved', async () => {
  const before = (await (await admin.get(`${env.baseUrl}/api/admin/storage/settings`)).json()) as { source: string };
  const res = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, {
    data: form({ enabled: true, endpoint: 'http://127.0.0.1:1' }),
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/^Not saved\./);
  const after = (await (await admin.get(`${env.baseUrl}/api/admin/storage/settings`)).json()) as { source: string };
  expect(after.source).toBe(before.source);
});

test('saved settings round-trip without ever exposing the secret, and reset forgets them', async () => {
  const saved = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, { data: form() });
  expect(saved.status()).toBe(200);
  const raw = await saved.text();
  expect(raw).not.toContain('super-secret-value');
  const view = JSON.parse(raw) as Record<string, unknown>;
  expect(view).toMatchObject({ source: 'ui', enabled: false, bucket: 'albm-test', hasSecret: true, originals: true });
  expect(await (await admin.get(`${env.baseUrl}/api/admin/storage/settings`)).text()).not.toContain('super-secret-value');

  // blank secret keeps the saved one
  const again = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, { data: form({ secretAccessKey: '', bucket: 'albm-test2' }) });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ bucket: 'albm-test2', hasSecret: true });

  const reset = await admin.delete(`${env.baseUrl}/api/admin/storage/settings`);
  expect(reset.status()).toBe(200);
  expect(await reset.json()).toMatchObject({ source: 'none' });
});

test('test-connection reports an unreachable endpoint instead of throwing', async () => {
  const res = await admin.post(`${env.baseUrl}/api/admin/storage/test`, {
    data: form({ endpoint: 'http://127.0.0.1:1' }),
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: false });
});

test('the Storage tab shows in Settings', async ({ page }) => {
  await page.request.post(`${env.baseUrl}/api/admin/login`, { data: { password: env.password } });
  await page.goto(`${env.baseUrl}/admin/settings`);
  await page.getByRole('tab', { name: 'Storage' }).click();
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
  await expect(page.getByLabel('Secret access key')).toHaveAttribute('type', 'password');
});

test('enabling works end to end against an S3-compatible endpoint, and a wrong bucket is refused', async () => {
  const objects = new Map<string, Buffer>();
  const stub = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const [bucket, ...rest] = new URL(req.url ?? '/', 'http://x').pathname.split('/').slice(1);
      const key = rest.join('/');
      if (!String(req.headers.authorization ?? '').startsWith('AWS4-HMAC-SHA256')) return void res.writeHead(403).end();
      if (bucket !== 'stub-bucket') return void res.writeHead(404).end();
      if (req.method === 'PUT') objects.set(key, Buffer.concat(chunks));
      if (req.method === 'DELETE') objects.delete(key);
      if (req.method === 'GET') {
        const o = objects.get(key);
        return void (o ? res.writeHead(200).end(o) : res.writeHead(404).end());
      }
      res.writeHead(req.method === 'DELETE' ? 204 : 200).end();
    });
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  try {
    const wrong = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, {
      data: form({ enabled: true, endpoint, bucket: 'other-bucket' }),
    });
    expect(wrong.status()).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toContain('bucket not found');

    const ok = await admin.put(`${env.baseUrl}/api/admin/storage/settings`, {
      data: form({ enabled: true, endpoint, bucket: 'stub-bucket', galleries: ['abc-123'] }),
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ source: 'ui', enabled: true, bucket: 'stub-bucket', galleries: ['abc-123'] });
    expect(objects.size).toBe(0); // the test object was cleaned up
  } finally {
    await admin.delete(`${env.baseUrl}/api/admin/storage/settings`);
    await new Promise((r) => stub.close(r));
  }
});

test('the dashboard storage snapshot endpoint still works', async () => {
  const res = await admin.get(`${env.baseUrl}/api/admin/storage?refresh=1`);
  expect(res.status()).toBe(200);
  expect(await res.json()).not.toHaveProperty('hasSecret');
});
