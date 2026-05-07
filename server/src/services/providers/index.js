import { streamImproveWithAnthropic } from "./anthropic.js";
import { streamImproveWithOpenAI } from "./openai.js";
import { streamImproveWithGemini } from "./gemini.js";

export { ProviderError } from "./anthropic.js";

const STREAM_ADAPTERS = {
  anthropic: streamImproveWithAnthropic,
  openai: streamImproveWithOpenAI,
  gemini: streamImproveWithGemini,
};

export function getStreamAdapter(provider) {
  return STREAM_ADAPTERS[provider] || null;
}
