import { expect, test, request as playwrightRequest } from '@playwright/test';
import {
  adminLogin,
  createGallery,
  inviteCollaborator,
} from './helpers/api';
import { addCollaboratorCookie } from './helpers/collab';
import { loadTestEnv } from './helpers/env';

test.describe.configure({ mode: 'serial' });

let env: ReturnType<typeof loadTestEnv>;
let adminCtx: Awaited<ReturnType<typeof playwrightRequest.newContext>>;

test.beforeAll(async ({ playwright }) => {
  env = loadTestEnv();
  adminCtx = await playwright.request.newContext();
  await adminLogin(adminCtx, env.baseUrl, env.password);
});

test.afterAll(async () => {
  await adminCtx.dispose();
});

test.describe('Settings redesign — admin settings tabs', () => {
  test('tabs render, deep-link, and survive reload', async ({ page, context }) => {
    // Authenticate the browser context (shares cookies with page navigations).
    await context.request.post(`${env.baseUrl}/api/admin/login`, {
      data: { password: env.password },
    });

    await page.goto('/admin/settings');
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();
    for (const label of ['General', 'Security', 'Gallery defaults', 'Sharing']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
    // General is the default active tab.
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Deep-link to Security.
    await page.goto('/admin/settings?tab=security');
    await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Clicking Sharing updates the URL.
    await page.getByRole('tab', { name: 'Sharing' }).click();
    await expect(page).toHaveURL(/tab=sharing/);

    // Reload on a deep-linked tab keeps it active.
    await page.goto('/admin/settings?tab=security');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

test.describe('Settings redesign — gallery tabs + collaborator gating', () => {
  test('owner sees all gallery tabs; delete lives under Settings', async ({ page, context }) => {
    await context.request.post(`${env.baseUrl}/api/admin/login`, {
      data: { password: env.password },
    });
    const gallery = await createGallery(adminCtx, env.baseUrl, {
      title: 'Tabs Owner Gallery',
      type: 'client',
    });

    await page.goto(`/admin/galleries/${gallery.id}`);
    for (const label of ['Photos', 'Settings', 'Comments', 'Collaborators']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
    // Photos is the default.
    await expect(page.getByRole('tab', { name: 'Photos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // The delete control lives under the Settings tab.
    await page.goto(`/admin/galleries/${gallery.id}?tab=settings`);
    await expect(page.getByRole('button', { name: 'Delete gallery' })).toBeVisible();
  });

  test('collaborator sees only the Photos tab; owner-only controls absent', async ({
    browser,
  }) => {
    const gallery = await createGallery(adminCtx, env.baseUrl, {
      title: 'Tabs Collab Gallery',
      type: 'client',
    });
    const invite = await inviteCollaborator(
      adminCtx,
      env.baseUrl,
      gallery.id,
      'tabs-collab@example.com',
    );

    const collabContext = await browser.newContext();
    await addCollaboratorCookie(
      collabContext,
      env.baseUrl,
      env.dataDir,
      invite.collaboratorId,
    );
    const page = await collabContext.newPage();

    await page.goto(`/admin/galleries/${gallery.id}`);
    // Only the Photos tab exists for a collaborator.
    await expect(page.getByRole('tab', { name: 'Photos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Comments' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Collaborators' })).toHaveCount(0);

    // Crafting ?tab=settings falls back to Photos; owner-only controls never mount.
    await page.goto(`/admin/galleries/${gallery.id}?tab=settings`);
    await expect(page.getByRole('button', { name: 'Delete gallery' })).toHaveCount(0);

    await collabContext.close();
  });
});
