#!/usr/bin/env node
/**
 * Encrypt secrets for .env storage (AES-256-GCM).
 *
 * Usage:
 *   node scripts/encrypt-secret.js --generate-key
 *   node scripts/encrypt-secret.js "sk-your-api-key"
 *   node scripts/encrypt-secret.js --key <hex-key> "sk-your-api-key"
 *
 * Set SECRETS_ENCRYPTION_KEY in .env (never commit this file).
 * Store encrypted values as enc:<base64> in .env.
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENC_PREFIX = "enc:";
const KEY_SALT = "auto-homework-marking-v1";

function deriveKey(raw) {
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const fromBase64 = Buffer.from(raw, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  return crypto.scryptSync(raw, KEY_SALT, 32);
}

function encryptSecret(plaintext, keyRaw) {
  const key = deriveKey(keyRaw);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${ENC_PREFIX}${payload.toString("base64")}`;
}

function decryptSecret(encryptedValue, keyRaw) {
  if (!encryptedValue.startsWith(ENC_PREFIX)) {
    return encryptedValue;
  }

  const payload = Buffer.from(encryptedValue.slice(ENC_PREFIX.length), "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = deriveKey(keyRaw);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

function printUsage() {
  console.log(`
Encrypt secrets for safe .env storage.

Commands:
  node scripts/encrypt-secret.js --generate-key
  node scripts/encrypt-secret.js "your-secret-value"
  node scripts/encrypt-secret.js --key <hex-key> "your-secret-value"
  node scripts/encrypt-secret.js --decrypt "enc:..."

Environment:
  SECRETS_ENCRYPTION_KEY   Master key (64-char hex, 32-byte base64, or passphrase)
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  if (args.includes("--generate-key")) {
    const key = generateKey();
    console.log("Generated SECRETS_ENCRYPTION_KEY (add to .env, do NOT commit):");
    console.log(key);
    return;
  }

  if (args.includes("--decrypt")) {
    const decryptIndex = args.indexOf("--decrypt");
    const encrypted = args[decryptIndex + 1];
    const keyRaw = process.env.SECRETS_ENCRYPTION_KEY;
    if (!encrypted || !keyRaw) {
      console.error("Error: --decrypt requires an enc: value and SECRETS_ENCRYPTION_KEY.");
      process.exit(1);
    }
    console.log(decryptSecret(encrypted, keyRaw));
    return;
  }

  let keyRaw = process.env.SECRETS_ENCRYPTION_KEY;
  let secret = args[0];

  const keyFlagIndex = args.indexOf("--key");
  if (keyFlagIndex !== -1) {
    keyRaw = args[keyFlagIndex + 1];
    secret = args.filter((_, i) => i !== keyFlagIndex && i !== keyFlagIndex + 1).join(" ");
  }

  if (!secret) {
    console.error("Error: provide a secret value to encrypt.");
    printUsage();
    process.exit(1);
  }

  if (!keyRaw) {
    console.error("Error: set SECRETS_ENCRYPTION_KEY in .env or pass --key <hex-key>.");
    process.exit(1);
  }

  const encrypted = encryptSecret(secret, keyRaw);
  console.log("Encrypted value (paste into .env):");
  console.log(encrypted);
}

main();
