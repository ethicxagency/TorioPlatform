import { NextResponse, type NextRequest } from 'next/server';

/** Non-secret routing hint set by the web app once a customer has signed in (never proof of identity: the API checks the session). */
export const AUTH_HINT_COOKIE = 'torio_authed';

/**
 * One address, two audiences. `/` is the signed-in dashboard, but visitors and search engines have to get the public
 * marketing page there, rendered on the server. A request with the routing hint cookie gets the dashboard; anything
 * else is rewritten (the URL stays `/`) to the landing page. A signed-in customer whose cookie is missing is bounced
 * to the dashboard by the landing page itself once the session is confirmed. `/welcome` is the landing page's internal
 * path, so it redirects to `/` to avoid a duplicate address.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/welcome') return NextResponse.redirect(new URL('/', req.url), 308);
  if (pathname === '/' && !req.cookies.has(AUTH_HINT_COOKIE)) {
    const res = NextResponse.rewrite(new URL('/welcome', req.url));
    // Different pages from the same URL: caches must not mix them up.
    res.headers.set('Vary', 'Cookie');
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/welcome'] };
