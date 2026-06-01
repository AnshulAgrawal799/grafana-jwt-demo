const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

loadLocalEnv(path.join(__dirname, "..", ".env"));

const backendDir = path.resolve(__dirname, "..");
const privateKey = fs.readFileSync(path.join(backendDir, "private.pem"), "utf8");
const publicKey = fs.readFileSync(path.join(backendDir, "public.pem"), "utf8");

const config = {
  keyId: process.env.GRAFANA_JWT_KEY_ID || "wow-web-prod-20260531124246",
  issuer: process.env.GRAFANA_JWT_ISSUER || "wow-web",
  audience: process.env.GRAFANA_JWT_AUDIENCE || "grafana-insights",
  role: process.env.GRAFANA_JWT_ROLE || "Viewer",
  ttlSeconds: Number(process.env.GRAFANA_JWT_DEFAULT_TTL_SECONDS || 900),
};

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

const token = jwt.sign({
  sub: "demo-viewer",
  login: "demo@wheelocity.local",
  email: "demo@wheelocity.local",
  name: "Demo Viewer",
  role: config.role,
}, privateKey, {
  algorithm: "RS256",
  keyid: config.keyId,
  issuer: config.issuer,
  audience: config.audience,
  expiresIn: config.ttlSeconds,
});

const header = jwt.decode(token, { complete: true }).header;
const claims = jwt.verify(token, publicKey, {
  algorithms: ["RS256"],
  issuer: config.issuer,
  audience: config.audience,
});

if (claims.role !== config.role) {
  throw new Error(`Expected role ${config.role}, received ${claims.role}`);
}

console.log(JSON.stringify({
  valid: true,
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
  },
  publicKey: {
    file: "backend/public.pem",
    grafanaSetting: "GF_AUTH_JWT_KEY_FILE",
  },
}, null, 2));