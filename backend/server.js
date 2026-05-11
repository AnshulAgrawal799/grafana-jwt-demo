const http = require("http");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

loadLocalEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4000);
const KEY_ID = "grafana-demo-key-1";
const ISSUER = "grafana-jwt-demo";
const DEFAULT_TTL_MINUTES = 15;
const MAX_TTL_MINUTES = Number(process.env.MAX_TOKEN_TTL_MINUTES || 60);
const GRAFANA_URL = process.env.GRAFANA_URL || "http://localhost:3000";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const AUTHORIZED_EMAIL_DOMAINS = (process.env.AUTHORIZED_EMAIL_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

let PRIVATE_KEY;
try {
  PRIVATE_KEY = fs.readFileSync(path.join(__dirname, "private.pem"), "utf8");
} catch (err) {
  console.error("Missing backend/private.pem. Add the RSA private key before starting the token server.");
  process.exit(1);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

function parseTtl(rawTtl) {
  const ttl = rawTtl === null ? DEFAULT_TTL_MINUTES : Number(rawTtl);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_MINUTES) {
    throw new Error(`ttl must be a whole number from 1 to ${MAX_TTL_MINUTES} minutes`);
  }
  return ttl;
}

function validateIdentity(userId, email) {
  if (!/^[A-Za-z0-9._@-]{1,64}$/.test(userId)) {
    throw new Error("user must be 1-64 characters and contain only letters, numbers, dot, underscore, @, or dash");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("email must be a valid email address");
  }

  if (AUTHORIZED_EMAIL_DOMAINS.length > 0) {
    const domain = email.split("@").pop().toLowerCase();
    if (!AUTHORIZED_EMAIL_DOMAINS.includes(domain)) {
      const allowed = AUTHORIZED_EMAIL_DOMAINS.join(", ");
      throw new Error(`email domain is not authorized for this demo. Allowed domains: ${allowed}`);
    }
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Generate a Grafana token for a validated user.
function generateToken(userId, email, ttlMinutes) {
  return jwt.sign({
    sub: userId,
    login: userId,
    email,
    name: userId,
  }, PRIVATE_KEY, {
    algorithm: "RS256",
    keyid: KEY_ID,
    issuer: ISSUER,
    expiresIn: `${ttlMinutes}m`,
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCorsHeaders(req, res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── GET /token?user=myuser&email=me@example.com ──────────────────────────
  if (url.pathname === "/token") {
    const user = url.searchParams.get("user") || "demo-viewer";
    const email = url.searchParams.get("email") || `${user}@demo.local`;
    let ttl;

    try {
      ttl = parseTtl(url.searchParams.get("ttl"));
      validateIdentity(user, email);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const token = generateToken(user, email, ttl);
    return sendJson(res, 200, {
      token,
      user,
      email,
      ttlMinutes: ttl,
      expiresAt: new Date(Date.now() + ttl * 60 * 1000).toISOString(),
      grafanaUrl: GRAFANA_URL,
    });
  }

  // ── GET /health ──────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok", time: new Date().toISOString() });
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`\n✅  JWT Backend running at http://localhost:${PORT}`);
  console.log(`   GET /token?user=alice&email=alice@demo.local`);
  console.log(`   GET /health\n`);
});
