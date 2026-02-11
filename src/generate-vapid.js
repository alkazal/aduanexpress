import { generateKeyPairSync } from "crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "jwk" },
});

console.log("VAPID PUBLIC KEY (JWK):");
console.log(JSON.stringify(publicKey, null, 2));

console.log("\nVAPID PRIVATE KEY (JWK):");
console.log(JSON.stringify(privateKey, null, 2));
