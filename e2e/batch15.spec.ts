import { expect, test, type Page } from '@playwright/test';
import { loadTestEnv } from './helpers/env';

const env = loadTestEnv();
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const toggle = (page: Page) => page.getByRole('button', { name: 'Toggle theme' }).first().click();

test.describe('theme preference survives Safari-style storage loss', () => {
  test('15A: purged localStorage (Safari ITP 7-day cap) does not lose the choice', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto('/about');
    await toggle(page);
    expect(await isDark(page)).toBe(true);
    // Safari deletes script-writable storage; a server-set cookie is not subject to that cap.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    expect(await isDark(page)).toBe(true);
    await ctx.close();
  });

  test('15B: unusable localStorage (private / blocked storage) still persists the choice', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    await ctx.addInitScript(() => {
      const fail = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', { get: fail });
    });
    const page = await ctx.newPage();
    await page.goto('/about');
    await toggle(page);
    expect(await isDark(page)).toBe(true);
    await page.goto('/contact');
    expect(await isDark(page)).toBe(true);
    await page.reload();
    expect(await isDark(page)).toBe(true);
    await ctx.close();
  });

  test('15C: the choice is stored as a long-lived server cookie and the server renders it (no flash)', async ({ browser, request }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto('/about');
    await toggle(page);
    await expect.poll(async () => (await ctx.cookies()).find((c) => c.name === 'theme')?.value).toBe('dark');
    const cookie = (await ctx.cookies()).find((c) => c.name === 'theme')!;
    const days = (cookie.expires - Date.now() / 1000) / 86400;
    expect(days).toBeGreaterThan(300); // ~1 year, not a session cookie
    await ctx.close();

    const html = await (await request.get(`${env.baseUrl}/about`, { headers: { cookie: 'theme=dark' } })).text();
    expect(html).toMatch(/<html[^>]*class="[^"]*\bdark\b/);
    const light = await (await request.get(`${env.baseUrl}/about`, { headers: { cookie: 'theme=light' } })).text();
    expect(light).not.toMatch(/<html[^>]*class="[^"]*\bdark\b/);
  });

  test('15D: an explicit choice beats the OS setting; with no choice the OS decides', async ({ browser }) => {
    // OS dark, user chose light -> light.
    const a = await browser.newContext({ colorScheme: 'dark' });
    const pa = await a.newPage();
    await pa.goto('/about');
    expect(await isDark(pa)).toBe(true); // no choice yet: follows the OS
    await toggle(pa);
    expect(await isDark(pa)).toBe(false);
    await pa.reload();
    expect(await isDark(pa)).toBe(false);
    await a.close();

    // OS light, no choice -> light (and a fresh context has no stale preference).
    const b = await browser.newContext({ colorScheme: 'light' });
    const pb = await b.newPage();
    await pb.goto('/about');
    expect(await isDark(pb)).toBe(false);
    await b.close();
  });

  test('15E: the theme endpoint accepts only dark/light and sets no session-only cookie', async ({ request }) => {
    const bad = await request.post(`${env.baseUrl}/api/theme`, { data: { theme: '<script>' } });
    expect(bad.status()).toBe(400);
    const ok = await request.post(`${env.baseUrl}/api/theme`, { data: { theme: 'dark' } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()['set-cookie']).toMatch(/theme=dark/);
    expect(ok.headers()['set-cookie']).toMatch(/Max-Age=\d{7,}/i);
  });
});
