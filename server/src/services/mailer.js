import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;
let warnedMissingConfig = false;

function isConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true = 465 (TLS direto); false = 587 (STARTTLS)
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

function fromAddress() {
  // Se SMTP_FROM já contém display name ("nome <addr>"), usa direto.
  if (env.SMTP_FROM.includes("<")) return env.SMTP_FROM;
  return `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`;
}

/**
 * Envia um email. Se SMTP não está configurado, faz log no stdout com
 * o conteúdo mínimo pra não bloquear o fluxo em dev.
 *
 * Nunca lança — falhas de envio são reportadas via console.error e o caller
 * decide se é crítico. Para reset de senha, preferimos **não** vazar falha
 * de SMTP na resposta (mantém 202 uniforme anti-enumeração).
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!isConfigured()) {
    if (!warnedMissingConfig) {
      console.warn(
        "[mailer] SMTP não configurado (SMTP_HOST/SMTP_FROM ausentes) — emails cairão em stdout.",
      );
      warnedMissingConfig = true;
    }
    console.log(
      `[mailer:dev] to=${to} subject=${JSON.stringify(subject)}\n--- text ---\n${text}\n--- end ---`,
    );
    return { skipped: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
      replyTo: replyTo || undefined,
    });
    return { messageId: info.messageId };
  } catch (err) {
    console.error(`[mailer] falha ao enviar para ${to}:`, err?.message || err);
    return { error: true };
  }
}

/**
 * Verifica conectividade do transport (usável em /health ou no boot).
 * Não throw — retorna boolean.
 */
export async function verifyMailer() {
  if (!isConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    console.error("[mailer] verify falhou:", err?.message || err);
    return false;
  }
}
