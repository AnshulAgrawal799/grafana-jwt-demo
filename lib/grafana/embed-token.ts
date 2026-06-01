import fs from 'fs';
import path from 'path';

import { importPKCS8, SignJWT } from 'jose';

export interface GrafanaEmbedUser {
  uid: string;
  email: string;
  name?: string;
}

export interface SignedGrafanaEmbedToken {
  token: string;
  expiresAt: Date;
  ttlSeconds: number;
  kid: string;
}

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = Number(process.env.MAX_TOKEN_TTL_MINUTES ?? 60) * 60;
const DEFAULT_TTL_SECONDS = 900;

let privateKeyPromise: ReturnType<typeof importPKCS8> | undefined;

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function getPrivateKeyPem(): string {
  const envKey = process.env.GRAFANA_JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (envKey) return envKey;

  const localKeyPath = path.join(process.cwd(), 'backend', 'private.pem');
  if (fs.existsSync(localKeyPath)) {
    return fs.readFileSync(localKeyPath, 'utf8');
  }

  throw new Error('Missing GRAFANA_JWT_PRIVATE_KEY env var or backend/private.pem file');
}

export function clampTtlSeconds(ttlSeconds?: number): number {
  const defaultTtl = Number(process.env.GRAFANA_JWT_DEFAULT_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  const ttl = Number.isFinite(ttlSeconds)
    ? Number(ttlSeconds)
    : Number.isFinite(defaultTtl)
      ? defaultTtl
      : DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttl)));
}

function getPrivateKey(): ReturnType<typeof importPKCS8> {
  privateKeyPromise ??= importPKCS8(getPrivateKeyPem(), 'RS256');
  return privateKeyPromise;
}

export async function signGrafanaEmbedToken(
  user: GrafanaEmbedUser,
  ttlSeconds?: number,
): Promise<SignedGrafanaEmbedToken> {
  const issuer = requiredEnv('GRAFANA_JWT_ISSUER', 'wow-web');
  const audience = requiredEnv('GRAFANA_JWT_AUDIENCE', 'grafana-insights');
  const kid = requiredEnv('GRAFANA_JWT_KEY_ID', 'wow-web-prod-20260531124246');
  const role = process.env.GRAFANA_JWT_ROLE || 'Viewer';
  const ttl = clampTtlSeconds(ttlSeconds);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ttl;

  const token = await new SignJWT({
    login: user.email,
    email: user.email,
    name: user.name || user.email,
    role,
  })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(user.uid)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(exp)
    .sign(await getPrivateKey());

  return {
    token,
    expiresAt: new Date(exp * 1000),
    ttlSeconds: ttl,
    kid,
  };
}