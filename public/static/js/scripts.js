import { api, endpoints, ApiError } from "/static/js/api.js?v=20260504d";
import { sanitizeContent } from "/static/js/sanitize.js?v=20260504d";
import { startIdleWatcher } from "/static/js/idle.js?v=20260504d";

const THEME_KEY = "prompts_theme";
const LEGACY_STORAGE_KEY = "prompts_storage";
const UNDO_WINDOW_MS = 5000;
const TOAST_DEFAULT_MS = 2400;
const HASH_LEN = 6;

const PROJECT_FILTER_KEY = "prompts_active_project";

const state = {
  prompts: [], // {id, title, projectId, contentPreview, wordCount, updatedAt}
  contentCache: new Map(), // id -> content HTML (carregado sob demanda)
  selectedId: null,
  pendingDelete: null,
  currentUser: null,
  projects: [], // [{id, name, promptCount, updatedAt}]
  unassignedCount: 0,
  // Filtro ativo: { type: "all" | "none" | "id", id?: string }
  // Persistido em localStorage pra a sidebar voltar pro mesmo recorte que o
  // user deixou — é a "pasta atual" que ele estava trabalhando.
  activeProject: readActiveProjectFilter(),
  // Estado da apresentação do rail. Não persiste — recolher é o default em
  // toda nova sessão pra a sidebar começar limpa.
  projectsExpanded: false,
  projectsFilter: "",
};

// Limites de exibição do rail. Acima de FILTER_THRESHOLD aparece o input de
// filtro; acima de COLLAPSE_LIMIT a lista é truncada com disclosure "ver todos".
const PROJECTS_FILTER_THRESHOLD = 6;
const PROJECTS_COLLAPSE_LIMIT = 5;

function readActiveProjectFilter() {
  try {
    const raw = localStorage.getItem(PROJECT_FILTER_KEY);
    if (!raw) return { type: "all" };
    const parsed = JSON.parse(raw);
    if (parsed?.type === "id" && typeof parsed.id === "string" && parsed.id) {
      return { type: "id", id: parsed.id };
    }
    if (parsed?.type === "none") return { type: "none" };
    return { type: "all" };
  } catch {
    return { type: "all" };
  }
}

function writeActiveProjectFilter(filter) {
  try {
    localStorage.setItem(PROJECT_FILTER_KEY, JSON.stringify(filter));
  } catch {
    /* storage cheio / desabilitado — ok, perde só persistência */
  }
}

