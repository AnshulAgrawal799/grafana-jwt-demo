# Grafana JWT Demo - Local Setup Guide

Secure Grafana iframe embedding using short-lived JWT tokens.
Use this local Docker demo to validate the flow before changing your company's Grafana instance.

This demo is aligned with the wow-web live CP tracking embed contract:

- Algorithm: `RS256`
- Key ID / `kid`: `wow-web-prod-20260531124246`
- Issuer: `wow-web`
- Audience: `grafana-insights`
- Role claim: `Viewer`
- Token location: Grafana iframe URL query parameter named `auth_token`
- Browser flow: frontend sends a WebView-style app JWT to `/api/grafana/embed-token`, the broker decodes identity without signature verification for this demo, then signs a Grafana JWT.

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
│   │   ├── generate-keys.js    ← creates matching local JWT keys + public key material
│   │   └── validate-token-contract.js ← checks kid/issuer/audience/role
│   ├── private.pem             ← RSA private key (signs JWTs)  ⚠️ keep secret
│   ├── public.pem              ← RSA public key mounted into Grafana
│   └── jwks.json               ← optional JWKS format for alternate Grafana setups
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

This creates matching `backend/private.pem`, `backend/public.pem`, and `backend/jwks.json`. The main demo mounts `backend/public.pem` into Grafana, matching the production request to trust a PEM public key. `backend/jwks.json` is optional public-key material for environments that prefer JWKS; the wow-web refactor does not require Next.js to verify the incoming WebView app JWT with JWKS.

The generated Grafana JWT defaults to `kid=wow-web-prod-20260531124246` so the token header matches the production request shape. You can override it with `GRAFANA_JWT_KEY_ID` before running the generator.

Before presenting the demo, run the contract check:

```bash
cd backend
npm run validate:contract
cd ..
```

Expected result: JSON with `valid: true`, `alg: RS256`, `kid: wow-web-prod-20260531124246`, `iss: wow-web`, `aud: grafana-insights`, `role: Viewer`, and `publicKey.file: backend/public.pem`.

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
    - The frontend encodes these demo values into an unsigned WebView-style `authToken`; the broker does not receive `user`, `email`, or `name` as separate identity fields.
4. Click **"Generate Token & Load"**

The dashboard loads inside the iframe, authenticated via JWT URL login with no Grafana password prompt.

---

## 🔍 Step 6 — Verify JWT Authentication is Working

```bash
# 1. Check the local signing/public-key contract
cd backend && npm run validate:contract && cd ..

# 2. Confirm browser POST preflight is allowed for the app-style broker endpoint
curl -i -X OPTIONS "http://localhost:4000/api/grafana/embed-token" \
    -H "Origin: http://localhost:8080" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type, authorization"

Expected result: `204 No Content` with `Access-Control-Allow-Origin: http://localhost:8080`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and `Access-Control-Allow-Headers: Content-Type, Authorization`.

# 3. Get a raw Grafana token from the app-style broker endpoint
# The authToken below is an unsigned demo app/WebView JWT whose payload is:
# {"sub":"alice","email":"alice@demo.local","name":"Alice Demo"}
curl -X POST "http://localhost:4000/api/grafana/embed-token" \
    -H "Content-Type: application/json" \
    -d '{"authToken":"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhbGljZSIsImVtYWlsIjoiYWxpY2VAZGVtby5sb2NhbCIsIm5hbWUiOiJBbGljZSBEZW1vIn0.","ttlSeconds":900}'

# 4. Decode it (paste the token at jwt.io to inspect claims)
# Expected identity claims in the returned Grafana JWT:
# sub=alice, login=alice@demo.local, email=alice@demo.local, name=Alice Demo

