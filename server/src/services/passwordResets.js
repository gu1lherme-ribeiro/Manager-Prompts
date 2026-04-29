import crypto from "node:crypto";
import prisma from "../db/prisma.js";
import { hashPassword } from "./passwords.js";
import { revokeAllSessionsForUser } from "./sessions.js";

const TTL_MS = 30 * 60 * 1000; // 30min

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export class ResetTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Cria um token de reset para o usuário do email. Retorna o token em claro
 * (consumido só pelo caller que vai entregar ao usuário — email, log, etc.).
 * Se o email não existe OU o usuário só tem Google (sem senha local), retorna
 * null. A rota NUNCA deve vazar essa distinção — responde 202 em todos os casos.
 */
export async function createResetTokenForEmail(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;

  // Invalida tokens pendentes do mesmo usuário — "último link enviado vence".
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { token, user };
}

/**
 * Consome um token de reset e troca a senha. Atômico: se a troca der certo,
 * marca token como usado e revoga todas as sessões ativas do usuário.
 * Erros: token_invalid | token_expired | token_used.
 */
export async function consumeResetToken(rawToken, newPassword) {
  if (!rawToken) throw new ResetTokenError("token_invalid", "token inválido");

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
  });
  if (!row) throw new ResetTokenError("token_invalid", "token inválido");
  if (row.usedAt) throw new ResetTokenError("token_used", "token já foi usado");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new ResetTokenError("token_expired", "token expirado");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Fora da transação: revogar sessões é fire-and-forget tolerante a falha.
  await revokeAllSessionsForUser(row.userId);

  return { userId: row.userId };
}

export const RESET_TTL_MINUTES = Math.floor(TTL_MS / 60000);
