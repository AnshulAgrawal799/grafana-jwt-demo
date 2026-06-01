const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

loadLocalEnv(path.join(__dirname, "..", "..", ".env"));
loadLocalEnv(path.join(__dirname, "..", ".env"));

const backendDir = path.resolve(__dirname, "..");
const privateKey = fs.readFileSync(path.join(backendDir, "private.pem"), "utf8");
const publicKey = fs.readFileSync(path.join(backendDir, "public.pem"), "utf8");

const config = {
  keyId: process.env.GRAFANA_JWT_KEY_ID || "wow-web-prod-20260531124246",
  issuer: process.env.GRAFANA_JWT_ISSUER || "wow-web",
  audience: process.env.GRAFANA_JWT_AUDIENCE || "grafana-insights",
  role: "Viewer",
  ttlSeconds: Number(process.env.GRAFANA_JWT_DEFAULT_TTL_SECONDS || 1800),
};

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 1800;

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function clampTtlSeconds(ttlSeconds) {
  const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : 1800;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttl)));
}

function pickJwtClaim(payload, ...keys) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function toSyntheticEmail(value) {
  const safeValue = value.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return `${safeValue || "webview-user"}@wow.local`;
}

function createUnsignedWebViewJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

function webviewBodyToEmbedUser(body) {
  if (typeof body.authToken !== "string" || !body.authToken.trim()) {
    throw new Error("authToken is required");
  }

  const payload = jwt.decode(body.authToken);
  if (!payload || typeof payload !== "object") {
    throw new Error("authToken must be a decodable app/WebView JWT");
  }

  const uid = pickJwtClaim(payload, "sub", "uid", "userId", "user_id", "userCredential", "mobile", "phone");
  if (!uid) {
    throw new Error("WebView authentication token is missing a user identifier");
  }

  const email = pickJwtClaim(payload, "email") || toSyntheticEmail(uid);
  return {
    uid,
    email,
    name: pickJwtClaim(payload, "name", "shadowName", "displayName") || email,
  };
}

function signGrafanaToken(user, ttlSeconds) {
  return jwt.sign({
    sub: user.uid,
    login: user.email,
    email: user.email,
    name: user.name,
    role: config.role,
  }, privateKey, {
  algorithm: "RS256",
  keyid: config.keyId,
  issuer: config.issuer,
  audience: config.audience,
  expiresIn: ttlSeconds,
  });
}

const ttlSeconds = clampTtlSeconds(config.ttlSeconds);
const webviewAuthToken = createUnsignedWebViewJwt({
  sub: "demo-viewer",
  email: "demo@wheelocity.local",
  name: "Demo Viewer",
});
const embedUser = webviewBodyToEmbedUser({ authToken: webviewAuthToken });
const syntheticUser = webviewBodyToEmbedUser({ authToken: createUnsignedWebViewJwt({ sub: "user-42" }) });
const token = signGrafanaToken(embedUser, ttlSeconds);

const header = jwt.decode(token, { complete: true }).header;
const claims = jwt.verify(token, publicKey, {
  algorithms: ["RS256"],
  issuer: config.issuer,
  audience: config.audience,
});

if (claims.role !== config.role) {
  throw new Error(`Expected role ${config.role}, received ${claims.role}`);
}

if (claims.login !== embedUser.email || claims.email !== embedUser.email || claims.sub !== embedUser.uid) {
  throw new Error("Grafana token claims do not match WebView authToken identity");
}

if (syntheticUser.email !== "user-42@wow.local" || syntheticUser.name !== "user-42@wow.local") {
  throw new Error(`Expected synthetic @wow.local email, received ${syntheticUser.email}`);
}

try {
  webviewBodyToEmbedUser({});
  throw new Error("Expected missing authToken to fail");
} catch (err) {
  if (err.message !== "authToken is required") {
    throw err;
  }
}

console.log(JSON.stringify({
  valid: true,
  requestBody: {
    requiredField: "authToken",
    sampleShape: "{ authToken: <WebView app JWT> }",
  },
  header: {
    alg: header.alg,
    kid: header.kid,
  },
  claims: {
    iss: claims.iss,
    aud: claims.aud,
    sub: claims.sub,
    login: claims.login,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    ttlSeconds,
  },
  webviewMapping: {
    uid: embedUser.uid,
    email: embedUser.email,
    name: embedUser.name,
    syntheticEmailWithoutEmailClaim: syntheticUser.email,
  },
  publicKey: {
    file: "backend/public.pem",
    grafanaSetting: "GF_AUTH_JWT_KEY_FILE",
  },
}, null, 2));