# 🔐 Grafana JWT Demo — Local Setup Guide

Secure Grafana iframe embedding using short-lived JWT tokens.
Use this local Docker demo to validate the flow before changing your company's Grafana instance.

> This setup is for local validation only. Production needs real user authorization in the token service, HTTPS, secure cookie settings, secret management, and a Grafana configuration review.

---

## Prerequisites

- Docker Desktop installed and running
- Git Bash / PowerShell / WSL on Windows

---

## 📁 Project Structure

```text
grafana-jwt-demo/
├── .env.example               ← sample Docker Compose environment values
├── docker-compose.yml          ← spins up Grafana 11.5.2 + backend + frontend
├── backend/
│   ├── .env.example           ← sample backend values for manual npm runs
│   ├── server.js               ← Node.js JWT token server
│   ├── package.json
│   ├── package-lock.json
│   ├── scripts/
│   │   └── generate-keys.js    ← creates matching local JWT keys + JWKS
│   ├── private.pem             ← RSA private key (signs JWTs)  ⚠️ keep secret
│   ├── public.pem              ← RSA public key
│   └── jwks.json               ← JWKS format (mounted into Grafana)
├── frontend/
│   └── index.html              ← Demo UI with iframe + token refresh
└── grafana/
    ├── dashboards/             ← optional provisioned dashboard JSON files
    └── provisioning/
        ├── alerting/
        ├── dashboards/
        │   └── dashboards.yaml
        └── plugins/
```

---

## 🚀 Step 1 — Prepare Local Config

For the default local demo values, Docker Compose can run without a `.env` file. If you want to customize ports, domains, or admin credentials, copy the example first:

```bash
cp .env.example .env
```

The backend needs a private RSA key to sign JWTs. The private key is intentionally ignored by git, so generate a local key set before the first run if `backend/private.pem` is missing:

```bash
cd backend
npm install
npm run generate:keys
cd ..
```

This creates matching `backend/private.pem`, `backend/public.pem`, and `backend/jwks.json`. Commit the public files only if you intentionally want to share that generated public key; never commit `backend/private.pem`.

If you run the backend manually outside Docker, copy its env template too:

```bash
cp backend/.env.example backend/.env
```

---

## 🚀 Step 2 — Start Everything

```bash
# From the grafana-jwt-demo folder:
docker compose up -d

# Check all 3 containers are running:
docker compose ps
```

You should see:

- `grafana-jwt-demo`  → port 3000
- `jwt-backend`       → port 4000
- `jwt-frontend`      → port 8080

---

## 🎨 Step 3 — Create Your First Dashboard in Grafana

1. Open <http://localhost:3000>
2. Login: **admin / admin123**
3. Go to **Dashboards → New → New Dashboard**
4. Add a panel (try **Time series** with a test data source)
5. Save the dashboard — name it "My Demo Dashboard"
6. **Copy the Dashboard UID** from the URL:

    ```text
   http://localhost:3000/d/AbCdEfGhI/my-demo-dashboard
                              ↑ this is the UID
   ```

Example from the verified local test:

```text
Dashboard URL: http://localhost:3000/d/dflpv18qkxgxsc/new-dashboard?orgId=1
Dashboard UID: dflpv18qkxgxsc
Panel ID:      1
Solo URL:      http://localhost:3000/d-solo/dflpv18qkxgxsc/new-dashboard?orgId=1&panelId=1
```

---

## 🔗 Step 4 — Get the Solo Panel URL

1. Open your dashboard
2. Click the panel title → **Share**
3. Click **Embed** tab
4. Copy the `src` URL — it looks like:

    ```text
   http://localhost:3000/d-solo/AbCdEfGhI/my-demo-dashboard?orgId=1&panelId=1
   ```

---

## 🖥 Step 5 — Open the Demo Frontend

1. Open <http://localhost:8080>
2. Paste your solo panel URL into the **"Grafana Dashboard URL"** field
3. Enter your username and email
    - The local backend allows these demo email domains: `wheelocity.local`, `demo.local`, `test.com`
4. Click **"Generate Token & Load"**

✅ The dashboard loads inside the iframe — **authenticated via JWT URL login, no password needed**.

---

## 🔍 Step 6 — Verify JWT Authentication is Working

```bash
# 1. Get a raw token from the backend
curl "http://localhost:4000/token?user=alice&email=alice@demo.local&ttl=15"

# 2. Decode it (paste the token at jwt.io to inspect claims)

# 3. Try the Grafana URL manually with the token in a browser/profile that is not already logged into Grafana:
# http://localhost:3000/d-solo/UID/name?orgId=1&panelId=1&auth_token=<TOKEN>
```

Important verification tip: if you created the dashboard in the same browser, your existing admin Grafana cookie can make the iframe work even if JWT is misconfigured. For a clean check, log out of Grafana first or use an incognito/private window for the frontend.

Expected success signals:

