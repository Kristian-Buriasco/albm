import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip static assets AND all API routes. Middleware only does page-level
  // work (admin-cookie bounce + x-pathname for public-page analytics); none of
  // it applies to /api. Critically, letting middleware buffer API bodies caps
  // uploads at Next's 10 MB middleware body limit, truncating larger photos —
  // so route handlers (which enforce their own 50 MB limit) must bypass it.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
