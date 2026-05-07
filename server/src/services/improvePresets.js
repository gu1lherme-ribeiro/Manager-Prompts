// Presets de improve por usuário — CRUD + resolução do preset usado em /improve.
// Limites: 20 presets/user; nome ≤80; systemPrompt ≤4000 chars.

import prisma from "../db/prisma.js";

export const MAX_PRESETS_PER_USER = 20;
export const MAX_NAME_LEN = 80;
export const MAX_SYSTEM_PROMPT_LEN = 4000;

export class PresetLimitError extends Error {
  constructor(message = "máximo 20 presets") {
    super(message);
    this.code = "limit_reached";
  }
}

export function serialize(preset) {
  return {
    id: preset.id,
    name: preset.name,
    systemPrompt: preset.systemPrompt,
    updatedAt: preset.updatedAt.getTime(),
    createdAt: preset.createdAt.getTime(),
  };
}

export async function listForUser(userId) {
  const items = await prisma.improvePreset.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
  return items.map(serialize);
}

export async function createForUser(userId, { name, systemPrompt }) {
  const count = await prisma.improvePreset.count({ where: { userId } });
  if (count >= MAX_PRESETS_PER_USER) {
    throw new PresetLimitError();
  }
  const preset = await prisma.improvePreset.create({
    data: { userId, name, systemPrompt },
  });
  return serialize(preset);
}

export async function updateForUser(userId, id, patch) {
  const existing = await prisma.improvePreset.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return null;
  const data = {};
  if (typeof patch.name === "string") data.name = patch.name;
  if (typeof patch.systemPrompt === "string") data.systemPrompt = patch.systemPrompt;
  const preset = await prisma.improvePreset.update({
    where: { id: existing.id },
    data,
  });
  return serialize(preset);
}

export async function deleteForUser(userId, id) {
  // FK ON DELETE SET NULL em User.defaultImprovePresetId tira o default
  // automaticamente se for esse o preset.
  const result = await prisma.improvePreset.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

// Resolve qual preset usar pra uma execução de improve.
// - requestedId presente: tenta carregar respeitando ownership; se inválido ou
//   de outro user, retorna null (caller usa fallback BASE — não bloqueia improve
//   por bug de UI).
// - requestedId ausente/null: lê User.defaultImprovePresetId.
// Retorna { id, name, systemPrompt } ou null.
export async function resolvePresetForUser({ userId, requestedId }) {
  if (requestedId) {
    const preset = await prisma.improvePreset.findFirst({
      where: { id: requestedId, userId },
      select: { id: true, name: true, systemPrompt: true },
    });
    return preset || null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultImprovePresetId: true },
  });
  const defaultId = user?.defaultImprovePresetId;
  if (!defaultId) return null;
  const preset = await prisma.improvePreset.findFirst({
    where: { id: defaultId, userId },
    select: { id: true, name: true, systemPrompt: true },
  });
  return preset || null;
}

// Seta (ou limpa) o defaultImprovePresetId do usuário. id null = remove default.
// Retorna true se ok, false se id passado não pertence ao user.
export async function setDefaultForUser(userId, id) {
  if (id === null || id === undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { defaultImprovePresetId: null },
    });
    return true;
  }
  const owned = await prisma.improvePreset.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { defaultImprovePresetId: id },
  });
  return true;
}
