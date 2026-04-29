import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

export async function improveWithAnthropic({ originalTitle, originalContent, userInstruction, apiKey }) {
  const body = {
    model: env.ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt({ userInstruction }),
    messages: [
      {
        role: "user",
        content: buildUserMessage({ title: originalTitle, content: originalContent }),
      },
    ],
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError("network", "falha de rede ao chamar anthropic", { cause: err });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ProviderError(mapAnthropicError(res.status), messageFor("anthropic", data), {
      status: res.status,
      detail: data,
    });
  }

  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  if (!text) throw new ProviderError("empty", "anthropic retornou resposta vazia");

  return {
    improvedContent: text,
    model: data.model || env.ANTHROPIC_MODEL,
    usage: {
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
    },
  };
}

function mapAnthropicError(status) {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "provider_error";
}

export function messageFor(provider, data) {
  const msg = data?.error?.message || data?.message || "";
  return `${provider}: ${msg || "erro desconhecido"}`;
}

export class ProviderError extends Error {
  constructor(code, message, { status, detail, cause } = {}) {
    super(message);
    this.code = code;
    this.providerStatus = status;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}
