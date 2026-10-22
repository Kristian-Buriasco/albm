import crypto from 'node:crypto';
import { asc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { gateMessage } from '@/lib/api-gate';
import { constantTimeEqual, generateBearerToken, hashToken } from '@/lib/token-hash';

export type ApiTokenRow = typeof schema.apiTokens.$inferSelect;
export type ApiScope = ApiTokenRow['scope'];

/** Tokens start with this so they are recognisable in logs and secret scanners. */
export const API_TOKEN_PREFIX = 'albm_';

export function listApiTokens(): ApiTokenRow[] {
  return getDb().select().from(schema.apiTokens).orderBy(asc(schema.apiTokens.createdAt)).all();
}

/** Create token; returns the raw token once (never stored). */
export function createApiToken(name: string, scope: ApiScope): { row: ApiTokenRow; rawToken: string } {
  const rawToken = API_TOKEN_PREFIX + generateBearerToken();
  const id = nanoid();
  getDb()
    .insert(schema.apiTokens)
    .values({ id, name: name.trim().slice(0, 120), scope, tokenHash: hashToken(rawToken) })
    .run();
  const row = getDb().select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).get()!;
  return { row, rawToken };
}

export function revokeApiToken(id: string): boolean {
  const db = getDb();
  const row = db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).get();
  if (!row || row.revokedAt) return false;
  db.update(schema.apiTokens).set({ revokedAt: Date.now() }).where(eq(schema.apiTokens.id, id)).run();
  return true;
}

/** Resolve an active token by bearer value; updates lastUsedAt on success. */
export function verifyApiToken(bearer: string): ApiTokenRow | null {
  if (!bearer.startsWith(API_TOKEN_PREFIX)) return null;
  const hash = hashToken(bearer);
  const db = getDb();
  for (const row of db.select().from(schema.apiTokens).where(isNull(schema.apiTokens.revokedAt)).all()) {
    if (constantTimeEqual(row.tokenHash, hash)) {
      db.update(schema.apiTokens).set({ lastUsedAt: Date.now() }).where(eq(schema.apiTokens.id, row.id)).run();
      return row;
    }
  }
  return null;
}

/**
 * Admin routes a token may reach. Anything not listed (settings, security, passkeys, sessions, tokens, storage
 * settings, updater, maintenance, audit) is session-only, so a leaked token cannot take over the instance.
 * New admin routes are therefore closed to tokens until added here.
 */
const TOKEN_ROUTES = ['galleries', 'photos', 'tags', 'folders', 'clients', 'testimonials', 'inquiries', 'comments', 'version', 'storage'];

/** Multipart uploads are big; they go through /api/publish with the same token (middleware would cap the body). */
const UPLOAD_PATH = /^\/api\/admin\/galleries\/[^/]+\/photos\/?$/;

/** Whether `scope` may call `method path`. Deletes are never allowed with a token. */
export function tokenMayCall(scope: ApiScope, method: string, path: string): boolean {
  const m = /^\/api\/admin\/([^/]+)/.exec(path);
  if (!m || !TOKEN_ROUTES.includes(m[1])) return false;
  if (path.startsWith('/api/admin/storage/') ) return false; // /storage/settings and /storage/test hold credentials
  if (method === 'GET' || method === 'HEAD') return true;
  if (scope !== 'write' || method === 'DELETE') return false;
  return !(method === 'POST' && UPLOAD_PATH.test(path));
}

/** The middleware signs "method path" for token requests (SESSION_SECRET HMAC), so route code can trust them. */
export function verifyGate(method: string, path: string, sig: string): boolean {
  const want = crypto.createHmac('sha256', process.env.SESSION_SECRET ?? '').update(gateMessage(method, path)).digest('hex');
  return constantTimeEqual(want, sig);
}
