import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/ride', '/history', '/drive'] as const;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = request.cookies.get('dtp_session');
  if (!session?.value) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/ride/:path*', '/history/:path*', '/drive/:path*'],
};
