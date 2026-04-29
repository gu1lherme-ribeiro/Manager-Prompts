import prisma from "../db/prisma.js";
import { encryptApiKey, decryptApiKey } from "./crypto.js";

export const VALID_PROVIDERS = ["anthropic", "openai", "gemini"];

export function isValidProvider(p) {
  return VALID_PROVIDERS.includes(p);
}

function emptyMap() {
  return { anthropic: null, openai: null, gemini: null };
}

// Status resumido — nunca inclui a chave, só metadados.
export async function listApiKeyStatus(userId) {
  const keys = await prisma.userApiKey.findMany({
    where: { userId },
    select: {
      provider: true,
      keyLast4: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  const out = emptyMap();
  for (const k of keys) {
    if (k.provider in out) {
      out[k.provider] = {
        connected: true,
        last4: k.keyLast4,
        updatedAt: k.updatedAt.getTime(),
        createdAt: k.createdAt.getTime(),
      };
    }
  }
  return out;
}

// Booleans por provider — usado em /me pra UI decidir enable/disable do botão "melhorar".
export async function hasKeysMap(userId) {
  const keys = await prisma.userApiKey.findMany({
    where: { userId },
    select: { provider: true },
  });
  const out = { anthropic: false, openai: false, gemini: false };
  for (const k of keys) if (k.provider in out) out[k.provider] = true;
  return out;
}

export async function saveApiKey({ userId, provider, plaintextKey }) {
  const { ciphertext, iv, authTag, version } = encryptApiKey({
    plaintext: plaintextKey,
    userId,
    provider,
  });
  const last4 = plaintextKey.slice(-4);
  const row = await prisma.userApiKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      keyCiphertext: ciphertext,
      keyIv: iv,
      keyAuthTag: authTag,
      keyLast4: last4,
      keyVersion: version,
    },
    update: {
      keyCiphertext: ciphertext,
      keyIv: iv,
      keyAuthTag: authTag,
      keyLast4: last4,
      keyVersion: version,
    },
  });
  return {
    provider,
    connected: true,
    last4: row.keyLast4,
    updatedAt: row.updatedAt.getTime(),
    createdAt: row.createdAt.getTime(),
  };
}

export async function deleteApiKey({ userId, provider }) {
  const res = await prisma.userApiKey.deleteMany({ where: { userId, provider } });
  return res.count > 0;
}

// Retorna Buffer com a chave em claro. Caller DEVE fazer plaintext.fill(0) após uso.
export async function loadDecryptedKey({ userId, provider }) {
  const row = await prisma.userApiKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;
  return decryptApiKey({
    ciphertext: row.keyCiphertext,
    iv: row.keyIv,
    authTag: row.keyAuthTag,
    userId,
    provider,
    version: row.keyVersion,
  });
}
