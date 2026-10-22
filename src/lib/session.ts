import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { sessionSecret } from './env';
import { tokenMayCall, verifyApiToken, verifyGate } from './api-tokens';
import { logAdmin } from './audit-log';
import {
  createAdminSession,
  revokeAdminSession,
  touchAdminSession,
} from './admin-sessions';

const WEEK_SECONDS = 7 * 24 * 60 * 60;

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // TLS is terminated upstream in production; allow COOKIE_SECURE=0 for local E2E over http.
  secure:
    process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0',
  path: '/',
};

export interface AdminSessionData {
  isAdmin?: boolean;
  /** Server-side admin session id (admin_sessions table). */
  sessionId?: string;
}

/** Who is acting in the admin surface. Owner = the site owner (full trust). */
export type Principal =
  | { role: 'owner' }
  | { role: 'collaborator'; collaboratorId: string };

export interface GalleryAccessData {
  /** Gallery IDs this browser has unlocked with a password. */
  unlocked?: string[];
}

export interface VisitorSessionData {
  token?: string;
}

function options(cookieName: string, ttl: number): SessionOptions {
  return {
    cookieName,
    password: sessionSecret(),
    ttl,
    cookieOptions: { ...baseCookieOptions, maxAge: ttl },
  };
}

export async function getAdminSession(): Promise<IronSession<AdminSessionData>> {
  return getIronSession<AdminSessionData>(
    await cookies(),
    options('admin_session', WEEK_SECONDS),
  );
}

/**
 * Resolve the acting principal from the session, validated against the
 * authoritative admin_sessions row (collaboratorId null = owner). Returns null
 * when there is no valid session.
 */
export async function getPrincipal(): Promise<Principal | null> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.sessionId) return tokenPrincipal();
  const row = touchAdminSession(session.sessionId);
  if (!row) return null;
  return row.collaboratorId
    ? { role: 'collaborator', collaboratorId: row.collaboratorId }
    : { role: 'owner' };
}

/**
 * An API token (Authorization: Bearer albm_...) acts as the owner, but only for the method and path the
 * middleware signed and only where its scope allows (see tokenMayCall). Writes are audit-logged by token name.
 */
const tokenWriteLog = new Map<string, number>();

async function tokenPrincipal(): Promise<Principal | null> {
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  const method = h.get('x-albm-method') ?? '';
  const path = h.get('x-albm-path') ?? '';
  if (!auth.startsWith('Bearer albm_') || !verifyGate(method, path, h.get('x-albm-gate') ?? '')) return null;
  const token = verifyApiToken(auth.slice(7).trim());
  if (!token || !tokenMayCall(token.scope, method, path)) return null;
  // A request calls this several times (route guard, grant checks); log each write once.
  const key = `${token.id}|${method}|${path}`;
  const last = tokenWriteLog.get(key) ?? 0;
  if (method !== 'GET' && method !== 'HEAD' && Date.now() - last > 2000) {
    tokenWriteLog.set(key, Date.now());
    if (tokenWriteLog.size > 500) tokenWriteLog.clear();
    logAdmin('api_token.write', { targetType: 'api_token', targetId: token.id, summary: `${token.name}: ${method} ${path}` });
  }
  return { role: 'owner' };
}

/** True only for the OWNER. Collaborators are never "admin". */
export async function isAdmin(): Promise<boolean> {
  return (await getPrincipal())?.role === 'owner';
}

export async function getAdminSessionId(): Promise<string | null> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.sessionId) return null;
  if (!touchAdminSession(session.sessionId)) return null;
  return session.sessionId;
}

export async function issueAdminSession(
  meta: {
    userAgent?: string | null;
    ip?: string | null;
  } = {},
  principal: Principal = { role: 'owner' },
): Promise<void> {
  const session = await getAdminSession();
  const collaboratorId =
    principal.role === 'collaborator' ? principal.collaboratorId : null;
  const { deviceLabel, lookupGeo } = await import('./geo');
  const device = deviceLabel(meta.userAgent);
  const location = (await lookupGeo(meta.ip)).label;
  const sessionId = createAdminSession({ ...meta, device, location, collaboratorId });
  session.isAdmin = true;
  session.sessionId = sessionId;
  await session.save();
}

export async function revokeCurrentAdminSession(): Promise<void> {
  const session = await getAdminSession();
  if (session.sessionId) revokeAdminSession(session.sessionId);
  session.destroy();
}

export async function getGalleryAccessSession(): Promise<
  IronSession<GalleryAccessData>
> {
  return getIronSession<GalleryAccessData>(
    await cookies(),
    options('gallery_access', 30 * 24 * 60 * 60),
  );
}

/**
 * Fingerprint of a gallery's current credentials. Stored in the unlock cookie
 * so changing/removing the password or PIN invalidates existing unlocks.
 */
export function galleryAccessToken(gallery: {
  id: string;
  passwordHash: string | null;
  pinHash: string | null;
  pinEnabled: boolean;
}): string {
  const fp = crypto
    .createHash('sha256')
    .update(`${gallery.passwordHash ?? ''}|${gallery.pinEnabled ? (gallery.pinHash ?? '') : ''}`)
    .digest('hex')
    .slice(0, 16);
  return `${gallery.id}.${fp}`;
}

export async function hasGalleryAccess(galleryId: string): Promise<boolean> {
  const session = await getGalleryAccessSession();
  const unlocked = session.unlocked ?? [];
  if (unlocked.length === 0) return false;
  const gallery = getDb()
    .select({
      id: schema.galleries.id,
      passwordHash: schema.galleries.passwordHash,
      pinHash: schema.galleries.pinHash,
      pinEnabled: schema.galleries.pinEnabled,
    })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return false;
  return unlocked.includes(galleryAccessToken(gallery));
}

export async function getVisitorSession(
  galleryId: string,
): Promise<IronSession<VisitorSessionData>> {
  return getIronSession<VisitorSessionData>(
    await cookies(),
    options(`visitor_${galleryId}`, 365 * 24 * 60 * 60),
  );
}
