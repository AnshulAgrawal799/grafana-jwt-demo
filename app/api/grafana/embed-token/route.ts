import { decodeJwt, type JWTPayload } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

import { signGrafanaEmbedToken, type GrafanaEmbedUser } from '@/lib/grafana/embed-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EmbedTokenRequestBody {
  authToken?: unknown;
}

type AuthSource = 'webview';

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
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

function toSyntheticEmail(value: string): string {
  const safeValue = value.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
  return `${safeValue || 'webview-user'}@wow.local`;
}

function webviewJwtToEmbedUser(authToken: string): GrafanaEmbedUser {
  const payload = decodeJwt(authToken);
  const uid = pickJwtClaim(payload, 'sub', 'uid', 'userId', 'user_id', 'userCredential', 'mobile', 'phone');

  if (!uid) {
    throw new Error('WebView authentication token is missing a user identifier');
  }

  const email = pickJwtClaim(payload, 'email') || toSyntheticEmail(uid);
  return {
    uid,
    email,
    name: pickJwtClaim(payload, 'name', 'shadowName', 'displayName') || email,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmbedTokenRequestBody;

    let authSource: AuthSource | null = null;
    let embedUser: GrafanaEmbedUser | null = null;

    if (typeof body.authToken !== 'string' || body.authToken.length === 0) {
      return jsonError(401, 'unauthenticated', 'No active session');
    }

    try {
      authSource = 'webview';
      embedUser = webviewJwtToEmbedUser(body.authToken);
    } catch (error) {
      console.warn('[grafana/embed-token] webview JWT decode failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonError(401, 'unauthenticated', 'Invalid WebView authentication token');
    }

    const signedToken = await signGrafanaEmbedToken(embedUser);

    console.info('[grafana/embed-token] issued', {
      uid: embedUser.uid,
      authSource,
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