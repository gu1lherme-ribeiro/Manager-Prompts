import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { improveLimiter } from "../middleware/rateLimit.js";
import { getStreamAdapter, ProviderError } from "../services/providers/index.js";
import { loadDecryptedKey, isValidProvider } from "../services/apiKeys.js";
import { resolvePresetForUser } from "../services/improvePresets.js";
import { htmlToPlainText } from "../utils/sanitizeContent.js";

const router = Router();

const bodySchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]).optional(),
  instruction: z.string().trim().max(500).optional(),
  // null = "ignorar preset, usa BASE"; ausente = "usa default do user"; string = preset específico
  presetId: z.string().min(1).max(191).nullable().optional(),
});

// Mapeamento ProviderError.code -> HTTP status para erros que ocorrem ANTES do
// primeiro chunk (quando ainda dá pra mandar status JSON em vez de SSE).
const STATUS_BY_PROVIDER_CODE = {
  invalid_key: 412,
  rate_limited: 429,
  provider_down: 502,
  network: 502,
  provider_error: 502,
  invalid_request: 400,
  empty: 502,
};

router.post("/:id/improve", requireUser, improveLimiter, async (req, res, next) => {
  let plaintextKey = null;
  let streamStarted = false;

  // upstream = AbortController repassado pro fetch do provider. Se o cliente
  // fechar a conexão (req.close), abortamos pra não pagar tokens à toa.
  const upstream = new AbortController();
  const onClose = () => {
    if (streamStarted && !res.writableEnded) upstream.abort();
  };
  req.on("close", onClose);

  const sse = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const startStream = () => {
    if (streamStarted) return;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Desabilita buffering em proxies (Nginx/Easypanel) — sem isso o stream
    // vira um lump único entregue só ao final.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    streamStarted = true;
  };

  try {
    const { provider: bodyProvider, instruction, presetId } = bodySchema.parse(req.body || {});
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

    // presetId === null → ignora default, usa BASE. undefined → usa default do user.
    // Se id inválido (não pertence ao user, deletado), resolvePreset devolve null e
    // a gente cai pro BASE silenciosamente — não bloqueia improve por bug de UI.
    const preset =
      presetId === null
        ? null
        : await resolvePresetForUser({ userId: req.user.id, requestedId: presetId });
    const systemPromptOverride = preset?.systemPrompt || null;

    const stream = getStreamAdapter(provider);
    const generator = stream({
      originalTitle: prompt.title,
      originalContent: htmlToPlainText(prompt.content),
      userInstruction: instruction,
      systemPromptOverride,
      apiKey: plaintextKey.toString("utf8"),
      signal: upstream.signal,
    });

    for await (const event of generator) {
      // O primeiro evento que chega marca o início do stream — atrasamos o
      // flushHeaders até aqui pra erros iniciais (401 do provider etc) ainda
      // poderem virar status JSON.
      startStream();
      if (res.writableEnded) break;
      if (event.type === "chunk") {
        sse("chunk", { text: event.text });
      } else if (event.type === "done") {
        sse("done", { provider, model: event.model, usage: event.usage });
      }
    }

    if (streamStarted && !res.writableEnded) res.end();
  } catch (err) {
    // Cliente cancelou — só fecha silenciosamente, sem evento de erro.
    if (err?.name === "AbortError") {
      if (streamStarted && !res.writableEnded) {
        try {
          res.end();
        } catch {
          /* socket já fechado */
        }
      }
      return;
    }

    if (err?.issues) {
      if (streamStarted) {
        if (!res.writableEnded) {
          sse("error", { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" });
          res.end();
        }
        return;
      }
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message || "entrada inválida" },
      });
    }

    if (err instanceof ProviderError) {
      if (streamStarted) {
        if (!res.writableEnded) {
          sse("error", { code: err.code, message: err.message });
          res.end();
        }
        return;
      }
      return res.status(STATUS_BY_PROVIDER_CODE[err.code] || 502).json({
        error: { code: err.code, message: err.message },
      });
    }

    console.error("[improve]", err);
    if (streamStarted) {
      if (!res.writableEnded) {
        try {
          sse("error", { code: "internal_error", message: "erro interno" });
          res.end();
        } catch {
          /* socket já fechado */
        }
      }
      return;
    }
    return next(err);
  } finally {
    req.off("close", onClose);
    if (plaintextKey) plaintextKey.fill(0);
  }
});

export default router;
