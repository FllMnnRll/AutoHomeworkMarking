import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENC_PREFIX = "enc:";
const KEY_SALT = "auto-homework-marking-v1";

function deriveKey(raw: string): Buffer {
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const fromBase64 = Buffer.from(raw, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  return crypto.scryptSync(raw, KEY_SALT, 32);
}

function getEncryptionKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is required to decrypt enc: secrets. " +
        "Generate one with: node scripts/encrypt-secret.js --generate-key"
    );
  }
  return deriveKey(raw);
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export function encryptSecret(plaintext: string, keyOverride?: string): string {
  const key = keyOverride ? deriveKey(keyOverride) : getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${ENC_PREFIX}${payload.toString("base64")}`;
}

export function decryptSecret(encryptedValue: string): string {
  if (!encryptedValue.startsWith(ENC_PREFIX)) {
    return encryptedValue;
  }

  const payload = Buffer.from(encryptedValue.slice(ENC_PREFIX.length), "base64");
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Resolve a single env var, transparently decrypting enc: values. */
export function resolveSecret(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  return decryptSecret(raw);
}

/** Resolve a comma-separated list of secrets (e.g. GEMINI_API_KEYS). */
export function resolveSecretList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => decryptSecret(item));
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
