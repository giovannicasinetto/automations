import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export function middleware(req) {
  const PASS = process.env.DASHBOARD_PASSWORD;
  if (!PASS) return NextResponse.next();

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
