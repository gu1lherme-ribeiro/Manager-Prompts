import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { improveLimiter } from "../middleware/rateLimit.js";
import { getAdapter, ProviderError } from "../services/providers/index.js";
import { loadDecryptedKey, isValidProvider } from "../services/apiKeys.js";
import { htmlToPlainText } from "../utils/sanitizeContent.js";

const router = Router();

const bodySchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]).optional(),
  instruction: z.string().trim().max(500).optional(),
});

router.post("/:id/improve", requireUser, improveLimiter, async (req, res, next) => {
  let plaintextKey = null;
  try {
    const { provider: bodyProvider, instruction } = bodySchema.parse(req.body || {});
    const provider = bodyProvider || req.user.defaultProvider;
    if (!provider) {
      return res.status(400).json({
        error: {
          code: "no_provider",
          message: "nenhum provider selecionado — defina um default em /settings",
        },
      });
    }
    if (!isValidProvider(provider)) {
      return res.status(400).json({
        error: { code: "invalid_provider", message: "provider inválido" },
      });
    }

    const prompt = await prisma.prompt.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!prompt) {
      return res.status(404).json({
        error: { code: "not_found", message: "prompt não encontrado" },
      });
    }

    plaintextKey = await loadDecryptedKey({ userId: req.user.id, provider });
    if (!plaintextKey) {
      return res.status(412).json({
        error: {
          code: "missing_key",
          message: `sem chave configurada para ${provider} — cadastre em /settings`,
        },
      });
    }

    const adapter = getAdapter(provider);
    const result = await adapter({
      originalTitle: prompt.title,
      originalContent: htmlToPlainText(prompt.content),
      userInstruction: instruction,
      apiKey: plaintextKey.toString("utf8"),
    });

    return res.json({
      provider,
      model: result.model,
      improvedContent: result.improvedContent,
      usage: result.usage,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }
    if (err instanceof ProviderError) {
      const statusByCode = {
        invalid_key: 412,
        rate_limited: 429,
        provider_down: 502,
        network: 502,
        provider_error: 502,
        invalid_request: 400,
        empty: 502,
      };
      return res.status(statusByCode[err.code] || 502).json({
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  } finally {
    if (plaintextKey) plaintextKey.fill(0);
  }
});

export default router;