- The iframe shows the panel content, not the Grafana login page.
- The frontend status changes to `Token Active` and shows an expiry countdown.
- Clicking `Refresh Token` updates the expiry and keeps the iframe loaded.
- Grafana logs show a JWT-created user, for example `uname=demo-viewer` or `uname=jwt-viewer`.

Verified locally on May 11, 2026:

- `docker compose ps` showed Grafana, backend, and frontend running.
- `http://localhost:4000/health` returned `{"status":"ok"}`.
- Direct JWT URL login loaded the solo panel after logging out of admin.
- The frontend loaded `Panel Title` / `A-series` inside the iframe.
- Manual token refresh worked and scheduled the next refresh.

---

## 🛡️ How JWT Auth Works Here

```text
Browser (localhost:8080)
    │
    ├── 1. Calls http://localhost:4000/token
    │         Backend signs JWT with private.pem (RS256)
    │         Token contains: user, email, exp (15 min)
    │
    └── 2. Sets iframe src with ?auth_token=eyJhb...
              │
              ▼
            Grafana (localhost:3000)
                Verifies JWT signature using jwks.json (public key)
                Creates/finds user in its DB
                Starts a Grafana session for the iframe
                Future iframe reloads need a fresh, unexpired JWT
```

---

## 🔄 Token Refresh

The frontend automatically refreshes the token **60 seconds before expiry** by reloading the iframe with a fresh `auth_token` URL.
You can also click **"Refresh Token"** manually at any time.

Note: JWT expiry controls whether the URL can be used to log in. After Grafana accepts a valid JWT, Grafana may also issue its own session cookie. This demo sets short local session lifetimes, but production should explicitly tune Grafana session duration to match your security requirements.

---

## ⚙️ Backend Controls

Docker Compose reads these values from `.env` when present, otherwise it uses the defaults in `docker-compose.yml`. The backend reads the same variables from the container environment, or from `backend/.env` when run manually:

| Variable | Local value | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `http://localhost:8080` | Only the demo frontend can call `/token` from a browser. |
| `AUTHORIZED_EMAIL_DOMAINS` | `wheelocity.local,demo.local,test.com` | Demo-only email domain allowlist before issuing a token. |
| `MAX_TOKEN_TTL_MINUTES` | `60` | Maximum accepted `ttl` query parameter. |
| `GRAFANA_URL` | `http://localhost:3000` | Browser-facing Grafana URL returned by the token API. |

The token endpoint rejects invalid identity input, unauthorized email domains, and TTL values outside `1..MAX_TOKEN_TTL_MINUTES`.

---

## 🧪 Test Edge Cases

```bash
# Test with expired token (modify exp claim manually)
# Test with unauthorized email domain
curl "http://localhost:4000/token?user=hacker&email=hacker@evil.com"
# → Fails in this demo because the backend checks AUTHORIZED_EMAIL_DOMAINS
# → In production: validate the current signed-in app user before issuing any token

# View backend logs
docker compose logs backend -f

# View Grafana logs (auth debug)
docker compose logs grafana -f | grep -i jwt
```

On Windows PowerShell, use `Select-String` instead of `grep`:

```powershell
docker compose logs grafana -f | Select-String -Pattern "jwt|auth|demo-viewer|jwt-viewer"
```

If the iframe shows a Grafana login page, check these first:

- The URL pasted into the frontend must be a `d-solo/...` URL and must include the real dashboard UID.
- The URL must include the correct `panelId`.
- The email must use an allowed demo domain.
- The browser should not be relying on an existing admin session while you verify JWT.
- `backend/jwks.json` must match `backend/private.pem`; restart Grafana after changing keys.

---

## 🛑 Stop Everything

```bash
docker compose down          # stop containers
docker compose down -v       # stop + delete Grafana data
```

---

## 🔑 Key Files to Protect

| File | Secret? | Notes |
| --- | --- | --- |
| `backend/private.pem` | ✅ YES | Never commit to git. Signs all JWTs. |
| `backend/jwks.json` | ❌ No | Public key — safe to share. Grafana needs this. |
| `backend/public.pem` | ❌ No | Public key in PEM format. |

This repo includes `.gitignore` entries for the private key, local `.env` files, dependency folders, logs, and local Docker/Grafana runtime state. The `.env.example` files are safe to commit.
If this demo is shared through a tar/zip file, the sample private key can be included for convenience. Do not commit or reuse it in a real environment.

---

## 📦 Next Steps (Production)

- [ ] Replace the demo email-domain check with your real authorization logic
- [ ] Set `auto_sign_up=false` unless Grafana user creation is intentionally controlled
- [ ] Move `private.pem` to a secrets manager (AWS Secrets Manager, Vault, etc.)
- [ ] Use HTTPS (token in URL must be encrypted in transit)
- [ ] Add short TTLs (5–10 minutes) + silent refresh
- [ ] Use `GF_SECURITY_COOKIE_SAMESITE=none` and `GF_SECURITY_COOKIE_SECURE=true` only when embedding across sites over HTTPS
- [ ] Tune Grafana session lifetime settings; JWT expiry alone is not the full session lifetime
- [ ] Log token issuance for audit trail
