import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // GCM padrão
const CURRENT_VERSION = 1;

function getMasterKey() {
  const key = env.ENCRYPTION_KEY;
  if (!key || key.length !== 32) {
    const err = new Error("ENCRYPTION_KEY ausente ou inválida — configure no .env (32 bytes base64)");
    err.status = 503;
    err.code = "encryption_disabled";
    throw err;
  }
  return key;
}

function buildAad({ userId, provider, version }) {
  return Buffer.from(`byok:v${version}:${userId}:${provider}`, "utf8");
}

export function encryptApiKey({ plaintext, userId, provider, version = CURRENT_VERSION }) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(buildAad({ userId, provider, version }));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: enc, iv, authTag: tag, version };
}

export function decryptApiKey({
  ciphertext,
  iv,
  authTag,
  userId,
  provider,
  version = CURRENT_VERSION,
}) {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(buildAad({ userId, provider, version }));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptionAvailable() {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}
