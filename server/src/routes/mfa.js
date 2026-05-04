// server/src/routes/mfa.js
import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";
import {
  consumeChallenge,
  checkResendCooldown,
  createChallenge,
  MfaChallengeError,
  MFA_TTL_MIN,
  MFA_MAX_ATTEMPTS,
  MFA_RESEND_COOLDOWN_S,
} from "../services/mfaChallenges.js";
import {
  createTrustedDevice,
  trustedDeviceCookieOptions,
  TRUSTED_DEVICE_COOKIE,
} from "../services/trustedDevices.js";
import { renderMfaChallengeEmail } from "../services/emailTemplates/mfaChallenge.js";
import { sendMail } from "../services/mailer.js";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  sessionCookieOptions,
  csrfCookieOptions,
  issueCsrfToken,
} from "../services/sessions.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { meResponse } from "../services/users.js";

const router = Router();

const verifySchema = z.object({
  challengeId: z.string().min(8).max(40),
  code: z.string().regex(/^\d{6}$/, "código deve ter 6 dígitos"),
  trustDevice: z.boolean().optional().default(false),
  keep: z.boolean().optional().default(false),
});

const resendSchema = z.object({
  challengeId: z.string().min(8).max(40),
});

function mapMfaErrorStatus(code) {
  switch (code) {
    case "mfa_expired":
    case "mfa_used":
      return 410;
    case "mfa_too_many_attempts":
    case "mfa_resend_cooldown":
      return 429;
    case "mfa_not_configured":
      return 503;
    default:
      return 400;
  }
}

router.post("/verify", authLimiter, async (req, res, next) => {
  try {
    const { challengeId, code, trustDevice, keep } = verifySchema.parse(req.body);
    const { userId } = await consumeChallenge(challengeId, code);
    // Usuário pode ter sido deletado entre a criação do challenge e o verify.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(400).json({ error: { code: "mfa_invalid", message: "código inválido" } });
    }

    const { token } = await createSession({
      userId: user.id,
      keep,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ keep }));
    res.cookie(CSRF_COOKIE, issueCsrfToken(), csrfCookieOptions());

    if (trustDevice) {
      const td = await createTrustedDevice({
        userId: user.id,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.cookie(TRUSTED_DEVICE_COOKIE, td.token, trustedDeviceCookieOptions());
    }

    res.json({ user: await meResponse(user) });
  } catch (err) {
    if (err instanceof MfaChallengeError) {
      return res.status(mapMfaErrorStatus(err.code))
        .json({ error: { code: err.code, message: err.message } });
    }
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

router.post("/resend", authLimiter, async (req, res, next) => {
  try {
    const { challengeId } = resendSchema.parse(req.body);
    // Defesa em profundidade: o cuid do challenge tem ~256 bits de entropia,
    // então probing de ID não é viável. Mas equalizar o número de queries
    // entre os caminhos de erro mata qualquer side-channel residual.
    const old = await prisma.mfaChallenge.findUnique({ where: { id: challengeId } });
    const user = old
      ? await prisma.user.findUnique({ where: { id: old.userId } })
      : null;
    if (!old || !user) {
      return res.status(404).json({ error: { code: "mfa_invalid", message: "challenge inválido" } });
    }

    await checkResendCooldown(old.userId);

    const { challengeId: newId, code } = await createChallenge({
      userId: user.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    const mail = renderMfaChallengeEmail({
      to: user.email,
      code,
      ttlMinutes: MFA_TTL_MIN,
      firstName: user.firstName,
      baseUrl: env.BASE_URL,
      challengePreview: newId.slice(0, 7),
    });
    sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text })
      .catch((err) => console.error("[mfa:resend] sendMail crashed:", err));

    res.status(202).json({
      challengeId: newId,
      ttlSeconds: MFA_TTL_MIN * 60,
      attemptsLeft: MFA_MAX_ATTEMPTS,
      cooldownSeconds: MFA_RESEND_COOLDOWN_S,
    });
  } catch (err) {
    if (err instanceof MfaChallengeError) {
      return res.status(mapMfaErrorStatus(err.code))
        .json({ error: { code: err.code, message: err.message } });
    }
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

export default router;
