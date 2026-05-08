// Cliente SSE do improve. Não usa EventSource porque precisamos de POST + CSRF
// header, que EventSource (GET-only, sem headers) não suporta. Em vez disso,
// fetch + ReadableStream + parser SSE manual.

import { readCookie } from "/static/js/api.js?v=20260508b";

const CSRF_COOKIE = "mp_csrf";

export async function streamImprove({
  promptId,
  provider,
  instruction,
  presetId,
  signal,
  onChunk,
  onDone,
  onError,
  onAbort,
}) {
  const csrf = readCookie(CSRF_COOKIE);
  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (csrf) headers["x-csrf-token"] = csrf;

  const body = { provider };
  if (instruction) body.instruction = instruction;
  // null = "ignora preset, usa BASE". string = "usa esse preset".
  // undefined (omitido) = "servidor decide com defaultImprovePresetId".
  if (presetId !== undefined) body.presetId = presetId;

  let res;
  try {
    res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/improve`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      onAbort?.();
      return;
    }
    onError?.({ code: "network", message: "falha de rede" });
    return;
  }

  // Erros pré-stream (validação, sem chave, rate limit) chegam como JSON com
  // status code — não como text/event-stream.
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || !ct.includes("text/event-stream")) {
    let payload = {};
    try {
      payload = await res.json();
    } catch {
      /* corpo não-json */
    }
    const e = payload?.error || {};
    onError?.({
      code: e.code || `http_${res.status}`,
      message: e.message || `erro ${res.status}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = parseFrame(frame);
        if (parsed) dispatch(parsed, { onChunk, onDone, onError });
      }
    }
    if (buffer.trim()) {
      const parsed = parseFrame(buffer);
      if (parsed) dispatch(parsed, { onChunk, onDone, onError });
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      onAbort?.();
      return;
    }
    onError?.({ code: "stream_read", message: "erro ao ler stream" });
  }
}

function parseFrame(frame) {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data += (data ? "\n" : "") + value;
  }
  if (!data) return null;
  return { event, data };
}

function dispatch({ event, data }, { onChunk, onDone, onError }) {
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  if (event === "chunk") onChunk?.(payload.text || "");
  else if (event === "done") onDone?.({ model: payload.model, usage: payload.usage, provider: payload.provider });
  else if (event === "error") onError?.({ code: payload.code, message: payload.message });
}
