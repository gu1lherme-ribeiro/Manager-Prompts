// Lista de tags/atributos permitidos em prompt.content.
// Compartilhada entre sanitização do servidor e da UI.
export const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "u", "s",
  "br", "p", "div", "span",
  "ul", "ol", "li",
  "pre", "code", "blockquote",
  "h1", "h2", "h3", "h4",
];

export const ALLOWED_ATTR = []; // zero atributos — nada de href, style, class, id

export const MAX_CONTENT_BYTES = 256 * 1024; // 256KB
export const MAX_TITLE_LEN = 255;
