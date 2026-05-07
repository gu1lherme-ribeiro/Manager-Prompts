// Render word-level diff entre dois textos plain. Carrega jsdiff via CDN no
// primeiro uso (lazy) — escopo do CSP já permite cdn.jsdelivr.net em script-src.
//
// Output: dois DocumentFragments — um pro pane "original" (com palavras
// removidas em strikethrough) e outro pro pane "melhorado" (com palavras
// adicionadas destacadas). Construído via DOM API (createElement +
// createTextNode), sem innerHTML — escape automático.

let _diffMod = null;

async function loadDiff() {
  if (_diffMod) return _diffMod;
  _diffMod = await import("https://cdn.jsdelivr.net/npm/diff@5.2.0/+esm");
  return _diffMod;
}

export async function renderWordDiff(originalText, improvedText) {
  const Diff = await loadDiff();
  const parts = Diff.diffWordsWithSpace(originalText || "", improvedText || "");

  const originalFragment = document.createDocumentFragment();
  const improvedFragment = document.createDocumentFragment();

  for (const part of parts) {
    if (part.added) {
      improvedFragment.appendChild(span("diff-added", part.value));
    } else if (part.removed) {
      originalFragment.appendChild(span("diff-removed", part.value));
    } else {
      originalFragment.appendChild(span("diff-equal", part.value));
      improvedFragment.appendChild(span("diff-equal", part.value));
    }
  }

  return { originalFragment, improvedFragment };
}

function span(cls, text) {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = text;
  return el;
}
