import { env } from "../../config/env.js";
import { buildSystemPrompt, buildUserMessage } from "./systemPrompt.js";
import { parseSSEStream } from "./sseParser.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

// Async generator que emite { type: "chunk", text } durante a resposta e
// termina com { type: "done", model, usage }. Aceita AbortSignal pra cancelar
// mid-flight quando o cliente fecha a conexão.
export async function* streamImproveWithAnthropic({
  originalTitle,
  originalContent,
  userInstruction,
  systemPromptOverride,
  apiKey,
  signal,
}) {
  const body = {
    model: env.ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    system: buildSystemPrompt({ userInstruction, systemPromptOverride }),
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
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProviderError("network", "falha de rede ao chamar anthropic", { cause: err });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ProviderError(mapAnthropicError(res.status), messageFor("anthropic", data), {
      status: res.status,
      detail: data,
    });
  }

  let model = env.ANTHROPIC_MODEL;
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
    const t = payload.type;
    if (t === "message_start") {
      if (payload.message?.model) model = payload.message.model;
      if (payload.message?.usage?.input_tokens != null) {
        inputTokens = payload.message.usage.input_tokens;
      }
      if (payload.message?.usage?.output_tokens != null) {
        outputTokens = payload.message.usage.output_tokens;
      }
    } else if (t === "content_block_delta" && payload.delta?.type === "text_delta") {
      const text = payload.delta.text || "";
      if (text) {
        receivedAny = true;
        yield { type: "chunk", text };
      }
    } else if (t === "message_delta" && payload.usage?.output_tokens != null) {
      outputTokens = payload.usage.output_tokens;
    } else if (t === "error") {
      throw new ProviderError("provider_error", `anthropic: ${payload.error?.message || "erro"}`, {
        detail: payload,
      });
    }
  }

  if (!receivedAny) throw new ProviderError("empty", "anthropic retornou resposta vazia");
  yield { type: "done", model, usage: { inputTokens, outputTokens } };
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