# 5. Try the Grafana URL manually with the token in a browser/profile that is not already logged into Grafana:
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
    ├── 1. Calls http://localhost:4000/api/grafana/embed-token
    │         Request includes a WebView-style app JWT in the body
    │         Backend decodes identity from that app JWT for this demo
    │         Backend signs a Grafana JWT with private.pem (RS256)
    │         Token contains: iss, aud, sub, login, email, name, role, exp
    │
    └── 2. Sets iframe src with ?auth_token=eyJhb...
              │
              ▼
            Grafana (localhost:3000)
                Verifies JWT signature, issuer, audience, and role using public.pem
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
| `ALLOWED_ORIGINS` | `http://localhost:8080` | Only the demo frontend can call the token endpoints from a browser. |
| `AUTHORIZED_EMAIL_DOMAINS` | `wheelocity.local,demo.local,test.com` | Demo-only email domain allowlist before issuing a token. |
| `MAX_TOKEN_TTL_MINUTES` | `60` | Maximum accepted token lifetime. |
| `GRAFANA_URL` | `http://localhost:3000` | Browser-facing Grafana URL returned by the token API. |
| `GRAFANA_JWT_KEY_ID` | `wow-web-prod-20260531124246` | JWT header `kid`; useful for key identification and rotation. |
| `GRAFANA_JWT_ISSUER` | `wow-web` | Grafana validates this with `expect_claims`. |
| `GRAFANA_JWT_AUDIENCE` | `grafana-insights` | Grafana validates this with `expect_claims`. |
| `GRAFANA_JWT_ROLE` | `Viewer` | Sent as the Grafana role claim. |
| `GRAFANA_JWT_DEFAULT_TTL_SECONDS` | `900` | Default Grafana JWT lifetime for `/api/grafana/embed-token`. |

The app-style token endpoint requires an `authToken`, decodes identity from that app/WebView JWT without signature verification for this demo, and rejects invalid identity input, unauthorized email domains, and TTL values outside the configured bounds.

For compatibility with older demo notes, `GET /token?user=...&email=...&ttl=...` still exists. The best demo path is the app-style `POST /api/grafana/embed-token` endpoint because it mirrors wow-web.

---

## 🧪 Test Edge Cases

```bash
# Test with expired token (modify exp claim manually)
# Test with unauthorized email domain
curl -X POST "http://localhost:4000/api/grafana/embed-token" \
    -H "Content-Type: application/json" \
    -d '{"authToken":"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJoYWNrZXIiLCJlbWFpbCI6ImhhY2tlckBldmlsLmNvbSIsIm5hbWUiOiJIYWNrZXIifQ.","ttlSeconds":900}'
# Fails in this demo because the backend checks AUTHORIZED_EMAIL_DOMAINS
# The wow-web refactor intentionally decodes the WebView app JWT identity without cryptographic verification for now.
# If that requirement changes later, verify the app JWT before signing the Grafana JWT.

# Test missing app/WebView token
curl -X POST "http://localhost:4000/api/grafana/embed-token" \
    -H "Content-Type: application/json" \
    -d '{"ttlSeconds":900}'
# Fails because the broker requires identity to come from authToken.

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
- `backend/public.pem` must match `backend/private.pem`; restart Grafana after changing keys.

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
| `backend/public.pem` | No | Public key in PEM format. Grafana uses this in the main demo path. |
| `backend/jwks.json` | No | Optional public key representation for JWKS-based Grafana setups. |

This repo includes `.gitignore` entries for the private key, local `.env` files, dependency folders, logs, and local Docker/Grafana runtime state. The `.env.example` files are safe to commit.
If this demo is shared through a tar/zip file, the sample private key can be included for convenience. Do not commit or reuse it in a real environment.

---

## 📦 Next Steps (Production)

- [ ] Keep the app JWT verification posture aligned with wow-web requirements
- [ ] Set `auto_sign_up=false` unless Grafana user creation is intentionally controlled
- [ ] Move `private.pem` to a secrets manager (AWS Secrets Manager, Vault, etc.)
- [ ] Use HTTPS (token in URL must be encrypted in transit)
- [ ] Add short TTLs (5–10 minutes) + silent refresh
- [ ] Use `GF_SECURITY_COOKIE_SAMESITE=none` and `GF_SECURITY_COOKIE_SECURE=true` only when embedding across sites over HTTPS
- [ ] Tune Grafana session lifetime settings; JWT expiry alone is not the full session lifetime
- [ ] Log token issuance for audit trail
