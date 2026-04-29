import sanitizeHtml from "sanitize-html";
import { ALLOWED_TAGS } from "./contentSchema.js";

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {},
  allowedSchemes: [],
  allowedSchemesByTag: {},
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true,
};

export function sanitizePromptContent(html) {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, OPTIONS);
}

export function htmlToPlainText(html) {
  // strip-all-tags para contentPreview / envio ao LLM.
  return sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
