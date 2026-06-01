const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..");
const privateKeyPath = path.join(backendDir, "private.pem");
const publicKeyPath = path.join(backendDir, "public.pem");
const keyId = process.env.GRAFANA_JWT_KEY_ID || process.env.JWT_KEY_ID || "wow-web-prod-20260531124246";
const force = process.argv.includes("--force");

if (!force && fs.existsSync(privateKeyPath)) {
  console.error("backend/private.pem already exists. Re-run with -- --force to replace local keys.");
  process.exit(1);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });

fs.writeFileSync(privateKeyPath, privatePem);
fs.writeFileSync(publicKeyPath, publicPem);

console.log(`Generated backend/private.pem and backend/public.pem with kid=${keyId}.`);