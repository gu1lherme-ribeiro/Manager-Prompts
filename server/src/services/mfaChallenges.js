// server/src/services/mfaChallenges.js
import crypto from "node:crypto";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";
import { verifyTrustedDevice, TRUSTED_DEVICE_COOKIE } from "./trustedDevices.js";

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export const MFA_TTL_MIN = Math.floor(TTL_MS / 60000);
export const MFA_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const MFA_RESEND_COOLDOWN_S = Math.floor(RESEND_COOLDOWN_MS / 1000);

export class MfaChallengeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Código de 6 dígitos com leading zeros — randomInt evita módulo bias.
export function generateCode() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

// HMAC-SHA256 hex. Sem MFA_HMAC_KEY, lança — caller (rota) deve checar antes.
export function hmacCode(code) {
  if (!env.MFA_HMAC_KEY) {
    throw new MfaChallengeError("mfa_not_configured", "MFA_HMAC_KEY ausente");
  }
  return crypto.createHmac("sha256", env.MFA_HMAC_KEY).update(code).digest("hex");
}

/**
 * Cria challenge novo. Invalida challenges pendentes do mesmo user
 * (último vence — match com o padrão de PasswordResetToken).
 * Retorna { challengeId, code } — code raw só pra mailer chamar.
 */
export async function createChallenge({ userId, ip, userAgent }) {
  if (!env.MFA_HMAC_KEY) {
    throw new MfaChallengeError("mfa_not_configured", "MFA_HMAC_KEY ausente");
  }
  await prisma.mfaChallenge.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const code = generateCode();
  const row = await prisma.mfaChallenge.create({
    data: {
      userId,
      codeHash: hmacCode(code),
      expiresAt: new Date(Date.now() + TTL_MS),
      ip: ip || null,
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    },
  });
  return { challengeId: row.id, code };
}

/**
 * Consume challenge. Throws MfaChallengeError com codes:
 *   invalid | expired | used | too_many_attempts
 * Em sucesso, marca usedAt e retorna { userId }.
 */
export async function consumeChallenge(challengeId, code) {
  if (!challengeId || !code) {
    throw new MfaChallengeError("mfa_invalid", "código inválido");
  }
  if (!env.MFA_HMAC_KEY) {
    throw new MfaChallengeError("mfa_not_configured", "MFA_HMAC_KEY ausente");
  }
  const row = await prisma.mfaChallenge.findUnique({ where: { id: challengeId } });
  if (!row) throw new MfaChallengeError("mfa_invalid", "código inválido");
  if (row.usedAt) throw new MfaChallengeError("mfa_used", "código já foi usado");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new MfaChallengeError("mfa_expired", "código expirado");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new MfaChallengeError("mfa_too_many_attempts", "tentativas esgotadas — peça um novo código");
  }

  const expected = row.codeHash;
  const got = hmacCode(code);
  const ok = expected.length === got.length &&
    crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));

  if (!ok) {
    const incResult = await prisma.mfaChallenge.updateMany({
      where: { id: challengeId, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (incResult.count === 0) {
      // Concorrência: alguém já bateu o limite antes da gente.
      throw new MfaChallengeError("mfa_too_many_attempts", "tentativas esgotadas — peça um novo código");
    }
    // Re-checa o valor pós-incremento — se bateu o teto agora, é a última tentativa.
    const after = await prisma.mfaChallenge.findUnique({
      where: { id: challengeId },
      select: { attempts: true },
    });
    if (after && after.attempts >= MAX_ATTEMPTS) {
      throw new MfaChallengeError("mfa_too_many_attempts", "tentativas esgotadas — peça um novo código");
    }
    throw new MfaChallengeError("mfa_invalid", "código inválido");
  }

  await prisma.mfaChallenge.update({
    where: { id: challengeId },
    data: { usedAt: new Date() },
  });
  return { userId: row.userId };
}

/**
 * Para o /resend: confere se o último challenge do user foi criado dentro
 * do cooldown. Se sim, lança. Senão, deixa o caller criar um novo.
 */
export async function checkResendCooldown(userId) {
  const last = await prisma.mfaChallenge.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return;
  const elapsed = Date.now() - last.createdAt.getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new MfaChallengeError("mfa_resend_cooldown", `aguarde ${wait}s`);
  }
}

/**
 * Decide se o login atual exige MFA. Não tem efeito colateral.
 *
 * - Usuários só-OAuth (sem passwordHash) não passam por aqui via login com
 *   senha; defensivo retornar false caso cheguem.
 * - Sem registro em MfaSettings, ou enabled=false, MFA está desligado.
 * - Cookie mp_td válido (verifyTrustedDevice) dispensa o desafio.
 */
export async function isMfaRequired({ user, req }) {
  if (!user.passwordHash) return false;

  const settings = await prisma.mfaSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.enabled) return false;

  const tdToken = req.cookies?.[TRUSTED_DEVICE_COOKIE];
  if (tdToken && (await verifyTrustedDevice(tdToken, user.id))) return false;

  return true;
}
