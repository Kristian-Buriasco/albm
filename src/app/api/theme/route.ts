import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ONE_YEAR = 365 * 24 * 60 * 60;

/**
 * Persist the visitor's light/dark choice in a long-lived, server-set cookie.
 *
 * Safari purges script-writable storage (localStorage, document.cookie) after ~7 days
 * without interaction and refuses it outright in some privacy modes — so a toggle that
 * only writes there appears to "forget" dark mode. A cookie set by an HTTP response is
 * exempt from that cap, and lets the server render the right theme with no flash.
 * It is a user-requested display preference, not tracking.
 */
export async function POST(req: Request) {
  let theme: unknown;
  try {
    ({ theme } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (theme !== 'dark' && theme !== 'light') {
    return NextResponse.json({ error: 'theme must be "dark" or "light"' }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, theme });
  res.cookies.set('theme', theme, {
    maxAge: ONE_YEAR,
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // the pre-paint script in <head> reads it
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0',
  });
  return res;
}