const elements = {
  app: document.querySelector(".app"),
  sidebar: document.getElementById("sidebar"),
  btnOpen: document.getElementById("btn-open"),
  btnCollapse: document.getElementById("btn-collapse"),
  btnNew: document.getElementById("btn-new"),
  btnSave: document.getElementById("btn-save"),
  btnCopy: document.getElementById("btn-copy"),
  search: document.getElementById("search-input"),
  list: document.getElementById("prompt-list"),
  tocEmpty: document.getElementById("toc-empty"),
  tocEmptySearch: document.getElementById("toc-empty-search"),
  wordmarkCount: document.getElementById("wordmark-count"),
  mainMeta: document.getElementById("main-meta"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  promptTitle: document.getElementById("prompt-title"),
  promptContent: document.getElementById("prompt-content"),
  titleWrapper: document.getElementById("title-wrapper"),
  contentWrapper: document.getElementById("content-wrapper"),
  cmdMenu: document.getElementById("cmd-menu"),
  cmdMenuList: document.getElementById("cmd-menu-list"),
  toastRegion: document.getElementById("toast-region"),
  themeOptions: document.querySelectorAll(".theme-option"),
  btnLogout: document.getElementById("btn-logout"),
  userDisplay: document.getElementById("user-display"),
  btnImprove: document.getElementById("btn-improve"),
  improvePopover: document.getElementById("improve-popover"),
  improveOverlay: document.getElementById("improve-overlay"),
  improveOverlayClose: document.getElementById("improve-overlay-close"),
  improveOverlayRun: document.getElementById("improve-overlay-run"),
  improveOverlayApply: document.getElementById("improve-overlay-apply"),
  improveOverlayDiscard: document.getElementById("improve-overlay-discard"),
  improveOverlayInstruction: document.getElementById("improve-instruction"),
  improveOverlayOriginal: document.getElementById("improve-overlay-original"),
  improveOverlayImproved: document.getElementById("improve-overlay-improved"),
  improveOverlayMeta: document.getElementById("improve-overlay-meta"),
  improveOverlayHeading: document.querySelector("#improve-overlay-title [data-slot='heading']"),
  improveOverlayProviders: document.getElementById("improve-overlay-providers"),
  improveOverlayResultLabel: document.querySelector(
    "#improve-overlay .improve-overlay-pane--result [data-slot='result-label']",
  ),
  legacyBanner: document.getElementById("legacy-banner"),
  legacyBannerText: document.getElementById("legacy-banner-text"),
  legacyImport: document.getElementById("legacy-import"),
  legacyDiscard: document.getElementById("legacy-discard"),
  projectsList: document.getElementById("projects-list"),
  btnAddProject: document.getElementById("btn-add-project"),
  projectsNew: document.getElementById("projects-new"),
  projectsNewInput: document.getElementById("projects-new-input"),
  projectsFilter: document.getElementById("projects-filter"),
  projectsFilterInput: document.getElementById("projects-filter-input"),
  projectsDisclosure: document.getElementById("projects-disclosure"),
  projectsDisclosureText: document.getElementById("projects-disclosure-text"),
};

const improveState = {
  provider: null,
  originalText: "",
  improvedText: null,
  loading: false,
};

/* --------------------------------------------------------------------------
   Texto / formato
   -------------------------------------------------------------------------- */

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortHash(id) {
  if (!id) return "";
  return String(id).slice(-HASH_LEN);
}

function timeAgoCompact(ts) {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}

function wordCount(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatItemCount(n) {
  if (n === 0) return "0 itens";
  if (n === 1) return "1 item";
  return `${n} itens`;
}

/* --------------------------------------------------------------------------
   Editor — placeholders e meta
   -------------------------------------------------------------------------- */

function updateEditableWrapperState(element, wrapper) {
  // Considera vazio só quando textContent é "" e o DOM interno é vazio ou um
  // único <br> — Chrome insere <br> automaticamente em contenteditable vazio
  // ao focar/digitar e o textContent permanece "" mesmo com o <br>.
  const text = element.textContent.replace(/​/g, "");
  const html = element.innerHTML.trim().toLowerCase();
  const isEmpty =
    !text.trim() && (html === "" || html === "<br>" || html === "<br/>");
  wrapper.classList.toggle("is-empty", isEmpty);
}

function updateAllEditableStates() {
  updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
  updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
}

function attachEditableHandlers() {
  // MutationObserver pega qualquer mudança no DOM (input, paste, execCommand
  // do slash menu, IME) — mais robusto que escutar só "input", que em alguns
  // casos não atualiza o placeholder no primeiro caractere.
  const titleObs = new MutationObserver(() => {
    updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
    updateMainMeta();
  });
  titleObs.observe(elements.promptTitle, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  const contentObs = new MutationObserver(() => {
    updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
    updateMainMeta();
  });
  contentObs.observe(elements.promptContent, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  // input ainda alimenta o slash menu (precisa rodar após cada keystroke,
  // mesmo sem mutação visível do DOM).
  elements.promptContent.addEventListener("input", () => {
    evaluateCmdMenu();
  });

  // Paste sem estilos da origem — evita texto invisível (preto em tema escuro etc.).
  elements.promptTitle.addEventListener("paste", handleTitlePaste);
  elements.promptContent.addEventListener("paste", handleContentPaste);

  // Clique no espaço entre/ao redor dos blocos (margens, gaps, padding, área
  // abaixo do último bloco). Sem isso, o navegador às vezes não move o caret
  // ou o joga pro último text node — que pode estar dentro de um <pre>/<h1>.
  elements.promptContent.addEventListener("mousedown", (event) => {
    if (event.target !== elements.promptContent) return;
    handleEditorPaddingClick(event);
  });

  attachCmdMenuHandlers();
}

function handleEditorPaddingClick(event) {
  const root = elements.promptContent;
  const last = root.lastElementChild;

  // Editor vazio: default focus + placeholder visível.
  if (!last) {
    root.focus();
    return;
  }

  // Clique abaixo de todo o conteúdo: garante <p> no fim e foca lá.
  if (event.clientY > last.getBoundingClientRect().bottom) {
    event.preventDefault();
    focusTrailingParagraph();
    return;
  }

  // Clique entre blocos / margens laterais: posiciona caret no ponto exato.
  const range = caretRangeAtPoint(event.clientX, event.clientY);
  if (range && root.contains(range.startContainer)) {
    event.preventDefault();
    root.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function caretRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

function focusTrailingParagraph() {
  const root = elements.promptContent;
  const last = root.lastElementChild;

  // Editor vazio: deixa o comportamento default agir. O placeholder continua
  // visível até o user digitar — não queremos criar <p> só pelo clique.
  if (!last) {
    root.focus();
    return;
  }

  let target;
  if (last.tagName === "P") {
    target = last;
  } else {
    // pre / blockquote / h* / ul / ol → cria <p> editável depois.
    target = document.createElement("p");
    target.appendChild(document.createElement("br"));
    root.appendChild(target);
  }

  root.focus();
  const range = document.createRange();
  const isEmpty =
    target.innerHTML === "<br>" ||
    target.innerHTML === "" ||
    !target.textContent.trim();
  if (isEmpty) {
    range.setStart(target, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(target);
    range.collapse(false);
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function handleTitlePaste(event) {
  event.preventDefault();
  const data = event.clipboardData || window.clipboardData;
  if (!data) return;
  const text = data.getData("text/plain").replace(/[\r\n]+/g, " ").trim();
  document.execCommand("insertText", false, text);
}

function handleContentPaste(event) {
  event.preventDefault();
  const data = event.clipboardData || window.clipboardData;
  if (!data) return;
  const html = data.getData("text/html");
  if (html) {
    document.execCommand("insertHTML", false, sanitizeContent(html));
    return;
  }
  const text = data.getData("text/plain");
  document.execCommand("insertText", false, text);
}

/* --------------------------------------------------------------------------
   Slash menu — comandos básicos (estilo Notion) no corpo do prompt
   -------------------------------------------------------------------------- */

const COMMANDS = [
  { id: "p",     label: "texto",          alias: "// parágrafo",  terms: ["texto", "text", "paragrafo", "paragraph", "p"], apply: () => execBlock("p") },
  { id: "h1",    label: "título 1",       alias: "// h1",          terms: ["titulo 1", "h1", "heading 1", "header 1"],     apply: () => execBlock("h1") },
  { id: "h2",    label: "título 2",       alias: "// h2",          terms: ["titulo 2", "h2", "heading 2", "header 2"],     apply: () => execBlock("h2") },
  { id: "h3",    label: "título 3",       alias: "// h3",          terms: ["titulo 3", "h3", "heading 3", "header 3"],     apply: () => execBlock("h3") },
  { id: "ul",    label: "lista",          alias: "// • • •",       terms: ["lista", "ul", "bullet", "marcadores"],         apply: () => document.execCommand("insertUnorderedList") },
  { id: "ol",    label: "lista numerada", alias: "// 1. 2. 3.",    terms: ["lista numerada", "ol", "numerada", "numbered"], apply: () => document.execCommand("insertOrderedList") },
  { id: "quote", label: "citação",        alias: "// > blockquote", terms: ["citacao", "quote", "blockquote"],             apply: () => execBlock("blockquote") },
  { id: "code",  label: "código",         alias: "// pre",         terms: ["codigo", "code", "pre"],                       apply: () => execBlock("pre") },
];

const cmdMenu = {
  open: false,
  anchor: null,         // { node, slashStart, queryEnd }
  query: "",
  filtered: COMMANDS,
  selectedIndex: 0,
};

function execBlock(tag) {
  document.execCommand("formatBlock", false, tag);
}

function normalizeCmd(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function getSlashContext() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  const node = range.startContainer;
  const offset = range.startOffset;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  if (!elements.promptContent.contains(node)) return null;

  const before = node.textContent.slice(0, offset);
  // `/` precisa estar no início do nó ou logo após espaço/quebra — não dispara
  // dentro de palavras (foo/bar) e fecha quando o usuário digita um espaço.
  const m = before.match(/(?:^|\s)\/([^/\s]*)$/);
  if (!m) return null;

  const matchStart = before.length - m[0].length;
  const slashStart = m[0].startsWith("/") ? matchStart : matchStart + 1;

  return { node, slashStart, queryEnd: offset, query: m[1] };
}

function evaluateCmdMenu() {
  const ctx = getSlashContext();
  if (!ctx) {
    if (cmdMenu.open) closeCmdMenu();
    return;
  }
  cmdMenu.anchor = { node: ctx.node, slashStart: ctx.slashStart, queryEnd: ctx.queryEnd };
  cmdMenu.query = ctx.query;
  filterCmdMenu();
  if (!cmdMenu.open) {
    cmdMenu.open = true;
    elements.cmdMenu.hidden = false;
  }
  renderCmdMenu();
  positionCmdMenu();
}

function filterCmdMenu() {
  const q = normalizeCmd(cmdMenu.query);
  cmdMenu.filtered = q
    ? COMMANDS.filter((c) => c.terms.some((t) => normalizeCmd(t).includes(q)))
    : COMMANDS;
  cmdMenu.selectedIndex = 0;
}

function renderCmdMenu() {
  const list = elements.cmdMenuList;
  if (cmdMenu.filtered.length === 0) {
    list.innerHTML = `<li class="cmd-menu-empty">// nenhum bloco corresponde</li>`;
    return;
  }
  list.innerHTML = cmdMenu.filtered
    .map(
      (cmd, i) => `
    <li>
      <button
        type="button"
        class="cmd-menu-option${i === cmdMenu.selectedIndex ? " is-active" : ""}"
        data-cmd-index="${i}"
        role="option"
        aria-selected="${i === cmdMenu.selectedIndex}"
        tabindex="-1"
      >
        <span class="cmd-menu-caret" aria-hidden="true">❯</span>
        <span class="cmd-menu-label">${escapeHtml(cmd.label)}</span>
        <span class="cmd-menu-alias">${escapeHtml(cmd.alias)}</span>
      </button>
    </li>
  `,
    )
    .join("");
}

function positionCmdMenu() {
  if (!cmdMenu.anchor) return;
  const { node, slashStart } = cmdMenu.anchor;
  const range = document.createRange();
  range.setStart(node, slashStart);
  range.setEnd(node, slashStart);
  const rect = range.getBoundingClientRect();
  const menu = elements.cmdMenu;
  // Mede após mostrar — width/height só são reais com hidden=false.
  const menuW = menu.offsetWidth || 240;
  const menuH = menu.offsetHeight || 280;
  const margin = 8;
  let top = rect.bottom + 6;
  let left = rect.left;
  if (left + menuW > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - menuW - margin);
  }
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuH - 6);
  }
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function moveCmdSelection(delta) {
  if (!cmdMenu.filtered.length) return;
  const n = cmdMenu.filtered.length;
  cmdMenu.selectedIndex = (cmdMenu.selectedIndex + delta + n) % n;
  renderCmdMenu();
  const active = elements.cmdMenuList.querySelector(".cmd-menu-option.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function confirmCmdSelection() {
  if (!cmdMenu.open || !cmdMenu.filtered.length || !cmdMenu.anchor) return;
  applyCommand(cmdMenu.filtered[cmdMenu.selectedIndex]);
}

function applyCommand(cmd) {
  if (!cmdMenu.anchor) return;
  const { node, slashStart, queryEnd } = cmdMenu.anchor;

  // Apaga o "/query" digitado antes de transformar o bloco.
  const range = document.createRange();
  try {
    range.setStart(node, slashStart);
    range.setEnd(node, Math.min(queryEnd, node.textContent.length));
  } catch {
    closeCmdMenu();
    return;
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("delete");

  cmd.apply();

  closeCmdMenu();
  updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
  updateMainMeta();
  elements.promptContent.focus();
}

function closeCmdMenu() {
  if (!cmdMenu.open) return;
  cmdMenu.open = false;
  cmdMenu.anchor = null;
  cmdMenu.query = "";
  elements.cmdMenu.hidden = true;
}

/* --------------------------------------------------------------------------
   Saídas de bloco — Enter / Backspace pra escapar de pre / blockquote / heading
   -------------------------------------------------------------------------- */

function closestEditorBlock(tags) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  while (node && node !== elements.promptContent) {
    if (node.nodeType === Node.ELEMENT_NODE && tags.includes(node.tagName.toLowerCase())) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function isBlockEmpty(block) {
  const text = block.textContent.replace(/​/g, "");
  return text === "" || text === "\n";
}

function isCaretAtBlockStart(block) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const head = document.createRange();
  head.setStartBefore(block);
  head.setEnd(range.startContainer, range.startOffset);
  return head.toString() === "";
}

function getTextBeforeCaretIn(block) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  // Walk em text nodes, contando do início do bloco até o caret. Mais robusto
  // que Range.toString() — alguns navegadores omitem \n entre nós.
  const caretNode = range.startContainer;
  const caretOffset = range.startOffset;
  if (caretNode === block) {
    let text = "";
    for (let i = 0; i < caretOffset; i++) {
      const child = block.childNodes[i];
      text += child ? child.textContent : "";
    }
    return text;
  }

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let text = "";
  let n;
  while ((n = walker.nextNode())) {
    if (n === caretNode) {
      text += n.data.slice(0, caretOffset);
      return text;
    }
    text += n.data;
  }
  return text;
}

function getTextAfterCaretIn(block) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  const caretNode = range.endContainer;
  const caretOffset = range.endOffset;
  if (caretNode === block) {
    let text = "";
    for (let i = caretOffset; i < block.childNodes.length; i++) {
      text += block.childNodes[i].textContent;
    }
    return text;
  }

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let text = "";
  let started = false;
  let n;
  while ((n = walker.nextNode())) {
    if (started) {
      text += n.data;
    } else if (n === caretNode) {
      text += n.data.slice(caretOffset);
      started = true;
    }
  }
  return text;
}

function isCaretAtEmptyLineEnd(block) {
  const after = getTextAfterCaretIn(block);
  if (after === null || after.replace(/​/g, "") !== "") return false;
  const before = getTextBeforeCaretIn(block);
  return before === "" || before.endsWith("\n");
}

function exitEditorBlock(block) {
  // Bloco totalmente vazio: vira <p> em vez de deixar um <pre>/<blockquote> órfão.
  if (isBlockEmpty(block)) {
    execBlock("p");
    return;
  }
  // Tira o \n trailing que era a "linha vazia" antes do caret.
  if (block.textContent.endsWith("\n")) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    let last = null;
    let n;
    while ((n = walker.nextNode())) last = n;
    if (last && last.data.endsWith("\n")) {
      last.data = last.data.replace(/\n$/, "");
    }
  }

  const p = document.createElement("p");
  p.appendChild(document.createElement("br"));
  block.parentNode.insertBefore(p, block.nextSibling);

  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function attachCmdMenuHandlers() {
  // Navegação por teclado dentro do menu — intercepta antes do contenteditable
  // e do handler global de Escape. Quando o menu está fechado, trata as saídas
  // naturais de blocos formatados (Enter em linha vazia / Backspace em bloco vazio).
  elements.promptContent.addEventListener("keydown", (event) => {
    if (cmdMenu.open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCmdSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCmdSelection(-1);
      } else if (event.key === "Enter" || event.key === "Tab") {
        if (!cmdMenu.filtered.length) {
          closeCmdMenu();
          return;
        }
        event.preventDefault();
        confirmCmdSelection();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeCmdMenu();
      }
      return;
    }

    // Dentro de <pre>: sempre tratamos Enter manualmente — o default do Chrome
    // (que pode criar \n, <div>, ou <pre> novo dependendo da versão) não dá
    // controle confiável pra detectar "linha vazia → sai do bloco".
    if (event.key === "Enter" && !event.shiftKey) {
      const pre = closestEditorBlock(["pre"]);
      if (pre) {
        event.preventDefault();
        const before = getTextBeforeCaretIn(pre) || "";
        const after = getTextAfterCaretIn(pre) || "";
        const atEmptyLine =
          after === "" && (before === "" || before.endsWith("\n"));
        if (atEmptyLine) {
          exitEditorBlock(pre);
        } else {
          // Newline literal dentro do <pre>; whitespace é preservado pelo CSS.
          document.execCommand("insertText", false, "\n");
        }
        return;
      }
      const blockquote = closestEditorBlock(["blockquote"]);
      if (blockquote && isCaretAtEmptyLineEnd(blockquote)) {
        event.preventDefault();
        exitEditorBlock(blockquote);
        return;
      }
    }

    // Backspace no início de bloco formatado vazio reverte pra parágrafo.
    if (event.key === "Backspace") {
      const block = closestEditorBlock(["pre", "blockquote", "h1", "h2", "h3", "h4"]);
      if (block && isBlockEmpty(block) && isCaretAtBlockStart(block)) {
        event.preventDefault();
        execBlock("p");
      }
    }
  });

  // mousedown (não click) — preventDefault mantém o caret no editor;
  // sem isso o blur disparado pelo focus no botão move o caret.
  elements.cmdMenu.addEventListener("mousedown", (event) => {
    const btn = event.target.closest(".cmd-menu-option");
    if (!btn) return;
    event.preventDefault();
    const idx = Number(btn.dataset.cmdIndex);
    if (Number.isFinite(idx) && cmdMenu.filtered[idx]) {
      cmdMenu.selectedIndex = idx;
      applyCommand(cmdMenu.filtered[idx]);
    }
  });

  // Hover destaca opção (sem confirmar) — alinha com o seletor por teclado.
  elements.cmdMenu.addEventListener("mousemove", (event) => {
    const btn = event.target.closest(".cmd-menu-option");
    if (!btn) return;
    const idx = Number(btn.dataset.cmdIndex);
    if (Number.isFinite(idx) && idx !== cmdMenu.selectedIndex) {
      cmdMenu.selectedIndex = idx;
      renderCmdMenu();
    }
  });

  // Fecha ao clicar fora do menu (clique no editor é tratado via selectionchange).
  document.addEventListener("mousedown", (event) => {
    if (!cmdMenu.open) return;
    if (elements.cmdMenu.contains(event.target)) return;
    if (elements.promptContent.contains(event.target)) return;
    closeCmdMenu();
  });

  // Caret movido pra fora do "/query" (setas, clique no editor) — re-avalia.
  document.addEventListener("selectionchange", () => {
    if (!cmdMenu.open) return;
    if (document.activeElement !== elements.promptContent) return;
    evaluateCmdMenu();
  });

  elements.promptContent.addEventListener("blur", () => {
    // Atraso para permitir o mousedown nos itens do menu fechar pela ação.
    setTimeout(() => {
      if (cmdMenu.open && document.activeElement !== elements.promptContent) {
        closeCmdMenu();
      }
    }, 0);
  });

  // Reposiciona em scroll/resize enquanto aberto.
  window.addEventListener("scroll", () => cmdMenu.open && positionCmdMenu(), true);
  window.addEventListener("resize", () => cmdMenu.open && positionCmdMenu());
}

function setMainStatus(text) {
  const node = elements.mainMeta.querySelector(".main-status-text");
  if (node) node.textContent = text;
}

function updateMainMeta() {
  const id = state.selectedId;
  if (!id) {
    const titleText = elements.promptTitle.textContent.trim();
    const contentText = elements.promptContent.textContent.trim();
    const count = wordCount(contentText);
    if (!titleText && !contentText) {
      setMainStatus("novo prompt");
    } else {
      setMainStatus(`rascunho · ${count}w`);
    }
    return;
  }
  const prompt = state.prompts.find((p) => p.id === id);
  if (!prompt) return;
  setMainStatus(
    `${shortHash(prompt.id)} · ${timeAgoCompact(prompt.updatedAt)} · ${prompt.wordCount}w`,
  );
}

/* --------------------------------------------------------------------------
   Lista
   -------------------------------------------------------------------------- */

function createPromptItem(prompt) {
  const isSelected = state.selectedId === prompt.id;
  const hash = shortHash(prompt.id);
  const time = timeAgoCompact(prompt.updatedAt);
  const words = prompt.wordCount;
  const title = prompt.title || "sem título";

  return `
    <li
      class="toc-item${isSelected ? " is-selected" : ""}"
      data-id="${escapeHtml(prompt.id)}"
      data-action="select"
      role="option"
      tabindex="0"
      aria-selected="${isSelected}"
      draggable="true"
    >
      <span class="toc-item-caret" aria-hidden="true">❯</span>
      <span class="toc-item-title">${escapeHtml(title)}</span>
      <span class="toc-item-meta">
        <span class="toc-item-hash">${escapeHtml(hash)}</span>
        <span class="toc-item-meta-sep">·</span>
        <span>${escapeHtml(time)}</span>
        <span class="toc-item-meta-sep">·</span>
        <span>${words}w</span>
      </span>
      <span class="toc-item-actions" aria-hidden="true">
        <button
          type="button"
          class="toc-item-move"
          data-action="move"
          aria-label="Mover ${escapeHtml(title)} para projeto"
          title="Mover para projeto"
        >→</button>
        <button
          type="button"
          class="toc-item-remove"
          data-action="remove"
          aria-label="Excluir ${escapeHtml(title)}"
          title="Excluir"
        >×</button>
      </span>
    </li>
  `;
}

function renderList(filterText = "") {
  const filter = filterText.trim().toLowerCase();
  const hasPrompts = state.prompts.length > 0;

  const filtered = filter
    ? state.prompts.filter((p) => (p.title || "").toLowerCase().includes(filter))
    : state.prompts;

  elements.list.innerHTML = filtered.map(createPromptItem).join("");

  elements.tocEmpty.hidden = hasPrompts;
  elements.tocEmptySearch.hidden = !(hasPrompts && filtered.length === 0);
  elements.wordmarkCount.textContent = formatItemCount(state.prompts.length);
}

function activeProjectQuery() {
  const f = state.activeProject;
  if (f.type === "id") return { projectId: f.id };
  if (f.type === "none") return { projectId: "none" };
  return {};
}

async function loadPrompts({ keepSelection = false } = {}) {
  try {
    const { items } = await endpoints.listPrompts(activeProjectQuery());
    state.prompts = items;
    state.contentCache.clear();
    if (!keepSelection) state.selectedId = null;
    renderList(elements.search.value);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    console.error(err);
    toast({ message: "falha ao carregar prompts", variant: "error" });
  }
}

/* --------------------------------------------------------------------------
   Projetos (rail da sidebar)
   --------------------------------------------------------------------------
   O rail é a fonte do "filtro ativo". Três tipos de entrada:
     - virtual "todos"        → activeProject = { type: "all" }
     - virtual "sem projeto"  → activeProject = { type: "none" }
     - projeto do usuário     → activeProject = { type: "id", id }
   loadPrompts() lê o filtro via activeProjectQuery() e o servidor narra a
   listagem. Contagens vêm de loadProjects() (groupBy no servidor).
*/

function isProjectActive(filter) {
  const a = state.activeProject;
  if (filter.type === "all") return a.type === "all";
  if (filter.type === "none") return a.type === "none";
  return a.type === "id" && a.id === filter.id;
}

function totalPromptCount() {
  let total = state.unassignedCount;
  for (const p of state.projects) total += p.promptCount;
  return total;
}

function projectItem({ key, label, count, filter, removable, projectId }) {
  const selected = isProjectActive(filter);
  const removeBtn = removable
    ? `<button type="button" class="projects-item-remove" data-action="remove-project" data-project-id="${escapeHtml(projectId)}" aria-label="Excluir projeto ${escapeHtml(label)}" title="Excluir projeto">×</button>`
    : "";
  // draggable apenas em projetos reais — entradas virtuais ("todos"/"sem projeto")
  // não reordenam. Usuários ainda podem soltar prompt em "sem projeto" (drop
  // target não exige o item ser draggable).
  const dragAttr = removable ? "draggable=\"true\"" : "";
  return `
    <li
      class="projects-item${selected ? " is-selected" : ""}"
      data-action="select-project"
      data-key="${escapeHtml(key)}"
      ${projectId ? `data-project-id="${escapeHtml(projectId)}"` : ""}
      role="option"
      tabindex="0"
      aria-selected="${selected}"
      ${dragAttr}
    >
      <span class="projects-item-prefix" aria-hidden="true">/</span>
      <span class="projects-item-name"${removable ? ` data-action="rename-project" data-project-id="${escapeHtml(projectId)}"` : ""}>${escapeHtml(label)}</span>
      <span class="projects-item-count">${count}</span>
      ${removeBtn}
    </li>
  `;
}

function normalizeProjectFilter(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Decide quais projetos reais aparecem na lista. Três regras compõem:
//  1. Se há filtro de texto → match por nome (todos os matches, ignora limite).
//  2. Senão, se expandido → todos.
//  3. Senão (recolhido) → primeiros COLLAPSE_LIMIT na ordem manual + ativo
//     (se estiver fora desse top, é "anexado" ao final pra nunca sumir).
//
// Retorna { visible, hidden, filtering }. `hidden` é o que ficou de fora do
// recolhido (sem filtro ativo); usado pra montar o "/ ver todos (N)".
function computeVisibleProjects() {
  const all = state.projects;
  const filtering = state.projectsFilter.trim().length > 0;

  if (filtering) {
    const q = normalizeProjectFilter(state.projectsFilter);
    return {
      visible: all.filter((p) => normalizeProjectFilter(p.name).includes(q)),
      hidden: [],
      filtering: true,
    };
  }

  if (state.projectsExpanded || all.length <= PROJECTS_COLLAPSE_LIMIT) {
    return { visible: all, hidden: [], filtering: false };
  }

  const top = all.slice(0, PROJECTS_COLLAPSE_LIMIT);
  let visible = top;
  // Ativo sempre visível, mesmo fora do top — anexa ao fim do bloco.
  if (state.activeProject.type === "id") {
    const active = all.find((p) => p.id === state.activeProject.id);
    if (active && !top.some((p) => p.id === active.id)) {
      visible = [...top, active];
    }
  }
  const visibleIds = new Set(visible.map((p) => p.id));
  const hidden = all.filter((p) => !visibleIds.has(p.id));
  return { visible, hidden, filtering: false };
}

function renderProjects() {
  const total = totalPromptCount();
  const { visible, hidden, filtering } = computeVisibleProjects();

  // Filtro só aparece quando vale a pena (≥ THRESHOLD projetos). Esconder em
  // contas pequenas evita poluir o rail com um input que filtraria 2 itens.
  const showFilter = state.projects.length >= PROJECTS_FILTER_THRESHOLD;
  elements.projectsFilter.hidden = !showFilter;
  if (!showFilter && state.projectsFilter) {
    state.projectsFilter = "";
    elements.projectsFilterInput.value = "";
  }

  // Sem matches no filtro → renderiza vazio com hint.
  let listHtml;
  if (filtering && visible.length === 0) {
    listHtml = `<li class="projects-empty">// nenhum projeto bate com "${escapeHtml(state.projectsFilter.trim())}"</li>`;
  } else {
    listHtml = [
      projectItem({
        key: "all",
        label: "todos",
        count: total,
        filter: { type: "all" },
      }),
      projectItem({
        key: "none",
        label: "sem projeto",
        count: state.unassignedCount,
        filter: { type: "none" },
      }),
      ...visible.map((p) =>
        projectItem({
          key: p.id,
          label: p.name,
          count: p.promptCount,
          filter: { type: "id", id: p.id },
          removable: true,
          projectId: p.id,
        }),
      ),
    ].join("");
  }
  elements.projectsList.innerHTML = listHtml;

  // Disclosure: só aparece quando recolhido tem itens escondidos OU quando
  // está expandido (pra permitir voltar). Filtrando, escondemos — o user já
  // tem todos os matches na frente.
  const hasOverflow =
    !filtering && state.projects.length > PROJECTS_COLLAPSE_LIMIT;
  if (hasOverflow) {
    elements.projectsDisclosure.hidden = false;
    elements.projectsDisclosure.setAttribute(
      "aria-expanded",
      String(state.projectsExpanded),
    );
    elements.projectsDisclosureText.textContent = state.projectsExpanded
      ? "ver menos"
      : `ver todos (${state.projects.length})`;
  } else {
    elements.projectsDisclosure.hidden = true;
  }
}

async function loadProjects() {
  try {
    const { items, unassignedCount } = await endpoints.listProjects();
    state.projects = items;
    state.unassignedCount = unassignedCount || 0;
    // Se o filtro ativo aponta pra um projeto que não existe mais (ex.: deletado
    // em outra aba), volta pra "todos" antes de renderizar — evita estado
    // visual com nada selecionado.
    if (
      state.activeProject.type === "id" &&
      !state.projects.find((p) => p.id === state.activeProject.id)
    ) {
      state.activeProject = { type: "all" };
      writeActiveProjectFilter(state.activeProject);
    }
    renderProjects();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    console.error(err);
    toast({ message: "falha ao carregar projetos", variant: "error" });
  }
}

async function setActiveProject(filter) {
  if (isProjectActive(filter)) return;
  state.activeProject = filter;
  writeActiveProjectFilter(filter);
  renderProjects();
  // Limpa busca ao trocar de pasta — buscar dentro de "todos" e depois trocar
  // pra "claude-code" quase sempre é o user querendo recomeçar. Mantê-la dava
  // a impressão de "sumiu tudo".
  if (elements.search.value) {
    elements.search.value = "";
  }
  await loadPrompts();
}

function openNewProjectInput() {
  elements.projectsNew.hidden = false;
  elements.projectsNewInput.value = "";
  elements.projectsNewInput.focus();
}

function closeNewProjectInput() {
  elements.projectsNew.hidden = true;
  elements.projectsNewInput.value = "";
}

async function submitNewProject() {
  const name = elements.projectsNewInput.value.trim();
  if (!name) {
    closeNewProjectInput();
    return;
  }
  try {
    const created = await endpoints.createProject(name);
    closeNewProjectInput();
    // Servidor já atribui sortOrder = max+10, então o push no fim do array
    // mantém a ordem do rail consistente. Não re-sortar.
    state.projects.push({ ...created });
    await setActiveProject({ type: "id", id: created.id });
    toast({
      messageHtml: `<strong>projeto criado</strong> <span class="hash">/${escapeHtml(created.name)}</span>`,
    });
  } catch (err) {
    if (err instanceof ApiError && err.code === "already_exists") {
      toast({ message: "já existe um projeto com esse nome", variant: "error" });
      elements.projectsNewInput.focus();
      elements.projectsNewInput.select();
      return;
    }
    handleApiError(err, "falha ao criar projeto");
  }
}

async function removeProject(id) {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;
  const count = project.promptCount;
  const message =
    count > 0
      ? `excluir /${project.name}? ${count} prompt${count > 1 ? "s" : ""} fica${count > 1 ? "m" : ""} sem projeto.`
      : `excluir /${project.name}?`;
  if (!window.confirm(message)) return;
  try {
    await endpoints.deleteProject(id);
    state.projects = state.projects.filter((p) => p.id !== id);
    state.unassignedCount += count;
    if (state.activeProject.type === "id" && state.activeProject.id === id) {
      state.activeProject = { type: "all" };
      writeActiveProjectFilter(state.activeProject);
    }
    renderProjects();
    await loadPrompts();
    toast({ message: `projeto /${project.name} removido` });
  } catch (err) {
    handleApiError(err, "falha ao remover projeto");
  }
}

/* --------------------------------------------------------------------------
   Mover prompt entre projetos
   --------------------------------------------------------------------------
   Dois caminhos:
     - Drag: arrasta o item da lista pro rail (DRAG_PROMPT) → solta em qualquer
       projeto (ou "sem projeto") → PATCH /api/prompts/:id { projectId }.
     - Botão "→" no item: abre popover acessível com a lista de projetos.
   Atualização local é otimista — counts e remoção da lista quando o filtro
   ativo passa a não bater. Em erro, recarrega.
*/

const DRAG_PROMPT = "application/x-mp-prompt";
const DRAG_PROJECT = "application/x-mp-project";

const dragState = {
  kind: null, // "prompt" | "project" | null
  // Para reorder de projetos: posição de inserção atual {targetId, before}.
  // Permite traduzir rect.top/bottom em "antes/depois" no drop.
  reorderHint: null,
};

const movePopover = {
  el: null,
  promptId: null,
};

function clearDropTargets() {
  document
    .querySelectorAll(".projects-item.is-drop-target, .projects-item.is-drop-before, .projects-item.is-drop-after")
    .forEach((el) =>
      el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after"),
    );
}

function pickDragKind(types) {
  const arr = Array.from(types || []);
  if (arr.includes(DRAG_PROMPT)) return "prompt";
  if (arr.includes(DRAG_PROJECT)) return "project";
  return null;
}

async function movePromptToProject(promptId, newProjectId) {
  const prompt = state.prompts.find((p) => p.id === promptId);
  // Se o prompt não está em state.prompts (filtrado fora do view), buscamos só
  // o projectId no server depois — por agora assumimos que o caller já tem o
  // prompt visível (drag a partir da lista, popover sobre item da lista).
  if (!prompt) return;
  const oldProjectId = prompt.projectId ?? null;
  const normalizedNew = newProjectId || null;
  if (oldProjectId === normalizedNew) {
    closeMovePopover();
    return;
  }

  // Otimista: atualiza localmente antes do PATCH.
  prompt.projectId = normalizedNew;
  if (oldProjectId === null) {
    state.unassignedCount = Math.max(0, state.unassignedCount - 1);
  } else {
    const old = state.projects.find((p) => p.id === oldProjectId);
    if (old) old.promptCount = Math.max(0, old.promptCount - 1);
  }
  if (normalizedNew === null) {
    state.unassignedCount += 1;
  } else {
    const next = state.projects.find((p) => p.id === normalizedNew);
    if (next) next.promptCount += 1;
  }
  if (!promptMatchesActiveFilter(prompt)) {
    state.prompts = state.prompts.filter((p) => p.id !== promptId);
  }
  renderProjects();
  renderList(elements.search.value);

  const targetName = normalizedNew
    ? state.projects.find((p) => p.id === normalizedNew)?.name || "projeto"
    : "sem projeto";

  try {
    await endpoints.movePrompt(promptId, normalizedNew);
    toast({
      messageHtml: `<strong>movido</strong> <span class="hash">→ /${escapeHtml(targetName)}</span>`,
    });
  } catch (err) {
    handleApiError(err, "falha ao mover prompt");
    // Recupera estado verdadeiro do servidor.
    await loadProjects();
    await loadPrompts({ keepSelection: true });
  }
}

async function reorderProjectByDrop(sourceId, targetId, insertBefore) {
  if (sourceId === targetId) return;
  const sourceIdx = state.projects.findIndex((p) => p.id === sourceId);
  const targetIdx = state.projects.findIndex((p) => p.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return;

  const [moved] = state.projects.splice(sourceIdx, 1);
  // targetIdx pode ter mudado depois do splice; recalcula.
  let insertIdx = state.projects.findIndex((p) => p.id === targetId);
  if (!insertBefore) insertIdx += 1;
  state.projects.splice(insertIdx, 0, moved);
  renderProjects();

  try {
    await endpoints.reorderProjects(state.projects.map((p) => p.id));
  } catch (err) {
    handleApiError(err, "falha ao reordenar");
    await loadProjects();
  }
}

function openMovePopover(promptId, anchorEl) {
  closeMovePopover();
  const prompt = state.prompts.find((p) => p.id === promptId);
  const currentProjectId = prompt?.projectId ?? null;

  const options = [
    { id: null, name: "sem projeto" },
    ...state.projects.map((p) => ({ id: p.id, name: p.name })),
  ];

  const el = document.createElement("div");
  el.className = "move-popover";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", "Mover prompt para projeto");
  el.innerHTML = `
    <p class="move-popover-hint" aria-hidden="true">// mover para…</p>
    <ul class="move-popover-list" role="presentation">
      ${options
        .map((opt) => {
          const isCurrent =
            (opt.id || null) === (currentProjectId || null);
          return `
        <li>
          <button
            type="button"
            class="move-popover-option${isCurrent ? " is-current" : ""}"
            data-project-id="${opt.id ? escapeHtml(opt.id) : ""}"
            role="menuitem"
            ${isCurrent ? "aria-current='true' disabled" : ""}
          >
            <span class="move-popover-prefix" aria-hidden="true">/</span>
            <span class="move-popover-name">${escapeHtml(opt.name)}</span>
            ${isCurrent ? `<span class="move-popover-badge" aria-hidden="true">atual</span>` : ""}
          </button>
        </li>`;
        })
        .join("")}
    </ul>
  `;
  document.body.appendChild(el);

  // Posiciona ancorado ao botão; ajusta pra não vazar viewport.
  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;
  const popW = el.offsetWidth || 220;
  const popH = el.offsetHeight || 240;
  let top = rect.bottom + 4;
  let left = rect.right - popW;
  if (left < margin) left = margin;
  if (left + popW > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popW - margin);
  }
  if (top + popH > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popH - 4);
  }
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;

  movePopover.el = el;
  movePopover.promptId = promptId;

  el.addEventListener("click", (ev) => {
    const opt = ev.target.closest(".move-popover-option");
    if (!opt || opt.disabled) return;
    const projectId = opt.dataset.projectId || null;
    const id = movePopover.promptId;
    closeMovePopover();
    if (id) movePromptToProject(id, projectId);
  });

  document.addEventListener("mousedown", onDocClickForMovePopover, true);
  document.addEventListener("keydown", onEscForMovePopover);

  // Foca o primeiro item disponível pra permitir navegação por teclado.
  const firstEnabled = el.querySelector(".move-popover-option:not([disabled])");
  if (firstEnabled) firstEnabled.focus();
}

function closeMovePopover() {
  if (movePopover.el) {
    movePopover.el.remove();
    movePopover.el = null;
  }
  movePopover.promptId = null;
  document.removeEventListener("mousedown", onDocClickForMovePopover, true);
  document.removeEventListener("keydown", onEscForMovePopover);
}

function onDocClickForMovePopover(ev) {
  if (!movePopover.el) return;
  if (movePopover.el.contains(ev.target)) return;
  closeMovePopover();
}

function onEscForMovePopover(ev) {
  if (ev.key === "Escape") closeMovePopover();
}

async function renameProjectInline(id, nameSpan) {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;
  // Substitui o span pelo input no mesmo lugar — preserva o layout grid.
  const input = document.createElement("input");
  input.type = "text";
  input.className = "projects-item-rename-input";
  input.value = project.name;
  input.maxLength = 80;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Renomear projeto");
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (!commit || !next || next === project.name) {
      renderProjects();
      return;
    }
    try {
      const updated = await endpoints.renameProject(id, next);
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...updated };
      // Não reorganizar — rename mantém a posição manual do user no rail.
      renderProjects();
      toast({
        messageHtml: `<strong>renomeado</strong> <span class="hash">/${escapeHtml(updated.name)}</span>`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_exists") {
        toast({ message: "já existe um projeto com esse nome", variant: "error" });
      } else {
        handleApiError(err, "falha ao renomear");
      }
      renderProjects();
    }
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

/* --------------------------------------------------------------------------
   Ações
   -------------------------------------------------------------------------- */

function newPrompt() {
  state.selectedId = null;
  elements.promptTitle.textContent = "";
  elements.promptContent.innerHTML = "";
  updateAllEditableStates();
  renderList(elements.search.value);
  updateMainMeta();
  updateImproveButtonState();
  elements.promptTitle.focus();
  closeSidebarMobile();
}

async function save() {
  const title = elements.promptTitle.textContent.trim();
  const contentHtml = elements.promptContent.innerHTML.trim();
  const contentText = elements.promptContent.textContent.trim();

  if (!title && !contentText) {
    toast({ message: "vazio — nada para salvar" });
    elements.promptTitle.focus();
    return;
  }
  if (!title) {
    toast({ message: "título obrigatório" });
    elements.promptTitle.focus();
    return;
  }
  if (!contentText) {
    toast({ message: "conteúdo obrigatório" });
    elements.promptContent.focus();
    return;
  }

  elements.btnSave.disabled = true;
  try {
    let prompt;
    if (state.selectedId) {
      prompt = await endpoints.updatePrompt(state.selectedId, {
        title,
        content: contentHtml,
      });
      toast({
        messageHtml: `<strong>salvo</strong> <span class="hash">${escapeHtml(shortHash(prompt.id))}</span>`,
      });
    } else {
      // Novo prompt herda o filtro ativo: criando dentro de /claude-code,
      // o prompt já nasce associado a esse projeto. "todos" e "sem projeto"
      // ambos viram null no servidor.
      const body = { title, content: contentHtml };
      if (state.activeProject.type === "id") {
        body.projectId = state.activeProject.id;
      }
      prompt = await endpoints.createPrompt(body);
      state.selectedId = prompt.id;
      toast({
        messageHtml: `<strong>criado</strong> <span class="hash">${escapeHtml(shortHash(prompt.id))}</span>`,
      });
    }
    applyPromptToState(prompt);
    renderList(elements.search.value);
    updateMainMeta();
    updateImproveButtonState();
    refreshProjectCounts();
  } catch (err) {
    handleApiError(err, "falha ao salvar");
  } finally {
    elements.btnSave.disabled = false;
  }
}

// Atualiza contagens depois de criar/excluir/restaurar prompt. Refaz só a
// chamada de listagem de projetos — o servidor recalcula via groupBy.
function refreshProjectCounts() {
  loadProjects().catch((err) => console.error("refresh projects:", err));
}

function applyPromptToState(prompt) {
  state.contentCache.set(prompt.id, prompt.content);
  const preview = {
    id: prompt.id,
    title: prompt.title,
    projectId: prompt.projectId ?? null,
    contentPreview: stripHtml(prompt.content).slice(0, 200),
    wordCount: wordCount(stripHtml(prompt.content)),
    updatedAt: prompt.updatedAt,
    createdAt: prompt.createdAt,
  };
  const idx = state.prompts.findIndex((p) => p.id === prompt.id);
  if (idx >= 0) state.prompts.splice(idx, 1);
  // Insere apenas se o prompt pertence ao filtro ativo — caso contrário o item
  // saiu do recorte da sidebar (ex.: salvou em "/claude-code" enquanto via
  // "/sem projeto"). O editor continua mostrando, mas a lista respeita a pasta.
  if (promptMatchesActiveFilter(preview)) {
    state.prompts.unshift(preview);
  }
}

function promptMatchesActiveFilter(prompt) {
  const f = state.activeProject;
  if (f.type === "all") return true;
  if (f.type === "none") return prompt.projectId == null;
  return prompt.projectId === f.id;
}

async function selectPrompt(id) {
  const preview = state.prompts.find((p) => p.id === id);
  if (!preview) return;
  state.selectedId = id;

  let content = state.contentCache.get(id);
  if (content === undefined) {
    try {
      const full = await endpoints.getPrompt(id);
      content = full.content || "";
      state.contentCache.set(id, content);
    } catch (err) {
      handleApiError(err, "falha ao carregar prompt");
      state.selectedId = null;
      return;
    }
  }

  elements.promptTitle.textContent = preview.title;
  elements.promptContent.innerHTML = sanitizeContent(content);
  updateAllEditableStates();
  renderList(elements.search.value);
  updateMainMeta();
  updateImproveButtonState();
  closeSidebarMobile();
}

async function removePrompt(id) {
  const index = state.prompts.findIndex((p) => p.id === id);
  if (index === -1) return;

  const [removed] = state.prompts.splice(index, 1);
  const cachedContent = state.contentCache.get(id);
  state.contentCache.delete(id);

  if (state.selectedId === id) {
    state.selectedId = null;
    elements.promptTitle.textContent = "";
    elements.promptContent.innerHTML = "";
    updateAllEditableStates();
  }

  renderList(elements.search.value);
  updateMainMeta();
  updateImproveButtonState();

  try {
    await endpoints.deletePrompt(id);
  } catch (err) {
    state.prompts.splice(Math.min(index, state.prompts.length), 0, removed);
    if (cachedContent !== undefined) state.contentCache.set(id, cachedContent);
    renderList(elements.search.value);
    handleApiError(err, "falha ao excluir");
    return;
  }

  if (state.pendingDelete) clearTimeout(state.pendingDelete.timeoutId);

  const timeoutId = setTimeout(() => {
    state.pendingDelete = null;
  }, UNDO_WINDOW_MS);

  state.pendingDelete = {
    prompt: removed,
    cachedContent,
    timeoutId,
  };

  refreshProjectCounts();

  toast({
    messageHtml: `<strong>removido</strong> <span class="hash">${escapeHtml(shortHash(removed.id))}</span>`,
    actionLabel: "desfazer",
    duration: UNDO_WINDOW_MS,
    onAction: undoDelete,
  });
}

async function undoDelete() {
  if (!state.pendingDelete) return;
  const { prompt, cachedContent, timeoutId } = state.pendingDelete;
  clearTimeout(timeoutId);
  state.pendingDelete = null;

  const content = cachedContent ?? "";
  if (!content) {
    toast({ message: "não foi possível desfazer — recarregue a página", variant: "error" });
    return;
  }

  try {
    const body = { title: prompt.title, content };
    // Re-POST não preserva id, mas tenta preservar a pasta original — assim
    // o desfazer não muda a localização do prompt.
    if (prompt.projectId) body.projectId = prompt.projectId;
    const created = await endpoints.createPrompt(body);
    applyPromptToState(created);
    state.selectedId = created.id;
    renderList(elements.search.value);
    updateMainMeta();
    refreshProjectCounts();
    toast({
      messageHtml: `<strong>restaurado</strong> <span class="hash">${escapeHtml(shortHash(created.id))}</span>`,
    });
  } catch (err) {
    handleApiError(err, "falha ao restaurar");
  }
}

async function copySelected() {
  const html = elements.promptContent.innerHTML.trim();
  const text = (elements.promptContent.innerText || "").trim();
  if (!text) {
    toast({ message: "vazio — nada para copiar" });
    return;
  }
  if (!navigator.clipboard) {
    toast({ message: "clipboard indisponível", variant: "error" });
    return;
  }
  try {
    // Escreve HTML + plain text — destinos rich (Word, Notion, Gmail) usam o HTML
    // e preservam listas/parágrafos/títulos; destinos plain (terminais, chats de
    // LLM) caem no text/plain. Sem isso, colar em rich text vira tudo um parágrafo.
    if (window.ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast({ messageHtml: `<strong>copiado</strong> <span class="hash">${text.length}c</span>` });
  } catch (error) {
    console.error("Erro ao copiar:", error);
    try {
      await navigator.clipboard.writeText(text);
      toast({ messageHtml: `<strong>copiado</strong> <span class="hash">${text.length}c</span>` });
    } catch {
      toast({ message: "falha ao copiar", variant: "error" });
    }
  }
}

async function logout() {
  try {
    await endpoints.logout();
  } catch {
    /* ignora — queremos sair de qualquer jeito */
  }
  window.location.href = "/login";
}

/* --------------------------------------------------------------------------
   Improve com IA
   -------------------------------------------------------------------------- */

const PROVIDER_ORDER = ["anthropic", "openai", "gemini"];

function getConnectedProviders() {
  const k = state.currentUser?.hasKeys || {};
  return PROVIDER_ORDER.filter((p) => !!k[p]);
}

function hasAnyKey() {
  return getConnectedProviders().length > 0;
}

function updateImproveButtonState() {
  const canImprove =
    !!state.selectedId && !!state.currentUser && hasAnyKey();
  elements.btnImprove.disabled = !canImprove;
  if (!state.currentUser) {
    elements.btnImprove.title = "";
    return;
  }
  if (!state.selectedId) {
    elements.btnImprove.title = "selecione ou salve um prompt primeiro";
  } else if (!hasAnyKey()) {
    elements.btnImprove.title = "configure uma chave em configurações";
  } else {
    elements.btnImprove.title = "";
  }
}

function refreshPopoverStatuses() {
  const keys = state.currentUser?.hasKeys || {};
  const def = state.currentUser?.defaultProvider || null;
  elements.improvePopover
    .querySelectorAll(".improve-popover-option")
    .forEach((opt) => {
      const provider = opt.dataset.provider;
      const connected = !!keys[provider];
      const isDefault = def === provider;
      const status = opt.querySelector("[data-slot='status']");
      // Default já é sinalizado por caret âmbar + label em peso 600;
      // status carrega apenas o estado de conexão pra não quebrar a linha.
      status.textContent = connected ? "conectado" : "sem chave";
      opt.disabled = !connected;
      opt.classList.toggle("is-default", isDefault);
      if (isDefault) opt.setAttribute("aria-current", "true");
      else opt.removeAttribute("aria-current");
    });
}

function openImprovePopover() {
  refreshPopoverStatuses();
  elements.improvePopover.hidden = false;
  document.addEventListener("click", onDocClickForPopover, true);
  document.addEventListener("keydown", onEscForPopover);
}

function closeImprovePopover() {
  elements.improvePopover.hidden = true;
  document.removeEventListener("click", onDocClickForPopover, true);
  document.removeEventListener("keydown", onEscForPopover);
}

function onDocClickForPopover(ev) {
  if (elements.improvePopover.hidden) return;
  if (
    elements.improvePopover.contains(ev.target) ||
    elements.btnImprove.contains(ev.target)
  ) {
    return;
  }
  closeImprovePopover();
}

function onEscForPopover(ev) {
  if (ev.key === "Escape") closeImprovePopover();
}

function handleImproveClick() {
  if (elements.btnImprove.disabled) return;
  const connected = getConnectedProviders();
  // 1 provider: vai direto. 2+ providers: sempre escolher (mesmo se houver default).
  if (connected.length === 1) {
    openImproveOverlay(connected[0]);
  } else if (connected.length > 1) {
    openImprovePopover();
  }
}

function renderOverlayProviders(activeProvider) {
  const connected = getConnectedProviders();
  const host = elements.improveOverlayProviders;
  host.replaceChildren();
  // Com 1 provider só, o nome já está no heading; sem seletor.
  if (connected.length < 2) {
    elements.improveOverlayHeading.textContent = `melhorar com ${activeProvider}`;
    return;
  }
  elements.improveOverlayHeading.textContent = "melhorar com";
  for (const p of connected) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "improve-overlay-provider";
    btn.dataset.provider = p;
    btn.setAttribute("role", "tab");
    btn.textContent = p;
    btn.setAttribute("aria-pressed", p === activeProvider ? "true" : "false");
    btn.title = p === activeProvider ? `${p} (ativo)` : `trocar para ${p}`;
    host.appendChild(btn);
  }
}

function switchOverlayProvider(provider) {
  if (improveState.loading) return;
  if (provider === improveState.provider) return;
  if (!getConnectedProviders().includes(provider)) return;
  improveState.provider = provider;
  improveState.improvedText = null;
  // Resultado anterior fica obsoleto após troca — limpa e volta ao estado "executar".
  elements.improveOverlayImproved.textContent = "";
  elements.improveOverlayMeta.textContent = "";
  elements.improveOverlayApply.disabled = true;
  elements.improveOverlayResultLabel.textContent = "aguardando…";
  elements.improveOverlayRun.disabled = false;
  elements.improveOverlayRun.textContent = "executar";
  renderOverlayProviders(provider);
}

function openImproveOverlay(provider) {
  if (!state.selectedId) return;
  closeImprovePopover();
  improveState.provider = provider;
  improveState.originalText = elements.promptContent.innerText.trim();
  improveState.improvedText = null;
  improveState.loading = false;

  elements.improveOverlayOriginal.textContent = improveState.originalText;
  elements.improveOverlayImproved.textContent = "";
  elements.improveOverlayInstruction.value = "";
  elements.improveOverlayMeta.textContent = "";
  elements.improveOverlayApply.disabled = true;
  renderOverlayProviders(provider);
  elements.improveOverlayResultLabel.textContent = "aguardando…";
  elements.improveOverlayRun.disabled = false;
  elements.improveOverlayRun.textContent = "executar";

  elements.improveOverlay.hidden = false;
  elements.improveOverlayInstruction.focus();
  document.addEventListener("keydown", onEscForOverlay);
}

function closeImproveOverlay() {
  elements.improveOverlay.hidden = true;
  improveState.loading = false;
  document.removeEventListener("keydown", onEscForOverlay);
}

function onEscForOverlay(ev) {
  if (ev.key === "Escape" && !improveState.loading) closeImproveOverlay();
}

function setOverlayProvidersDisabled(disabled) {
  elements.improveOverlayProviders
    .querySelectorAll(".improve-overlay-provider")
    .forEach((b) => {
      b.disabled = disabled;
    });
}

async function runImprove() {
  if (!state.selectedId || !improveState.provider || improveState.loading) return;
  improveState.loading = true;
  elements.improveOverlayRun.disabled = true;
  elements.improveOverlayRun.textContent = "melhorando…";
  elements.improveOverlayResultLabel.textContent = `chamando ${improveState.provider}…`;
  setMainStatus(`$ melhorando com ${improveState.provider}…`);
  setOverlayProvidersDisabled(true);

  try {
    const body = { provider: improveState.provider };
    const instr = elements.improveOverlayInstruction.value.trim();
    if (instr) body.instruction = instr;
    const result = await endpoints.improvePrompt(state.selectedId, body);
    improveState.improvedText = result.improvedContent;
    elements.improveOverlayImproved.textContent = result.improvedContent;
    elements.improveOverlayApply.disabled = false;
    const usage = result.usage || {};
    const usageStr =
      usage.inputTokens != null || usage.outputTokens != null
        ? `${usage.inputTokens ?? "?"} in · ${usage.outputTokens ?? "?"} out`
        : "";
    elements.improveOverlayMeta.textContent = [result.model, usageStr]
      .filter(Boolean)
      .join(" · ");
    elements.improveOverlayResultLabel.textContent = "melhorado";
  } catch (err) {
    if (err instanceof ApiError) {
      elements.improveOverlayImproved.textContent = `// erro: ${err.message}`;
      elements.improveOverlayResultLabel.textContent = "erro";
    } else {
      console.error(err);
      elements.improveOverlayImproved.textContent = "// falha inesperada";
      elements.improveOverlayResultLabel.textContent = "erro";
    }
  } finally {
    improveState.loading = false;
    elements.improveOverlayRun.disabled = false;
    elements.improveOverlayRun.textContent = "reexecutar";
    setOverlayProvidersDisabled(false);
    updateMainMeta();
  }
}

/* --------------------------------------------------------------------------
   Import legado (localStorage)
   -------------------------------------------------------------------------- */

function readLegacyPrompts() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object" && p.title && p.content)
      .map((p) => ({ title: String(p.title), content: String(p.content) }));
  } catch {
    return [];
  }
}

function checkLegacyStorage() {
  const legacy = readLegacyPrompts();
  if (!legacy.length) return;
  elements.legacyBannerText.textContent =
    `// encontrei ${legacy.length} prompt${legacy.length > 1 ? "s" : ""} no storage local. importar pra sua conta?`;
  elements.legacyBanner.hidden = false;
  elements.legacyImport.onclick = () => importLegacy(legacy);
  elements.legacyDiscard.onclick = () => discardLegacy();
}

async function importLegacy(legacy) {
  elements.legacyImport.disabled = true;
  elements.legacyDiscard.disabled = true;
  elements.legacyImport.textContent = "importando…";
  let ok = 0;
  let fail = 0;
  for (const p of legacy) {
    try {
      const created = await endpoints.createPrompt({ title: p.title, content: p.content });
      applyPromptToState(created);
      ok++;
    } catch (err) {
      console.error("legacy import error:", err);
      fail++;
    }
  }
  if (ok > 0) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    renderList(elements.search.value);
  }
  elements.legacyBanner.hidden = true;
  if (fail > 0) {
    toast({ message: `importados: ${ok} · falharam: ${fail}`, variant: fail > ok ? "error" : "info" });
  } else {
    toast({ messageHtml: `<strong>importado</strong> <span class="hash">${ok} prompt${ok > 1 ? "s" : ""}</span>` });
  }
}

function discardLegacy() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  elements.legacyBanner.hidden = true;
  toast({ message: "descartado — storage local limpo" });
}

function applyImprovement() {
  if (!improveState.improvedText) return;
  const escaped = escapeHtml(improveState.improvedText).replace(/\n/g, "<br>");
  elements.promptContent.innerHTML = sanitizeContent(escaped);
  updateAllEditableStates();
  updateMainMeta();
  closeImproveOverlay();
  toast({ message: "aplicado — não esqueça de salvar" });
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

function toast({ message, messageHtml, actionLabel, onAction, duration, variant } = {}) {
  const node = document.createElement("div");
  node.className = "toast" + (variant === "error" ? " toast--error" : "");
  node.setAttribute("role", "status");

  const msg = document.createElement("span");
  msg.className = "toast-message";
  if (messageHtml) {
    msg.innerHTML = messageHtml;
  } else {
    msg.textContent = message || "";
  }
  node.appendChild(msg);

  let hideTimer;
  const hide = () => {
    if (node.classList.contains("is-leaving")) return;
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 320);
  };

  if (actionLabel && typeof onAction === "function") {
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "toast-action";
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener("click", () => {
      clearTimeout(hideTimer);
      onAction();
      hide();
    });
    node.appendChild(actionBtn);
  }

  elements.toastRegion.appendChild(node);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => node.classList.add("is-visible"));
  });

  hideTimer = setTimeout(hide, duration || TOAST_DEFAULT_MS);
}

