import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";
import { ProviderError, messageFor } from "./anthropic.js";

export async function improveWithGemini({ originalTitle, originalContent, userInstruction, apiKey }) {
  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: buildSystemPrompt({ userInstruction }) }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: buildUserMessage({ title: originalTitle, content: originalContent }) },
        ],
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
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError("network", "falha de rede ao chamar gemini", { cause: err });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ProviderError(mapGeminiError(res.status), messageFor("gemini", data), {
      status: res.status,
      detail: data,
    });
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("\n").trim();
  if (!text) throw new ProviderError("empty", "gemini retornou resposta vazia");

  return {
    improvedContent: text,
    model,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
}

function mapGeminiError(status) {
  if (status === 400) return "invalid_request";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "provider_error";
}
