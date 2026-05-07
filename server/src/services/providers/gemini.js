import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";
import { ProviderError, messageFor } from "./anthropic.js";
import { parseSSEStream } from "./sseParser.js";

// Endpoint :streamGenerateContent com ?alt=sse devolve frames no mesmo formato
// do generateContent, um por chunk gerado. usageMetadata chega no último frame.
export async function* streamImproveWithGemini({
  originalTitle,
  originalContent,
  userInstruction,
  systemPromptOverride,
  apiKey,
  signal,
}) {
  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:streamGenerateContent?alt=sse`;

  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: buildSystemPrompt({ userInstruction, systemPromptOverride }) }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildUserMessage({ title: originalTitle, content: originalContent }) }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProviderError("network", "falha de rede ao chamar gemini", { cause: err });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ProviderError(mapGeminiError(res.status), messageFor("gemini", data), {
      status: res.status,
      detail: data,
    });
  }

  let inputTokens = null;
  let outputTokens = null;
  let receivedAny = false;

  for await (const frame of parseSSEStream(res.body)) {
    let payload;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      continue;
    }
    const parts = payload.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("");
    if (text) {
      receivedAny = true;
      yield { type: "chunk", text };
    }
    if (payload.usageMetadata) {
      if (payload.usageMetadata.promptTokenCount != null) {
        inputTokens = payload.usageMetadata.promptTokenCount;
      }
      if (payload.usageMetadata.candidatesTokenCount != null) {
        outputTokens = payload.usageMetadata.candidatesTokenCount;
      }
    }
  }

  if (!receivedAny) throw new ProviderError("empty", "gemini retornou resposta vazia");
  yield { type: "done", model, usage: { inputTokens, outputTokens } };
}

function mapGeminiError(status) {
  if (status === 400) return "invalid_request";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "provider_error";
}