function handleApiError(err, fallbackMsg) {
  if (err instanceof ApiError && err.status === 401) return;
  const msg = err instanceof ApiError ? err.message : fallbackMsg;
  console.error(err);
  toast({ message: msg || fallbackMsg, variant: "error" });
}

/* --------------------------------------------------------------------------
   Sidebar
   --------------------------------------------------------------------------
   Duas classes em par: sidebar-open (mobile-explícito-aberto) e sidebar-closed
   (desktop-explícito-fechado). Sem nenhuma das duas, CSS resolve pelo viewport:
   desktop default = aberto, drawer mobile default = fechado (sem FOUC).

   syncDrawerState é a fonte única de verdade pros side-effects do estado:
   inert (drawer offscreen não pega foco), drawer-open no body (scroll lock),
   aria-expanded nos toggles. Chamado em todo open/close e em mudança de
   breakpoint.
*/

const mqDrawer = window.matchMedia("(max-width: 860px)");

function isSidebarVisible() {
  if (mqDrawer.matches) {
    return elements.app.classList.contains("sidebar-open");
  }
  return !elements.app.classList.contains("sidebar-closed");
}

function syncDrawerState() {
  const mobile = mqDrawer.matches;
  const open = elements.app.classList.contains("sidebar-open");
  elements.sidebar.inert = mobile && !open;
  document.body.classList.toggle("drawer-open", mobile && open);
  const expanded = String(isSidebarVisible());
  elements.btnCollapse.setAttribute("aria-expanded", expanded);
  elements.btnOpen.setAttribute("aria-expanded", expanded);
}

