import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";
import { ProviderError, messageFor } from "./anthropic.js";
import { parseSSEStream } from "./sseParser.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

// include_usage: true entrega o uso no último frame (`choices` vazio).
export async function* streamImproveWithOpenAI({
  originalTitle,
  originalContent,
  userInstruction,
  systemPromptOverride,
  apiKey,
  signal,
}) {
  const body = {
    model: env.OPENAI_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt({ userInstruction, systemPromptOverride }) },
      {
        role: "user",
        content: buildUserMessage({ title: originalTitle, content: originalContent }),
      },
    ],
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProviderError("network", "falha de rede ao chamar openai", { cause: err });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ProviderError(mapOpenAIError(res.status), messageFor("openai", data), {
      status: res.status,
      detail: data,
    });
  }

  let model = env.OPENAI_MODEL;
  let inputTokens = null;
  let outputTokens = null;
  let receivedAny = false;

  for await (const frame of parseSSEStream(res.body)) {
    if (frame.data === "[DONE]") break;
    let payload;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      continue;
    }
    if (payload.model) model = payload.model;
    const delta = payload.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      receivedAny = true;
      yield { type: "chunk", text: delta };
    }
    if (payload.usage) {
      if (payload.usage.prompt_tokens != null) inputTokens = payload.usage.prompt_tokens;
      if (payload.usage.completion_tokens != null) outputTokens = payload.usage.completion_tokens;
    }
  }

  if (!receivedAny) throw new ProviderError("empty", "openai retornou resposta vazia");
  yield { type: "done", model, usage: { inputTokens, outputTokens } };
}

function mapOpenAIError(status) {
  if (status === 401) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "provider_error";
}
