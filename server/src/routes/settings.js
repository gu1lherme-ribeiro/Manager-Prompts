import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import {
  VALID_PROVIDERS,
  isValidProvider,
  listApiKeyStatus,
  saveApiKey,
  deleteApiKey,
} from "../services/apiKeys.js";
import { verifyPassword } from "../services/passwords.js";
import {
  createChallenge,
  consumeChallenge,
  MfaChallengeError,
  MFA_TTL_MIN,
  MFA_MAX_ATTEMPTS,
} from "../services/mfaChallenges.js";
import {
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevicesForUser,
} from "../services/trustedDevices.js";
import { renderMfaChallengeEmail } from "../services/emailTemplates/mfaChallenge.js";
import { sendMail } from "../services/mailer.js";
import { env } from "../config/env.js";

const router = Router();
router.use(requireUser);

function providerGuard(req, res, next) {
  if (!isValidProvider(req.params.provider)) {
    return res.status(400).json({
      error: { code: "invalid_provider", message: "provider inválido" },
    });
  }
  next();
}

router.get("/api-keys", async (req, res, next) => {
  try {
    res.json(await listApiKeyStatus(req.user.id));
  } catch (err) {
    next(err);
  }
});

const putKeySchema = z.object({
  key: z.string().trim().min(10, "chave muito curta").max(500, "chave muito longa"),
});

router.put("/api-keys/:provider", providerGuard, async (req, res, next) => {
  try {
    const { key } = putKeySchema.parse(req.body);
    const status = await saveApiKey({
      userId: req.user.id,
      provider: req.params.provider,
      plaintextKey: key,
    });
    res.json(status);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    if (err?.code === "encryption_disabled") {
      return res.status(503).json({
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
});

router.delete("/api-keys/:provider", providerGuard, async (req, res, next) => {
  try {
    await deleteApiKey({
      userId: req.user.id,
      provider: req.params.provider,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const patchDefaultSchema = z.object({
  provider: z.enum(VALID_PROVIDERS).nullable(),
});

const mfaEnableStep1Schema = z.object({
  password: z.string().min(8).max(200),
});
const mfaEnableStep2Schema = z.object({
  challengeId: z.string().min(8).max(40),
  code: z.string().regex(/^\d{6}$/),
});
const mfaDisableSchema = z.object({
  password: z.string().min(8).max(200),
});

function mapMfaErrorStatus(code) {
  if (code === "mfa_expired" || code === "mfa_used") return 410;
  if (code === "mfa_too_many_attempts" || code === "mfa_resend_cooldown") return 429;
  if (code === "mfa_not_configured") return 503;
  return 400;
}

router.patch("/default-provider", async (req, res, next) => {
  try {
    const { provider } = patchDefaultSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { defaultProvider: provider },
      select: { defaultProvider: true },
    });
    res.json({ defaultProvider: user.defaultProvider });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    next(err);
  }
});

// MFA settings -------------------------------------------------------------

router.get("/mfa", requireUser, async (req, res, next) => {
  try {
    const settings = await prisma.mfaSettings.findUnique({ where: { userId: req.user.id } });
    const devices = await listTrustedDevices(req.user.id);
    res.json({
      enabled: !!settings?.enabled,
      enabledAt: settings?.enabledAt || null,
      trustedDevices: devices.map((d) => ({
        id: d.id,
        userAgent: d.userAgent,
        ip: d.ip,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Enable é two-step: primeiro a senha é revalidada e o código vai por email,
// depois o user confirma o código. Garante que o user RECEBE emails antes
// de bloquear logins futuros (anti-lockout).
router.post("/mfa/enable", requireUser, async (req, res, next) => {
  try {
    const body = req.body || {};

    if ("challengeId" in body) {
      // Step 2 — validar código
      const { challengeId, code } = mfaEnableStep2Schema.parse(body);
      try {
        const { userId } = await consumeChallenge(challengeId, code);
        if (userId !== req.user.id) {
          return res.status(400).json({ error: { code: "mfa_invalid", message: "código inválido" } });
        }
      } catch (err) {
        if (err instanceof MfaChallengeError) {
          return res.status(mapMfaErrorStatus(err.code))
            .json({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }

      const now = new Date();
      await prisma.mfaSettings.upsert({
        where: { userId: req.user.id },
        update: { enabled: true, enabledAt: now },
        create: { userId: req.user.id, enabled: true, enabledAt: now },
      });
      return res.json({ enabled: true, enabledAt: now });
    }

    // Step 1 — revalidar senha + criar challenge
    const { password } = mfaEnableStep1Schema.parse(body);
    const ok = await verifyPassword(req.user.passwordHash, password);
    if (!ok) {
      return res.status(401).json({ error: { code: "invalid_credentials", message: "senha incorreta" } });
    }

    const existing = await prisma.mfaSettings.findUnique({ where: { userId: req.user.id } });
    if (existing?.enabled) {
      return res.status(409).json({ error: { code: "mfa_already_enabled", message: "MFA já está ativo" } });
    }

    let issued;
    try {
      issued = await createChallenge({
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch (err) {
      if (err instanceof MfaChallengeError) {
        return res.status(mapMfaErrorStatus(err.code))
          .json({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }

    const mail = renderMfaChallengeEmail({
      to: req.user.email,
      code: issued.code,
      ttlMinutes: MFA_TTL_MIN,
      firstName: req.user.firstName,
      baseUrl: env.BASE_URL,
      challengePreview: issued.challengeId.slice(0, 7),
    });
    sendMail({ to: req.user.email, subject: mail.subject, html: mail.html, text: mail.text })
      .catch((err) => console.error("[mfa:enable] sendMail crashed:", err));

    res.status(202).json({
      step: 1,
      challengeId: issued.challengeId,
      ttlSeconds: MFA_TTL_MIN * 60,
      attemptsLeft: MFA_MAX_ATTEMPTS,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

router.post("/mfa/disable", requireUser, async (req, res, next) => {
  try {
    const { password } = mfaDisableSchema.parse(req.body);
    const ok = await verifyPassword(req.user.passwordHash, password);
    if (!ok) {
      return res.status(401).json({ error: { code: "invalid_credentials", message: "senha incorreta" } });
    }
    const existing = await prisma.mfaSettings.findUnique({ where: { userId: req.user.id } });
    if (!existing?.enabled) {
      return res.status(409).json({ error: { code: "mfa_not_enabled", message: "MFA não está ativo" } });
    }
    await prisma.mfaSettings.update({
      where: { userId: req.user.id },
      data: { enabled: false, enabledAt: null },
    });
    await revokeAllTrustedDevicesForUser(req.user.id);
    res.json({ enabled: false });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    next(err);
  }
});

// Atenção à ordem: rota específica antes da paramétrica (Express resolve por
// declaração — /trusted-devices cairia em /trusted-devices/:id="trusted-devices").
router.delete("/mfa/trusted-devices", requireUser, async (req, res, next) => {
  try {
    const n = await revokeAllTrustedDevicesForUser(req.user.id);
    res.json({ revoked: n });
  } catch (err) {
    next(err);
  }
});

router.delete("/mfa/trusted-devices/:id", requireUser, async (req, res, next) => {
  try {
    const id = req.params.id;
    const n = await revokeTrustedDevice(id, req.user.id);
    if (n === 0) {
      return res.status(404).json({ error: { code: "not_found", message: "dispositivo não encontrado" } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
