// server/src/services/trustedDevices.js
import crypto from "node:crypto";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export const TRUSTED_DEVICE_TTL_DAYS = TTL_DAYS;
export const TRUSTED_DEVICE_COOKIE = "mp_td";

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function trustedDeviceCookieOptions() {
  const opts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS,
  };
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

/**
 * Cria entrada nova de trusted device. Retorna { token } raw — caller seta cookie.
 */
export async function createTrustedDevice({ userId, ip, userAgent }) {
  const token = randomToken(32);
  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TTL_MS),
      ip: ip ? String(ip).slice(0, 64) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    },
  });
  return { token };
}

/**
 * Verifica cookie. Retorna true se válido (não expirado, do user certo) e
 * atualiza lastUsedAt. Retorna false silenciosamente em qualquer falha.
 */
export async function verifyTrustedDevice(token, userId) {
  if (!token || !userId) return false;
  const row = await prisma.trustedDevice.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!row) return false;
  if (row.userId !== userId) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;

  prisma.trustedDevice.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {}); // fire-and-forget — não bloqueia o login mesmo se a update falhar

  return true;
}

export async function listTrustedDevices(userId) {
  return prisma.trustedDevice.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, userAgent: true, ip: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });
}

export async function revokeTrustedDevice(deviceId, userId) {
  const result = await prisma.trustedDevice.deleteMany({
    where: { id: deviceId, userId },
  });
  return result.count;
}

export async function revokeAllTrustedDevicesForUser(userId) {
  const result = await prisma.trustedDevice.deleteMany({ where: { userId } });
  return result.count;
}
