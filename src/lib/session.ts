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

export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.sessionId) return false;
  if (!touchAdminSession(session.sessionId)) return false;
  try {
    await session.save();
  } catch {
    /* read-only rendering context */
  }
  return true;
}

export async function getAdminSessionId(): Promise<string | null> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.sessionId) return null;
  if (!touchAdminSession(session.sessionId)) return null;
  return session.sessionId;
}

export async function issueAdminSession(meta: {
  userAgent?: string | null;
  ip?: string | null;
} = {}): Promise<void> {
  const session = await getAdminSession();
  const sessionId = createAdminSession(meta);
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
