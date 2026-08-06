// Simple site-wide password gate that works on Vercel's free plan.
// If DASHBOARD_PASSWORD is set (as a Vercel env var), every page requires a
// login — the browser shows its built-in username/password popup. If the env
// var is not set, the site stays open (useful for local dev).
//
// Username: value of DASHBOARD_USER (defaults to "casinetto")
// Password: value of DASHBOARD_PASSWORD

import { NextResponse } from 'next/server';

export const config = {
  // gate everything except Next internals and the favicon
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export function middleware(req) {
  const PASS = process.env.DASHBOARD_PASSWORD;
  if (!PASS) return NextResponse.next(); // no password configured -> open

  const USER = process.env.DASHBOARD_USER || 'casinetto';
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Basic ')) {
    try {
      const [u, p] = atob(auth.slice(6)).split(':');
      if (u === USER && p === PASS) return NextResponse.next();
    } catch { /* fall through to 401 */ }
  }
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Casinetto Price Radar"' },
  });
}