function openSidebar() {
  elements.app.classList.add("sidebar-open");
  elements.app.classList.remove("sidebar-closed");
  syncDrawerState();
}

function closeSidebar() {
  elements.app.classList.remove("sidebar-open");
  elements.app.classList.add("sidebar-closed");
  syncDrawerState();
}

function closeSidebarMobile() {
  if (mqDrawer.matches) {
    closeSidebar();
  }
}

mqDrawer.addEventListener("change", syncDrawerState);

/* --------------------------------------------------------------------------
   Tema
   -------------------------------------------------------------------------- */

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  syncThemeUI(theme);
}

function resolveCurrentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return null;
}

function syncThemeUI(current) {
  const effective =
    current ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  elements.themeOptions.forEach((opt) => {
    const isActive = opt.dataset.theme === effective;
    opt.setAttribute("aria-checked", String(isActive));
  });
}

function chooseTheme(theme) {
  const stored = resolveCurrentTheme();
  if (stored === theme) {
    localStorage.removeItem(THEME_KEY);
    applyTheme(null);
    toast({ message: "tema: sistema" });
    return;
  }
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

/* --------------------------------------------------------------------------
   Eventos
   -------------------------------------------------------------------------- */

function bindEvents() {
  elements.btnSave.addEventListener("click", save);
  elements.btnNew.addEventListener("click", newPrompt);
  elements.btnCopy.addEventListener("click", copySelected);
  elements.btnCollapse.addEventListener("click", closeSidebar);
  elements.btnOpen.addEventListener("click", openSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);
  if (elements.btnLogout) elements.btnLogout.addEventListener("click", logout);

  elements.btnImprove.addEventListener("click", handleImproveClick);
  elements.improvePopover.addEventListener("click", (ev) => {
    const opt = ev.target.closest(".improve-popover-option");
    if (!opt || opt.disabled) return;
    openImproveOverlay(opt.dataset.provider);
  });
  elements.improveOverlayProviders.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".improve-overlay-provider");
    if (!btn || btn.disabled) return;
    switchOverlayProvider(btn.dataset.provider);
  });
  elements.improveOverlayRun.addEventListener("click", runImprove);
  elements.improveOverlayApply.addEventListener("click", applyImprovement);
  elements.improveOverlayDiscard.addEventListener("click", closeImproveOverlay);
  elements.improveOverlayClose.addEventListener("click", closeImproveOverlay);
  elements.improveOverlayInstruction.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      runImprove();
    }
  });

  elements.search.addEventListener("input", (e) => {
    renderList(e.target.value);
  });

  elements.list.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-action='remove']");
    const moveBtn = event.target.closest("[data-action='move']");
    const item = event.target.closest("[data-id]");
    if (!item) return;
    const id = item.getAttribute("data-id");

    if (removeBtn) {
      event.stopPropagation();
      removePrompt(id);
      return;
    }
    if (moveBtn) {
      event.stopPropagation();
      openMovePopover(id, moveBtn);
      return;
    }
    selectPrompt(id);
  });

  /* Drag-and-drop ----------------------------------------------------------
     Prompt → Rail: arrasta um item da lista pro projeto/sem projeto e o
     servidor recebe um PATCH com o novo projectId.
     Projeto → Projeto: arrasta um projeto do rail e solta sobre outro pra
     reordenar (metade superior = inserir antes; metade inferior = depois).
     Mime types isolados (DRAG_PROMPT/DRAG_PROJECT) impedem que outras
     fontes (texto qualquer arrastado pra UI) gerem drops espúrios. */

  elements.list.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".toc-item");
    if (!item) return;
    // Iniciar drag a partir de botão (mover/excluir) é raramente intencional —
    // bloqueia pra preservar a interação esperada.
    if (event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    const id = item.getAttribute("data-id");
    if (!id) return;
    event.dataTransfer.setData(DRAG_PROMPT, id);
    event.dataTransfer.effectAllowed = "move";
    dragState.kind = "prompt";
    item.classList.add("is-dragging");
    // Auto-expansão do rail é feita no dragenter de projectsList — fazer aqui
    // expande mesmo em "drags fantasma" (clique com mínimo tremor dispara
    // dragstart no Windows), e a expansão persiste mesmo sem drop.
  });

  elements.list.addEventListener("dragend", (event) => {
    const item = event.target.closest(".toc-item");
    if (item) item.classList.remove("is-dragging");
    dragState.kind = null;
    clearDropTargets();
  });

  elements.projectsList.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".projects-item");
    if (!item) return;
    // Não inicia drag a partir de botão "×" ou input de rename — preserva
    // o uso esperado desses controles.
    if (event.target.closest("button, input")) {
      event.preventDefault();
      return;
    }
    const projectId = item.dataset.projectId;
    if (!projectId) {
      // Entrada virtual ("todos"/"sem projeto") — não arrasta.
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(DRAG_PROJECT, projectId);
    event.dataTransfer.effectAllowed = "move";
    dragState.kind = "project";
    item.classList.add("is-dragging");
    // Auto-expansão é tratada no dragenter de projectsList — evita expandir
    // por um "drag fantasma" (clique com tremor de mouse no Windows dispara
    // dragstart) e ficar com o rail aberto sem o user ter feito drag de fato.
  });

  elements.projectsList.addEventListener("dragend", (event) => {
    const item = event.target.closest(".projects-item");
    if (item) item.classList.remove("is-dragging");
    dragState.kind = null;
    dragState.reorderHint = null;
    clearDropTargets();
  });

  // Auto-expande o rail quando um drag de prompt/projeto realmente entra na
  // área — sem isso o user só conseguiria soltar nos 5 visíveis quando o
  // rail está recolhido. Disparar no dragstart era frágil: um clique simples
  // com leve tremor já é interpretado como dragstart pelo browser, expandindo
  // o rail mesmo sem o user pretender mover nada.
  elements.projectsList.addEventListener("dragenter", (event) => {
    const kind = pickDragKind(event.dataTransfer.types);
    if (!kind) return;
    if (state.projectsExpanded) return;
    if (state.projects.length <= PROJECTS_COLLAPSE_LIMIT) return;
    state.projectsExpanded = true;
    renderProjects();
  });

  elements.projectsList.addEventListener("dragover", (event) => {
    const kind = pickDragKind(event.dataTransfer.types);
    if (!kind) return;
    const item = event.target.closest(".projects-item");
    if (!item) return;
    const key = item.dataset.key;
    const projectId = item.dataset.projectId;

    if (kind === "prompt") {
      // "todos" não é alvo válido de move — não muda nada (é só filtro).
      if (key === "all") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropTargets();
      item.classList.add("is-drop-target");
      return;
    }

    if (kind === "project") {
      // Reorder só entre projetos reais — virtual recusa.
      if (!projectId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = item.getBoundingClientRect();
      const before = event.clientY - rect.top < rect.height / 2;
      dragState.reorderHint = { targetId: projectId, before };
      clearDropTargets();
      item.classList.add(before ? "is-drop-before" : "is-drop-after");
    }
  });

  elements.projectsList.addEventListener("dragleave", (event) => {
    // Limpa só quando o ponteiro sai do rail inteiro — dragleave dispara em
    // cada filho ao mover entre eles, e clearDropTargets() ali cria flicker.
    if (!elements.projectsList.contains(event.relatedTarget)) {
      clearDropTargets();
    }
  });

  elements.projectsList.addEventListener("drop", (event) => {
    const kind = pickDragKind(event.dataTransfer.types);
    if (!kind) return;
    const item = event.target.closest(".projects-item");
    if (!item) return;
    event.preventDefault();
    const key = item.dataset.key;
    const projectId = item.dataset.projectId;

    if (kind === "prompt") {
      const promptId = event.dataTransfer.getData(DRAG_PROMPT);
      if (!promptId) {
        clearDropTargets();
        return;
      }
      if (key === "all") {
        clearDropTargets();
        return;
      }
      const newProjectId = key === "none" ? null : projectId;
      movePromptToProject(promptId, newProjectId);
    } else if (kind === "project") {
      if (!projectId) {
        clearDropTargets();
        return;
      }
      const sourceId = event.dataTransfer.getData(DRAG_PROJECT);
      if (!sourceId || sourceId === projectId) {
        clearDropTargets();
        return;
      }
      const before = dragState.reorderHint?.before ?? true;
      reorderProjectByDrop(sourceId, projectId, before);
    }
    clearDropTargets();
  });

  /* Rail de projetos — clique em row seleciona filtro, "×" exclui projeto,
     duplo-clique no nome renomeia inline. Event delegation única, sem
     handlers por linha. */
  elements.projectsList.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-action='remove-project']");
    if (removeBtn) {
      event.stopPropagation();
      removeProject(removeBtn.dataset.projectId);
      return;
    }
    const item = event.target.closest("[data-action='select-project']");
    if (!item) return;
    const key = item.dataset.key;
    if (key === "all") setActiveProject({ type: "all" });
    else if (key === "none") setActiveProject({ type: "none" });
    else setActiveProject({ type: "id", id: key });
  });

  elements.projectsList.addEventListener("dblclick", (event) => {
    const nameSpan = event.target.closest("[data-action='rename-project']");
    if (!nameSpan) return;
    event.preventDefault();
    renameProjectInline(nameSpan.dataset.projectId, nameSpan);
  });

  elements.projectsList.addEventListener("keydown", (event) => {
    const item = event.target.closest(".projects-item");
    if (!item) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      item.click();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      const id = item.dataset.projectId;
      if (id) {
        event.preventDefault();
        removeProject(id);
      }
    }
  });

  elements.btnAddProject.addEventListener("click", () => {
    if (elements.projectsNew.hidden) openNewProjectInput();
    else closeNewProjectInput();
  });

  /* Filter + disclosure do rail ------------------------------------------- */
  elements.projectsFilterInput.addEventListener("input", (event) => {
    state.projectsFilter = event.target.value;
    renderProjects();
  });

  elements.projectsFilterInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (state.projectsFilter) {
        state.projectsFilter = "";
        elements.projectsFilterInput.value = "";
        renderProjects();
      } else {
        elements.projectsFilterInput.blur();
      }
    }
  });

  elements.projectsDisclosure.addEventListener("click", () => {
    state.projectsExpanded = !state.projectsExpanded;
    renderProjects();
  });

  elements.projectsNew.addEventListener("submit", (event) => {
    event.preventDefault();
    submitNewProject();
  });

  elements.projectsNewInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNewProjectInput();
    }
  });

  elements.projectsNewInput.addEventListener("blur", () => {
    // Commit on blur — clicar fora confirma se há nome, fecha se vazio.
    // Atraso curto deixa o handler do Enter (que também faz submit) ganhar
    // primeiro, evitando duas chamadas concorrentes.
    setTimeout(() => {
      if (!elements.projectsNew.hidden) submitNewProject();
    }, 80);
  });

  elements.list.addEventListener("keydown", (event) => {
    const item = event.target.closest(".toc-item");
    if (!item) return;
    const id = item.getAttribute("data-id");
    const items = [...elements.list.querySelectorAll(".toc-item")];
    const idx = items.indexOf(item);

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPrompt(id);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      prev?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removePrompt(id);
    }
  });

  elements.themeOptions.forEach((opt) => {
    opt.addEventListener("click", () => chooseTheme(opt.dataset.theme));
  });

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  systemDark.addEventListener("change", () => {
    if (!resolveCurrentTheme()) {
      syncThemeUI(null);
    }
  });

  document.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target;
    const inEditable =
      target &&
      (target === elements.promptTitle ||
        target === elements.promptContent ||
        target === elements.search);

    if (meta && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      save();
      return;
    }
    if (meta && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      elements.search.focus();
      elements.search.select();
      return;
    }
    if (e.key === "Escape") {
      if (target === elements.search) {
        elements.search.value = "";
        renderList("");
        elements.search.blur();
        return;
      }
      if (mqDrawer.matches && elements.app.classList.contains("sidebar-open")) {
        closeSidebar();
        return;
      }
      if (inEditable) {
        elements.promptTitle.blur();
        elements.promptContent.blur();
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function armIdleWatcher(session) {
  const minutes = Number(session?.idleTimeoutMin || 0);
  if (!minutes || minutes <= 0) return;
  startIdleWatcher({
    timeoutMs: minutes * 60 * 1000,
    onExpire: async () => {
      try { await endpoints.logout(); } catch { /* sessão pode já estar morta */ }
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}&reason=idle`;
    },
  });
}

async function init() {
  api.onUnauthorized = () => {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  };

  applyTheme(resolveCurrentTheme());
  // Chrome envolve novos blocos em <div> por padrão; <p> deixa formatBlock e o
  // CSS de .prompt-content p (margens, espaçamento) funcionarem coerentes.
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}
  attachEditableHandlers();
  updateAllEditableStates();
  bindEvents();
  /* Sincroniza inert/aria síncronamente, antes do await da rede.
     CSS já cuida do visual (drawer offscreen no mobile por padrão). */
  syncDrawerState();

  try {
    const { user, session } = await endpoints.me();
    state.currentUser = user;
    if (elements.userDisplay) {
      /* Prefere "firstName lastName"; cai pro displayName (Google OAuth costuma
         preencher ele) e, sem nada disso, pro handle do e-mail. E-mail nunca
         é exposto em title/aria-label — quem inspeciona o DOM (screenshot,
         shoulder-surfing, extensão) só vê o nome. */
      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const at = user.email.lastIndexOf("@");
      const handle = at > 0 ? user.email.slice(0, at) : user.email;
      const label = fullName || user.displayName || handle;
      elements.userDisplay.textContent = label;
    }
    armIdleWatcher(session);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    throw err;
  }

  // Projects antes de prompts: o filtro persistido em localStorage pode ter
  // virado um id que não existe mais; loadProjects() corrige isso pra "todos"
  // antes de loadPrompts() consultar o backend com o filtro.
  await loadProjects();
  await loadPrompts();
  updateMainMeta();
  updateImproveButtonState();
  checkLegacyStorage();

  if (!mqDrawer.matches && !state.selectedId) {
    elements.promptTitle.focus();
  }
}

init();
