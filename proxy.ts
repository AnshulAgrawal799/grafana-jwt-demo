import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { storePostBody } from '@/lib/body-cache';

function isExcluded(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.includes('.');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const contentType = request.headers.get('content-type') ?? '';

  if (!isExcluded(pathname) && request.method === 'POST' && !contentType.includes('multipart/form-data')) {
    try {
      const body = await request.json();
      const docId = await storePostBody(body);
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-body-id', docId);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};