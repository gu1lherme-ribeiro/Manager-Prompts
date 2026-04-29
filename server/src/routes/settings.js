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

export default router;
