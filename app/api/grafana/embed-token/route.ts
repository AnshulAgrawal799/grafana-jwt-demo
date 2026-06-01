import { decodeJwt, type JWTPayload } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

import { signGrafanaEmbedToken, type GrafanaEmbedUser } from '@/lib/grafana/embed-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EmbedTokenRequestBody {
  authToken?: unknown;
  ttlSeconds?: unknown;
}

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function allowedDomains(): string[] {
  return (process.env.AUTHORIZED_EMAIL_DOMAINS || 'wheelocity.local,demo.local,test.com')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function pickJwtClaim(payload: JWTPayload, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function validateIdentity(uid: string, email: string) {
  if (!/^[A-Za-z0-9._@-]{1,64}$/.test(uid)) {
    throw new Error('authToken user identifier contains unsupported characters');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('authToken must include a valid email or login claim');
  }

  const domain = email.split('@').pop()?.toLowerCase();
  const authorizedDomains = allowedDomains();
  if (authorizedDomains.length > 0 && (!domain || !authorizedDomains.includes(domain))) {
    throw new Error(`email domain is not authorized for this demo. Allowed domains: ${authorizedDomains.join(', ')}`);
  }
}

function webviewJwtToEmbedUser(authToken: string): GrafanaEmbedUser {
  const payload = decodeJwt(authToken);
  const email = pickJwtClaim(payload, 'email', 'login');
  const uid = pickJwtClaim(payload, 'sub', 'uid', 'userId', 'user_id', 'userCredential', 'mobile', 'phone') || email;

  if (!uid || !email) {
    throw new Error('WebView authentication token is missing user identity claims');
  }

  validateIdentity(uid, email);

  return {
    uid,
    email,
    name: pickJwtClaim(payload, 'name', 'shadowName', 'displayName') || email,
  };
}

function parseTtlSeconds(rawTtlSeconds: unknown): number | undefined {
  if (rawTtlSeconds === undefined || rawTtlSeconds === null || rawTtlSeconds === '') return undefined;
  const ttlSeconds = Number(rawTtlSeconds);
  if (!Number.isInteger(ttlSeconds)) {
    throw new Error('ttlSeconds must be a whole number');
  }
  return ttlSeconds;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmbedTokenRequestBody;

    if (typeof body.authToken !== 'string' || body.authToken.length === 0) {
      return jsonError(401, 'unauthenticated', 'authToken is required');
    }

    let embedUser: GrafanaEmbedUser;
    try {
      embedUser = webviewJwtToEmbedUser(body.authToken);
    } catch (error) {
      console.warn('[grafana/embed-token] webview JWT decode failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonError(401, 'unauthenticated', error instanceof Error ? error.message : 'Invalid WebView authentication token');
    }

    const signedToken = await signGrafanaEmbedToken(embedUser, parseTtlSeconds(body.ttlSeconds));

    console.info('[grafana/embed-token] issued', {
      uid: embedUser.uid,
      authSource: 'webview',
      kid: signedToken.kid,
      exp: Math.floor(signedToken.expiresAt.getTime() / 1000),
    });

    return NextResponse.json(
      {
        token: signedToken.token,
        expiresAt: signedToken.expiresAt.toISOString(),
        ttlSeconds: signedToken.ttlSeconds,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[grafana/embed-token] failed', error);
    return jsonError(500, 'internal_error', 'Failed to create Grafana embed token');
  }
}