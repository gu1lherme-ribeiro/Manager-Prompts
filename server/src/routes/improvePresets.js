import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "../middleware/auth.js";
import {
  listForUser,
  createForUser,
  updateForUser,
  deleteForUser,
  PresetLimitError,
  MAX_NAME_LEN,
  MAX_SYSTEM_PROMPT_LEN,
} from "../services/improvePresets.js";
import prisma from "../db/prisma.js";
import { BASE as BASE_SYSTEM_PROMPT } from "../services/providers/systemPrompt.js";

const router = Router();

// Mesmo regex de Project: letras unicode, números, espaço, _ . -
const nameSchema = z
  .string()
  .trim()
  .min(1, "nome obrigatório")
  .max(MAX_NAME_LEN, "nome muito longo")
  .regex(/^[\p{L}\p{N} _.\-]+$/u, "use letras, números, espaço, - ou _");

const systemPromptSchema = z
  .string()
  .trim()
  .min(1, "system prompt obrigatório")
  .max(MAX_SYSTEM_PROMPT_LEN, "system prompt muito longo");

const createSchema = z.object({
  name: nameSchema,
  systemPrompt: systemPromptSchema,
});

const patchSchema = z
  .object({
    name: nameSchema.optional(),
    systemPrompt: systemPromptSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.systemPrompt !== undefined, {
    message: "nada pra atualizar",
  });

router.use(requireUser);

router.get("/", async (req, res, next) => {
  try {
    const presets = await listForUser(req.user.id);
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { defaultImprovePresetId: true },
    });
    res.json({
      items: presets,
      template: BASE_SYSTEM_PROMPT,
      defaultId: me?.defaultImprovePresetId || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const preset = await createForUser(req.user.id, input);
    res.status(201).json(preset);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    if (err instanceof PresetLimitError) {
      return res.status(400).json({
        error: { code: err.code, message: err.message },
      });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({
        error: { code: "already_exists", message: "já existe um preset com esse nome" },
      });
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = patchSchema.parse(req.body);
    const preset = await updateForUser(req.user.id, req.params.id, input);
    if (!preset) {
      return res.status(404).json({
        error: { code: "not_found", message: "preset não encontrado" },
      });
    }
    res.json(preset);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({
        error: { code: "already_exists", message: "já existe um preset com esse nome" },
      });
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await deleteForUser(req.user.id, req.params.id);
    if (!ok) {
      return res.status(404).json({
        error: { code: "not_found", message: "preset não encontrado" },
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
