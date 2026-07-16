import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionSecret } from './env';

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
  if (!session.isAdmin) return false;
  // Rolling session: refresh the cookie's expiry on activity. Cookie writes
  // are only allowed in route handlers / server actions; during server
  // component rendering this throws, so skip the refresh there.
  try {
    await session.save();
  } catch {
    /* read-only rendering context */
  }
  return true;
}

export async function issueAdminSession(): Promise<void> {
  const session = await getAdminSession();
  session.isAdmin = true;
  await session.save();
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
