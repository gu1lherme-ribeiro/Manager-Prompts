// Meta-prompt único — usado pelos 3 adapters.
// Mantido no servidor para evitar prompt-injection trivial por parte do usuário.

const BASE = `Você é um engenheiro de prompts sênior. Sua tarefa é melhorar o prompt fornecido, mantendo a intenção original do autor.

Objetivos de melhoria:
- clareza e remoção de ambiguidade;
- especificidade (detalhar quando vago);
- estrutura (seções como contexto, tarefa, formato de saída, restrições — quando fizer sentido);
- manter o idioma original do prompt.

Regras de saída:
- responda em TEXTO PURO (sem markdown extra, sem aspas envoltórias);
- NÃO inclua preâmbulos ("aqui está...", "segue o prompt...");
- NÃO comente o que foi alterado;
- retorne APENAS o prompt melhorado, pronto para uso.`;

export function buildSystemPrompt({ userInstruction } = {}) {
  const instr = (userInstruction || "").trim();
  if (!instr) return BASE;
  // truncamos a instrução do usuário para conter o raio de injection
  const safe = instr.slice(0, 500);
  return `${BASE}\n\nInstrução adicional do autor (aplicar quando consistente com os objetivos acima): ${safe}`;
}

export function buildUserMessage({ title, content }) {
  const t = (title || "").trim();
  const c = (content || "").trim();
  return `Título: ${t || "(sem título)"}\n\nPrompt:\n${c}`;
}
