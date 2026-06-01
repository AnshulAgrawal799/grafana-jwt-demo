const REFRESH_LEEWAY_MS = 60_000;

export interface AttachGrafanaAuthTokenOptions {
  webviewJwt?: string | null;
  ttlSeconds?: number;
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

function cacheKey(webviewJwt: string | null | undefined, ttlSeconds: number | undefined): string {
  if (!webviewJwt) return `admin:__session:${ttlSeconds ?? 'default'}`;
  return `webview:${webviewJwt}:${ttlSeconds ?? 'default'}`;
}

async function fetchEmbedToken(options: AttachGrafanaAuthTokenOptions): Promise<CachedToken> {
  const body: Record<string, string | number> = {};
  if (options.webviewJwt) {
    body.authToken = options.webviewJwt;
  }
  if (options.ttlSeconds) {
    body.ttlSeconds = options.ttlSeconds;
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
  const key = cacheKey(options.webviewJwt, options.ttlSeconds);
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
      const fresh = await fetchEmbedToken(options);
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

export function clearGrafanaAuthTokenCache(): void {
  cache.clear();
  inflight.clear();
}