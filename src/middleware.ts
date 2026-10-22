import { NextRequest, NextResponse } from 'next/server';
import { gateMessage } from '@/lib/api-gate';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sign(method: string, path: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.SESSION_SECRET ?? ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(gateMessage(method, path))));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);

  // API-token requests to the admin API (see matcher): attach a signed method+path for scope checks.
  if (pathname.startsWith('/api/')) {
    headers.set('x-albm-method', req.method);
    headers.set('x-albm-path', pathname);
    headers.set('x-albm-gate', await sign(req.method, pathname));
    return NextResponse.next({ request: { headers } });
  }

  // Defense in depth for /admin pages: bounce requests that don't even carry
  // an admin session cookie. Full validation happens per-page via isAdmin().
  if (
    pathname.startsWith('/admin') &&
    pathname !== '/admin/login' &&
    !req.cookies.has('admin_session')
  ) {
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }

  // Expose the pathname to server components (root layout uses it to inject
  // the analytics snippet on public pages only).
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages: everything except static assets and API routes. Letting middleware buffer API bodies caps uploads at
  // Next's 10 MB middleware body limit, so route handlers (50 MB) must bypass it, with one exception: admin API
  // calls that carry a Bearer API token. Those are JSON, and the photo upload route refuses tokens.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    { source: '/api/admin/:path*', has: [{ type: 'header', key: 'authorization', value: 'Bearer albm_.*' }] },
  ],
};
