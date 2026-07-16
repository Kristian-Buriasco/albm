import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionSecret } from './env';
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
  if (!session.isAdmin || !session.sessionId) return null;
  const row = touchAdminSession(session.sessionId);
  if (!row) return null;
  return row.collaboratorId
    ? { role: 'collaborator', collaboratorId: row.collaboratorId }
    : { role: 'owner' };
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
  const sessionId = createAdminSession({ ...meta, collaboratorId });
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

export async function hasGalleryAccess(galleryId: string): Promise<boolean> {
  const session = await getGalleryAccessSession();
  return (session.unlocked ?? []).includes(galleryId);
}

export async function getVisitorSession(
  galleryId: string,
): Promise<IronSession<VisitorSessionData>> {
  return getIronSession<VisitorSessionData>(
    await cookies(),
    options(`visitor_${galleryId}`, 365 * 24 * 60 * 60),
  );
}
