/**
 * Client-side helper that takes a pre-built Grafana embed URL and appends the
 * short-lived `auth_token` query parameter that Grafana requires for JWT-based
 * embed auth.
 *
 * The token is minted by `/api/grafana/embed-token` and cached in-memory per
 * distinct WebView JWT so loading multiple panels does not trigger one network
 * round-trip per panel. Refresh happens silently before expiry.
 */

const REFRESH_LEEWAY_MS = 60_000;

export interface AttachGrafanaAuthTokenOptions {
  /** User-App-minted JWT from the Wow App WebView POST body. */
  webviewJwt?: string | null;
}

interface EmbedTokenResponse {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const inflight = new Map<string, Promise<CachedToken>>();
const cache = new Map<string, CachedToken>();

function cacheKey(webviewJwt: string | null | undefined): string {
  if (!webviewJwt) return 'webview:__missing';
  return `webview:${webviewJwt}`;
}

async function fetchEmbedToken(webviewJwt: string | null | undefined): Promise<CachedToken> {
  const body: Record<string, string> = {};
  if (webviewJwt) {
    body.authToken = webviewJwt;
  }

  const response = await fetch('/api/grafana/embed-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message =
      (errorPayload as { message?: string }).message ||
      (errorPayload as { error?: string }).error ||
      `Failed to load Grafana embed token (${response.status})`;
    throw new Error(message);
  }

  const data = (await response.json()) as EmbedTokenResponse;
  if (!data?.token || !data?.expiresAt) {
    throw new Error('Malformed Grafana embed token response');
  }

  return {
    token: data.token,
    expiresAtMs: new Date(data.expiresAt).getTime(),
  };
}

async function getCachedToken(options: AttachGrafanaAuthTokenOptions): Promise<CachedToken> {
  const webviewJwt = options.webviewJwt ?? null;
  const key = cacheKey(webviewJwt);
  const existing = cache.get(key);
  if (existing && existing.expiresAtMs - Date.now() > REFRESH_LEEWAY_MS) {
    return existing;
  }

  const inflightPromise = inflight.get(key);
  if (inflightPromise) {
    return inflightPromise;
  }

  const promise = (async () => {
    try {
      const fresh = await fetchEmbedToken(webviewJwt);
      cache.set(key, fresh);
      return fresh;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export async function attachGrafanaAuthToken(
  url: string,
  options: AttachGrafanaAuthTokenOptions = {},
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('attachGrafanaAuthToken must be called in the browser.');
  }

  const { token } = await getCachedToken(options);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}auth_token=${encodeURIComponent(token)}`;
}

/** Clear cached Grafana embed tokens. Call on token refresh, logout, and tests. */
export function clearGrafanaAuthTokenCache(): void {
  cache.clear();
  inflight.clear();
}