const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..");
const privateKeyPath = path.join(backendDir, "private.pem");
const publicKeyPath = path.join(backendDir, "public.pem");
const jwksPath = path.join(backendDir, "jwks.json");
const keyId = process.env.JWT_KEY_ID || "grafana-demo-key-1";
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
const jwk = publicKey.export({ format: "jwk" });

const jwks = {
  keys: [
    {
      kty: jwk.kty,
      use: "sig",
      alg: "RS256",
      kid: keyId,
      n: jwk.n,
      e: jwk.e,
    },
  ],
};

fs.writeFileSync(privateKeyPath, privatePem);
fs.writeFileSync(publicKeyPath, publicPem);
fs.writeFileSync(jwksPath, `${JSON.stringify(jwks, null, 2)}\n`);

console.log("Generated backend/private.pem, backend/public.pem, and backend/jwks.json.");