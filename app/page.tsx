'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { attachGrafanaAuthToken, clearGrafanaAuthTokenCache } from '@/lib/grafana/attachGrafanaAuthToken';

type Status = 'idle' | 'loading' | 'active' | 'error';

const DEFAULT_GRAFANA_URL = 'http://localhost:3000/d-solo/YOUR_DASHBOARD_UID/my-demo-dashboard?orgId=1&panelId=1';

function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(unescape(encodeURIComponent(json))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildDemoAppJwt(user: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return `${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url({
    iss: 'wow-user-app-demo',
    sub: user,
    login: email,
    email,
    name: email,
    iat: now,
    exp: now + 3600,
  })}.`;
}

function readJwtExp(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(decodeURIComponent(escape(atob(normalized)))) as { exp?: number };
    return decoded.exp ? new Date(decoded.exp * 1000).toLocaleTimeString() : null;
  } catch {
    return null;
  }
}

function extractAuthToken(url: string): string | null {
  try {
    return new URL(url).searchParams.get('auth_token');
  } catch {
    return null;
  }
}

export default function Home() {
  const auth = useAuth();
  const [user, setUser] = useState('demo-viewer');
  const [email, setEmail] = useState('demo@wheelocity.local');
  const [dashboardUrl, setDashboardUrl] = useState(DEFAULT_GRAFANA_URL);
  const [iframeSrc, setIframeSrc] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('Waiting for a WebView-style token request.');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['[system] Next.js demo loaded.']);

  const postBodyJwt = auth.jwtToken;
  const activeIdentity = useMemo(() => {
    if (postBodyJwt) return 'POST body WebView JWT';
    return `${user} (${email})`;
  }, [email, postBodyJwt, user]);

  function addLog(line: string) {
    setLogs((current) => [...current.slice(-7), `[${new Date().toLocaleTimeString()}] ${line}`]);
  }

  async function loadDashboard(refresh = false) {
    if (!dashboardUrl.trim()) {
      setStatus('error');
      setMessage('Grafana dashboard URL is required.');
      return;
    }

    try {
      new URL(dashboardUrl);
    } catch {
      setStatus('error');
      setMessage('Grafana dashboard URL must be an absolute URL.');
      return;
    }

    setStatus('loading');
    setMessage(refresh ? 'Refreshing Grafana JWT.' : 'Requesting Grafana JWT from the Next API route.');
    if (refresh) clearGrafanaAuthTokenCache();

    const webviewJwt = postBodyJwt || buildDemoAppJwt(user.trim(), email.trim());
    addLog('Calling /api/grafana/embed-token through attachGrafanaAuthToken.');

    try {
      const nextIframeSrc = await attachGrafanaAuthToken(dashboardUrl.trim(), {
        webviewJwt,
      });
      const token = extractAuthToken(nextIframeSrc);
      setIframeSrc(nextIframeSrc);
      setExpiresAt(token ? readJwtExp(token) : null);
      setStatus('active');
      setMessage('Grafana iframe URL contains a freshly signed auth_token.');
      addLog('Grafana token issued and iframe URL updated.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to load Grafana token.');
      addLog(error instanceof Error ? error.message : 'Token request failed.');
    }
  }

  useEffect(() => {
    if (postBodyJwt) {
      addLog('Detected __context.user.jwt from cached WebView POST body.');
    }
  }, [postBodyJwt]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Next.js broker demo</p>
          <h1>Grafana JWT Embed</h1>
          <p className="summary">Mirrors the wow-web path: WebView JWT in, signed Grafana JWT out.</p>
        </div>

        <label>
          User
          <input value={user} onChange={(event) => setUser(event.target.value)} disabled={Boolean(postBodyJwt)} />
        </label>

        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(postBodyJwt)} />
        </label>

        <label>
          Grafana solo panel URL
          <input className="urlInput" value={dashboardUrl} onChange={(event) => setDashboardUrl(event.target.value)} />
        </label>

        <button onClick={() => loadDashboard(false)} disabled={status === 'loading'}>
          Generate token and load
        </button>
        <button className="secondary" onClick={() => loadDashboard(true)} disabled={!iframeSrc || status === 'loading'}>
          Refresh token
        </button>

        <section className={`status ${status}`}>
          <div className="statusTop">
            <span />
            <strong>{status === 'idle' ? 'No token yet' : status === 'active' ? 'Token active' : status}</strong>
          </div>
          <p>{message}</p>
          {expiresAt ? <small>Expires at {expiresAt}</small> : null}
        </section>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <div>
            <span>Identity</span>
            <strong>{activeIdentity}</strong>
          </div>
          <div>
            <span>Broker</span>
            <strong>/api/grafana/embed-token</strong>
          </div>
          <div>
            <span>Auth source</span>
            <strong>{postBodyJwt ? 'WebView POST body' : 'Unsigned demo JWT'}</strong>
          </div>
        </header>

        <div className="frameWrap">
          {iframeSrc ? (
            <iframe src={iframeSrc} title="Grafana dashboard" />
          ) : (
            <div className="emptyState">
              <h2>No dashboard loaded</h2>
              <p>Create a Grafana solo panel URL, then load it through the Next.js token broker.</p>
            </div>
          )}
        </div>

        <div className="logPanel">
          {logs.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      </section>
    </main>
  );
}