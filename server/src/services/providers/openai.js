import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";
import { ProviderError, messageFor } from "./anthropic.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export async function improveWithOpenAI({ originalTitle, originalContent, userInstruction, apiKey }) {
  const body = {
    model: env.OPENAI_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt({ userInstruction }) },
      {
        role: "user",
        content: buildUserMessage({ title: originalTitle, content: originalContent }),
      },
    ],
    temperature: 0.7,
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError("network", "falha de rede ao chamar openai", { cause: err });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ProviderError(mapOpenAIError(res.status), messageFor("openai", data), {
      status: res.status,
      detail: data,
    });
  }

  const text = (data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new ProviderError("empty", "openai retornou resposta vazia");

  return {
    improvedContent: text,
    model: data.model || env.OPENAI_MODEL,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    },
  };
}

function mapOpenAIError(status) {
  if (status === 401) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "provider_error";
}
