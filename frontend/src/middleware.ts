import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'access_token';

export function middleware(request: NextRequest) {
  const hasToken = request.cookies.has(ACCESS_TOKEN_COOKIE);

  if (!hasToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/topics/:path*'],
};
