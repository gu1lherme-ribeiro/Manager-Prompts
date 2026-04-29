import crypto from "node:crypto";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "mp_sid";
export const CSRF_COOKIE = "mp_csrf";

const KEEP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const SHORT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function createSession({ userId, keep, userAgent, ip }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + (keep ? KEEP_MAX_AGE_MS : SHORT_MAX_AGE_MS));
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 255) || null,
      ip: ip?.slice(0, 64) || null,
    },
  });
  return { token, expiresAt, keep };
}

export async function findSessionByToken(token) {
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  // Atualiza lastUsedAt de forma fire-and-forget (não bloqueia request)
  prisma.session
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return row;
}

export async function revokeSession(token) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function revokeAllSessionsForUser(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function sessionCookieOptions({ keep }) {
  const opts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  };
  if (keep) opts.maxAge = KEEP_MAX_AGE_MS;
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

export function csrfCookieOptions() {
  const opts = {
    httpOnly: false, // precisa ser lido pelo JS
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  };
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

export function issueCsrfToken() {
  return randomToken(24);
}
