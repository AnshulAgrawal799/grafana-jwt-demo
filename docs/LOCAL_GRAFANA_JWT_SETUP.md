# Local Grafana JWT Setup Runbook

Use this when you want to configure and verify JWT iframe embedding against the local Grafana container before touching the hosted Grafana environment.

## What Runs Locally

- Grafana: <http://localhost:3000>
- Demo Next.js app: <http://localhost:8080>
- Grafana admin login: `admin / admin123`
- Provisioned dashboard: <http://localhost:3000/d/jwt-embed-demo/jwt-embed-demo?orgId=1>
- Provisioned solo panel URL: <http://localhost:3000/d-solo/jwt-embed-demo/jwt-embed-demo?orgId=1&panelId=1>

## Local Configuration Model

Local JWT auth is configured through `docker-compose.yml`, not through the Grafana UI. The JWT authentication page is not always visible in Grafana, even when JWT auth works.

The local container uses these important settings:

```text
GF_AUTH_JWT_ENABLED=true
GF_AUTH_JWT_URL_LOGIN=true
GF_AUTH_JWT_ENABLE_LOGIN_TOKEN=true
GF_AUTH_JWT_KEY_FILE=/etc/grafana/wow-web-public.pem
GF_AUTH_JWT_KEY_ID=wow-web-prod-20260531124246
GF_AUTH_JWT_USERNAME_CLAIM=login
GF_AUTH_JWT_EMAIL_CLAIM=email
GF_AUTH_JWT_NAME_CLAIM=name
GF_AUTH_JWT_EXPECT_CLAIMS={"iss":"wow-web","aud":"grafana-insights"}
GF_AUTH_JWT_ROLE_ATTRIBUTE_PATH=role
GF_AUTH_JWT_AUTO_SIGN_UP=true
GF_SECURITY_ALLOW_EMBEDDING=true
```

The matching public key is mounted from:

```text
backend/public.pem -> /etc/grafana/wow-web-public.pem
```

The private key stays local and is used only by the Next.js token broker:

```text
backend/private.pem
```

Do not commit private keys, `.env` files, Grafana API keys, or generated JWTs.

## 1. Prepare Keys

From the repo root:

```powershell
npm install
```

If `backend/private.pem` is missing, generate a local keypair:

```powershell
npm run generate:keys
```

If `backend/private.pem` already exists, keep it. Regenerating keys requires restarting Grafana because Grafana must read the matching `backend/public.pem` again.

Validate the local token contract:

```powershell
npm run validate:contract
```

Expected result includes:

```text
"valid": true
"alg": "RS256"
"kid": "wow-web-prod-20260531124246"
"iss": "wow-web"
"aud": "grafana-insights"
"role": "Viewer"
```

## 2. Start Local Grafana And App

```powershell
docker compose up -d
docker compose ps
```

Expected containers:

```text
grafana-jwt-demo       -> localhost:3000
grafana-jwt-demo-web   -> localhost:8080
```

After changing `docker-compose.yml` or key files, restart:

```powershell
docker compose down
docker compose up -d
```

## 3. Inspect Grafana Manually

Open Grafana:

```text
http://localhost:3000
```

Login with:

```text
admin / admin123
```

Open the provisioned dashboard:

```text
http://localhost:3000/d/jwt-embed-demo/jwt-embed-demo?orgId=1
```

The existing provisioned panel has `panelId=1`, so the solo panel URL is:

```text
http://localhost:3000/d-solo/jwt-embed-demo/jwt-embed-demo?orgId=1&panelId=1
```

You can also create your own dashboard and copy its solo panel URL from the panel share/embed dialog.

## 4. Verify The Token Broker

Check the app health endpoint:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/api/health | ConvertTo-Json -Depth 5
```

Request a Grafana JWT from the Next.js broker:

```powershell
$body = @{
  authToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZW1vLXZpZXdlciIsImVtYWlsIjoiZGVtb0B3aGVlbG9jaXR5LmxvY2FsIiwibmFtZSI6IkRlbW8gVmlld2VyIn0.'
} | ConvertTo-Json

Invoke-RestMethod \
  -Uri http://localhost:8080/api/grafana/embed-token \
  -Method Post \
  -ContentType 'application/json' \
  -Body $body | ConvertTo-Json -Depth 5
```

Expected response:

```text
token: <RS256 Grafana JWT>
expiresAt: <ISO timestamp>
ttlSeconds: 1800
```

## 5. Load The Iframe Demo

Open the demo app:

```text
http://localhost:8080
```

Use this solo panel URL:

```text
http://localhost:3000/d-solo/jwt-embed-demo/jwt-embed-demo?orgId=1&panelId=1
```

Click `Generate token and load`.

Expected success signals:

- The status changes to `Token active`.
- The iframe URL contains `auth_token=`.
- The Grafana panel renders without asking for a Grafana password.
- `Refresh token` updates the token expiry and keeps the iframe loaded.

For a clean JWT-only check, test in an incognito/private window or log out of Grafana first. An existing admin Grafana cookie can make the iframe appear to work even when JWT login is not the path being tested.

## 6. Troubleshooting

Check container status:

```powershell
docker compose ps
```

Check Grafana logs:

```powershell
docker compose logs --tail 100 grafana
```

Check web app logs:

```powershell
docker compose logs --tail 100 web
```

If the iframe shows the Grafana login page:

- Confirm `npm run validate:contract` returns `valid: true`.
- Restart Grafana after changing keys or compose settings.
- Confirm the iframe URL has `auth_token=`.
- Test without an existing Grafana admin session.
- Confirm the token claims match `iss=wow-web`, `aud=grafana-insights`, and `role=Viewer`.

If the token endpoint returns an error:

- Confirm `backend/private.pem` exists.
- Confirm the request body contains `authToken`.
- Check `docker compose logs --tail 100 web` for the route error.

## Production Reminder

This local flow is only for validation. Production needs real WebView/user token verification, secret management, HTTPS, secure cookie settings, and a Grafana administrator to apply equivalent server-side JWT and embedding settings.