// Wrapper único sobre DOMPurify (carregado via CDN no <head>).
// Mantém a mesma lista de tags que o servidor (contentSchema.js).
const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "u", "s",
  "br", "p", "div", "span",
  "ul", "ol", "li",
  "pre", "code", "blockquote",
  "h1", "h2", "h3", "h4",
];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

export function sanitizeContent(html) {
  if (typeof html !== "string") return "";
  if (typeof window === "undefined" || !window.DOMPurify) {
    // Defesa: se DOMPurify não carregou, devolve escapado em vez de HTML bruto.
    return escapeHtmlFallback(html);
  }
  return window.DOMPurify.sanitize(html, CONFIG);
}

function escapeHtmlFallback(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
