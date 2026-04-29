import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  revokeSession,
  sessionCookieOptions,
  csrfCookieOptions,
  issueCsrfToken,
} from "../services/sessions.js";
import {
  createResetTokenForEmail,
  consumeResetToken,
  ResetTokenError,
  RESET_TTL_MINUTES,
} from "../services/passwordResets.js";
import { sendMail } from "../services/mailer.js";
import { renderPasswordResetEmail } from "../services/emailTemplates/passwordReset.js";
import { requireUser } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { hasKeysMap } from "../services/apiKeys.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8).max(200),
  keep: z.boolean().optional().default(false),
});

const personName = z
  .string()
  .trim()
  .min(1, "nome obrigatório")
  .max(80, "nome muito longo");

const registerSchema = credentialsSchema.extend({
  firstName: personName,
  lastName: personName,
});

async function meResponse(user) {
  const hasKeys = await hasKeysMap(user.id);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    defaultProvider: user.defaultProvider,
    hasGoogle: !!user.googleSub,
    hasPassword: !!user.passwordHash,
    hasKeys,
  };
}

async function issueAuth(res, { user, keep, req }) {
  const { token } = await createSession({
    userId: user.id,
    keep,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ keep }));
  res.cookie(CSRF_COOKIE, issueCsrfToken(), csrfCookieOptions());
}

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password, keep, firstName, lastName } =
      registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        error: { code: "email_taken", message: "email já cadastrado" },
      });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
      },
    });
    await issueAuth(res, { user, keep, req });
    res.status(201).json({ user: await meResponse(user) });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password, keep } = credentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await verifyPassword(user.passwordHash, password));
    if (!ok) {
      return res.status(401).json({
        error: { code: "invalid_credentials", message: "credenciais inválidas" },
      });
    }
    await issueAuth(res, { user, keep, req });
    res.json({ user: await meResponse(user) });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    await revokeSession(token);
    const clearOpts = { ...sessionCookieOptions({ keep: false }) };
    delete clearOpts.maxAge;
    res.clearCookie(SESSION_COOKIE, clearOpts);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireUser, async (req, res, next) => {
  try {
    res.json({ user: await meResponse(req.user) });
  } catch (err) {
    next(err);
  }
});

// Password reset ------------------------------------------------------------

const forgotSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
});

const resetSchema = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8).max(200),
});

router.post("/forgot", authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const issued = await createResetTokenForEmail(email);
    if (issued) {
      const resetUrl = `${env.BASE_URL}/reset?token=${issued.token}`;
      const mail = renderPasswordResetEmail({
        to: email,
        resetUrl,
        ttlMinutes: RESET_TTL_MINUTES,
        firstName: issued.user.firstName,
        baseUrl: env.BASE_URL,
      });
      // Fire-and-forget: falhas de SMTP não podem vazar na resposta (enumeração).
      // O mailer já trata erros internamente e loga via console.
      sendMail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }).catch((err) => console.error("[reset] sendMail crashed:", err));
    }
    // Resposta uniforme: não confirma se o email existe (previne enumeração).
    res.status(202).json({
      ok: true,
      message: "se a conta existir, enviaremos um link em instantes",
      ttlMinutes: RESET_TTL_MINUTES,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "email inválido" },
      });
    }
    next(err);
  }
});

router.post("/reset", authLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);
    await consumeResetToken(token, password);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ResetTokenError) {
      const status = err.code === "token_expired" ? 410 : 400;
      return res.status(status).json({
        error: { code: err.code, message: err.message },
      });
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
