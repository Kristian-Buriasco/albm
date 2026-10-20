import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { adminLogin, createGallery, inviteCollaborator } from './helpers/api';
import { loadTestEnv } from './helpers/env';

// A collaborator invited to a second gallery already has a passkey: the invite page must send them to sign in.
test('re-invite of a collaborator with a passkey does not start a second registration', async ({ playwright }) => {
  const env = loadTestEnv();
  const admin = await playwright.request.newContext();
  await adminLogin(admin, env.baseUrl, env.password);
  const email = `reinvite-${Date.now()}@example.com`;
  const g1 = await createGallery(admin, env.baseUrl, { title: `Reinvite one ${Date.now()}`, type: 'client' });
  const g2 = await createGallery(admin, env.baseUrl, { title: `Reinvite two ${Date.now()}`, type: 'client' });
  const first = await inviteCollaborator(admin, env.baseUrl, g1.id, email);
  const tokenOf = (url: string) => url.split('/collab/')[1].split(/[?#]/)[0];

  const anon = await playwright.request.newContext();
  const opts = (t: string) => anon.post(`${env.baseUrl}/api/collab/register/options`, { data: { token: t } });
  expect((await opts(tokenOf(first.onboardingUrl))).status()).toBe(200);

  const db = new Database(path.join(env.dataDir, 'gallery.db'));
  db.prepare(
    `INSERT INTO admin_credentials (id, credential_id, public_key, counter, label, collaborator_id, created_at) VALUES (?, ?, ?, 0, 'test', ?, ?)`,
  ).run(`pk-${Date.now()}`, `cred-${Date.now()}`, Buffer.from('x'), first.collaboratorId, Date.now());
  db.close();

  const second = await inviteCollaborator(admin, env.baseUrl, g2.id, email);
  expect(second.collaboratorId).toBe(first.collaboratorId);
  const res = await opts(tokenOf(second.onboardingUrl));
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({ alreadyRegistered: true });
  await admin.dispose();
  await anon.dispose();
});
