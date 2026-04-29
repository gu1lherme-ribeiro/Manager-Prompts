import { Router } from "express";
import { z } from "zod";
import prisma from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { newPromptId } from "../utils/id.js";
import {
  sanitizePromptContent,
  htmlToPlainText,
} from "../utils/sanitizeContent.js";
import { MAX_CONTENT_BYTES, MAX_TITLE_LEN } from "../utils/contentSchema.js";

const router = Router();

const titleSchema = z
  .string()
  .trim()
  .min(1, "título obrigatório")
  .max(MAX_TITLE_LEN, "título muito longo");

const contentSchema = z
  .string()
  .min(1, "conteúdo obrigatório")
  .refine(
    (s) => Buffer.byteLength(s, "utf8") <= MAX_CONTENT_BYTES,
    "conteúdo excede 256KB",
  );

// `projectId` em create/patch aceita string (id) ou null (desassociar).
// `undefined` no patch = não mexer.
const projectIdField = z
  .union([z.string().min(1).max(191), z.null()])
  .optional();

const createSchema = z.object({
  title: titleSchema,
  content: contentSchema,
  projectId: projectIdField,
});
const patchSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    projectId: projectIdField,
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.content !== undefined ||
      v.projectId !== undefined,
    "nada a atualizar",
  );

// `projectId` na query aceita: omitido (sem filtro), id (filtra por projeto)
// ou "none" (apenas prompts sem projeto). Vazio é tratado como omitido.
const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  projectId: z.string().trim().max(191).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

const PREVIEW_LEN = 200;

function serializeList(prompt) {
  return {
    id: prompt.id,
    title: prompt.title,
    projectId: prompt.projectId,
    contentPreview: htmlToPlainText(prompt.content).slice(0, PREVIEW_LEN),
    wordCount: countWords(htmlToPlainText(prompt.content)),
    updatedAt: prompt.updatedAt.getTime(),
    createdAt: prompt.createdAt.getTime(),
  };
}

function serializeFull(prompt) {
  return {
    id: prompt.id,
    title: prompt.title,
    projectId: prompt.projectId,
    content: prompt.content,
    updatedAt: prompt.updatedAt.getTime(),
    createdAt: prompt.createdAt.getTime(),
  };
}

function countWords(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

// Garante que o projeto pertence ao usuário antes de associar um prompt a ele.
// Retorna `{ ok, projectId }` (null = desassociar) ou `{ ok: false, error }`.
async function resolveProjectForUser(userId, raw) {
  if (raw === undefined) return { ok: true, projectId: undefined };
  if (raw === null) return { ok: true, projectId: null };
  const exists = await prisma.project.findFirst({
    where: { id: raw, userId },
    select: { id: true },
  });
  if (!exists) {
    return {
      ok: false,
      error: { code: "not_found", message: "projeto não encontrado" },
      status: 400,
    };
  }
  return { ok: true, projectId: exists.id };
}

router.use(requireUser);

router.get("/", async (req, res, next) => {
  try {
    const { search, limit, projectId } = listQuerySchema.parse(req.query);
    const where = {
      userId: req.user.id,
      ...(search ? { title: { contains: search } } : {}),
    };
    if (projectId === "none") {
      where.projectId = null;
    } else if (projectId) {
      where.projectId = projectId;
    }
    const items = await prisma.prompt.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    res.json({ items: items.map(serializeList) });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const prompt = await prisma.prompt.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!prompt) {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "prompt não encontrado" } });
    }
    res.json(serializeFull(prompt));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const resolved = await resolveProjectForUser(req.user.id, input.projectId);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error });
    }
    const content = sanitizePromptContent(input.content);
    const prompt = await prisma.prompt.create({
      data: {
        id: newPromptId(),
        userId: req.user.id,
        title: input.title,
        content,
        projectId: resolved.projectId ?? null,
      },
    });
    res.status(201).json(serializeFull(prompt));
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = patchSchema.parse(req.body);
    const existing = await prisma.prompt.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "prompt não encontrado" } });
    }
    const resolved = await resolveProjectForUser(req.user.id, input.projectId);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error });
    }
    const data = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = sanitizePromptContent(input.content);
    if (resolved.projectId !== undefined) data.projectId = resolved.projectId;
    const prompt = await prisma.prompt.update({
      where: { id: existing.id },
      data,
    });
    res.json(serializeFull(prompt));
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({
        error: { code: "invalid_input", message: err.issues[0]?.message },
      });
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await prisma.prompt.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (result.count === 0) {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "prompt não encontrado" } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
