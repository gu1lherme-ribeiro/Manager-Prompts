import { improveWithAnthropic } from "./anthropic.js";
import { improveWithOpenAI } from "./openai.js";
import { improveWithGemini } from "./gemini.js";

export { ProviderError } from "./anthropic.js";

const ADAPTERS = {
  anthropic: improveWithAnthropic,
  openai: improveWithOpenAI,
  gemini: improveWithGemini,
};

export function getAdapter(provider) {
  return ADAPTERS[provider] || null;
}
