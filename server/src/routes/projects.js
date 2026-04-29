import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";

const router = Router();

const MAX_NAME_LEN = 80;

const nameSchema = z
  .string()
  .trim()
  .min(1, "nome obrigatório")
  .max(MAX_NAME_LEN, "nome muito longo")
  // Apenas letras/dígitos/espaço/-/_/. — protege contra control chars e barras
  // que confundem o vocabulário visual `/<projeto>` da UI.
  .regex(/^[\p{L}\p{N} _.\-]+$/u, "use letras, números, espaço, - ou _");

const createSchema = z.object({ name: nameSchema });
const patchSchema = z.object({ name: nameSchema });

const reorderSchema = z.object({
  ids: z
    .array(z.string().min(1).max(191))
    .min(1, "lista vazia")
    .max(500, "lista grande demais"),
});

const SORT_STEP = 10;

function serialize(project, promptCount = 0) {
  return {
    id: project.id,
    name: project.name,
    sortOrder: project.sortOrder,
    promptCount,
    updatedAt: project.updatedAt.getTime(),
    createdAt: project.createdAt.getTime(),
  };
}

router.use(requireUser);

router.get("/", async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const counts = await prisma.prompt.groupBy({
      by: ["projectId"],
      where: { userId: req.user.id },
      _count: { _all: true },
    });
    const countByProject = new Map();
    let unassigned = 0;
    for (const c of counts) {
      if (c.projectId === null) unassigned = c._count._all;
      else countByProject.set(c.projectId, c._count._all);
    }
    res.json({
      items: projects.map((p) => serialize(p, countByProject.get(p.id) || 0)),
      unassignedCount: unassigned,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    // Novo projeto vai pro fim do rail (max(sortOrder) + step). Se for o
    // primeiro do user, começa em SORT_STEP.
    const last = await prisma.project.findFirst({
      where: { userId: req.user.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? 0) + SORT_STEP;
    const project = await prisma.project.create({
      data: { userId: req.user.id, name: input.name, sortOrder },
    });
    res.status(201).json(serialize(project, 0));
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
        error: { code: "already_exists", message: "já existe um projeto com esse nome" },
      });
    }
    next(err);
  }
});

// Reorder em lote: cliente envia a ordem desejada (subset ou completo).
// Servidor reescreve sortOrder em SORT_STEP * (i+1) só para os ids enviados que
// pertencem ao user. Projetos não enviados mantêm seu sortOrder anterior — o
// cliente já usa fallback por name no servidor (orderBy: [sortOrder, name]),
// então um subset coerente continua funcional. Mais simples e idempotente.
//
// IMPORTANTE: precisa vir ANTES de `/:id` — a ordem de registro do Express
// resolve `/order` como id="order" se for registrada depois.
router.patch("/order", async (req, res, next) => {
  try {
    const { ids } = reorderSchema.parse(req.body);
    // Confirma ownership antes de mexer — evita reordenar projetos de outro
    // user injetando ids no array.
    const owned = await prisma.project.findMany({
      where: { userId: req.user.id, id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    const orderedOwned = ids.filter((id) => ownedSet.has(id));
    if (orderedOwned.length === 0) {
      return res.status(404).json({
        error: { code: "not_found", message: "nenhum projeto válido na lista" },
      });
    }
    await prisma.$transaction(
      orderedOwned.map((id, i) =>
        prisma.project.update({
          where: { id },
          data: { sortOrder: (i + 1) * SORT_STEP },
        }),
      ),
    );
    res.status(204).end();
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
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "projeto não encontrado" } });
    }
    const project = await prisma.project.update({
      where: { id: existing.id },
      data: { name: input.name },
    });
    const promptCount = await prisma.prompt.count({
      where: { userId: req.user.id, projectId: project.id },
    });
    res.json(serialize(project, promptCount));
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
        error: { code: "already_exists", message: "já existe um projeto com esse nome" },
      });
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    // FK ON DELETE SET NULL devolve os prompts pra "sem projeto" automaticamente.
    const result = await prisma.project.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (result.count === 0) {
      return res
        .status(404)
        .json({ error: { code: "not_found", message: "projeto não encontrado" } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
