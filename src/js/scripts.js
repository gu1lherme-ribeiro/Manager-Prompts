const STORAGE_KEY = "prompts_storage";
const THEME_KEY = "prompts_theme";
const UNDO_WINDOW_MS = 5000;
const TOAST_DEFAULT_MS = 2400;
const HASH_LEN = 6;

const state = {
  prompts: [],
  selectedId: null,
  pendingDelete: null,
};

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
  toastRegion: document.getElementById("toast-region"),
  themeOptions: document.querySelectorAll(".theme-option"),
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

function idToTimestamp(id) {
  const n = parseInt(id, 36);
  return Number.isFinite(n) ? n : Date.now();
}

// Formato compacto: now, 2m, 3h, 5d, 2w, 3mo, 2y
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
   Persistência (retrocompatível)
   -------------------------------------------------------------------------- */

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prompts));
  } catch (error) {
    console.warn("Erro ao salvar no localStorage:", error);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.prompts = parsed.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      updatedAt:
        typeof p.updatedAt === "number" ? p.updatedAt : idToTimestamp(p.id),
    }));
    state.prompts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.warn("Erro ao carregar do localStorage:", error);
    state.prompts = [];
  }
  state.selectedId = null;
}

/* --------------------------------------------------------------------------
   Editor — placeholders e meta
   -------------------------------------------------------------------------- */

function updateEditableWrapperState(element, wrapper) {
  const hasText = element.textContent.trim().length > 0;
  wrapper.classList.toggle("is-empty", !hasText);
}

function updateAllEditableStates() {
  updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
  updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
}

function attachEditableHandlers() {
  elements.promptTitle.addEventListener("input", () => {
    updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
    updateMainMeta();
  });
  elements.promptContent.addEventListener("input", () => {
    updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
    updateMainMeta();
  });
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
  const count = wordCount(stripHtml(prompt.content));
  setMainStatus(`${shortHash(prompt.id)} · ${timeAgoCompact(prompt.updatedAt)} · ${count}w`);
}

/* --------------------------------------------------------------------------
   Lista
   -------------------------------------------------------------------------- */

function createPromptItem(prompt) {
  const isSelected = state.selectedId === prompt.id;
  const hash = shortHash(prompt.id);
  const time = timeAgoCompact(prompt.updatedAt);
  const words = wordCount(stripHtml(prompt.content));
  const title = prompt.title || "sem título";

  return `
    <li
      class="toc-item${isSelected ? " is-selected" : ""}"
      data-id="${escapeHtml(prompt.id)}"
      data-action="select"
      role="option"
      tabindex="0"
      aria-selected="${isSelected}"
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
      <button
        type="button"
        class="toc-item-remove"
        data-action="remove"
        aria-label="Excluir ${escapeHtml(title)}"
        title="Excluir"
      >×</button>
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
  elements.promptTitle.focus();
  closeSidebarMobile();
}

function save() {
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

  const now = Date.now();

  if (state.selectedId) {
    const existing = state.prompts.find((p) => p.id === state.selectedId);
    if (existing) {
      existing.title = title;
      existing.content = contentHtml;
      existing.updatedAt = now;
    }
    state.prompts.sort((a, b) => b.updatedAt - a.updatedAt);
    toast({
      messageHtml: `<strong>salvo</strong> <span class="hash">${escapeHtml(shortHash(state.selectedId))}</span>`,
    });
  } else {
    const newItem = {
      id: now.toString(36),
      title,
      content: contentHtml,
      updatedAt: now,
    };
    state.prompts.unshift(newItem);
    state.selectedId = newItem.id;
    toast({
      messageHtml: `<strong>criado</strong> <span class="hash">${escapeHtml(shortHash(newItem.id))}</span>`,
    });
  }

  persist();
  renderList(elements.search.value);
  updateMainMeta();
}

function selectPrompt(id) {
  const prompt = state.prompts.find((p) => p.id === id);
  if (!prompt) return;
  state.selectedId = id;
  elements.promptTitle.textContent = prompt.title;
  elements.promptContent.innerHTML = prompt.content;
  updateAllEditableStates();
  renderList(elements.search.value);
  updateMainMeta();
  closeSidebarMobile();
}

function removePrompt(id) {
  const index = state.prompts.findIndex((p) => p.id === id);
  if (index === -1) return;

  const [removed] = state.prompts.splice(index, 1);

  if (state.selectedId === id) {
    state.selectedId = null;
    elements.promptTitle.textContent = "";
    elements.promptContent.innerHTML = "";
    updateAllEditableStates();
  }

  persist();
  renderList(elements.search.value);
  updateMainMeta();

  if (state.pendingDelete) {
    clearTimeout(state.pendingDelete.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    state.pendingDelete = null;
  }, UNDO_WINDOW_MS);

  state.pendingDelete = { prompt: removed, index, timeoutId };

  toast({
    messageHtml: `<strong>removido</strong> <span class="hash">${escapeHtml(shortHash(removed.id))}</span>`,
    actionLabel: "desfazer",
    duration: UNDO_WINDOW_MS,
    onAction: undoDelete,
  });
}

function undoDelete() {
  if (!state.pendingDelete) return;
  const { prompt, index, timeoutId } = state.pendingDelete;
  clearTimeout(timeoutId);
  state.prompts.splice(Math.min(index, state.prompts.length), 0, prompt);
  state.prompts.sort((a, b) => b.updatedAt - a.updatedAt);
  persist();
  renderList(elements.search.value);
  state.pendingDelete = null;
  toast({ message: "restaurado" });
}

async function copySelected() {
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
    await navigator.clipboard.writeText(text);
    toast({ messageHtml: `<strong>copiado</strong> <span class="hash">${text.length}c</span>` });
  } catch (error) {
    console.error("Erro ao copiar:", error);
    toast({ message: "falha ao copiar", variant: "error" });
  }
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

/* --------------------------------------------------------------------------
   Sidebar
   -------------------------------------------------------------------------- */

function openSidebar() {
  elements.app.classList.remove("sidebar-closed");
  elements.sidebar.inert = false;
}

function closeSidebar() {
  elements.app.classList.add("sidebar-closed");
  elements.sidebar.inert = true;
}

function closeSidebarMobile() {
  if (window.matchMedia("(max-width: 720px)").matches) {
    closeSidebar();
  }
}

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
    // clicar no tema ativo volta para "seguir o sistema"
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

  elements.search.addEventListener("input", (e) => {
    renderList(e.target.value);
  });

  elements.list.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-action='remove']");
    const item = event.target.closest("[data-id]");
    if (!item) return;
    const id = item.getAttribute("data-id");

    if (removeBtn) {
      event.stopPropagation();
      removePrompt(id);
      return;
    }
    selectPrompt(id);
  });

  // Navegação por teclado na lista: ↑/↓ movem foco; Enter/Espaço abre; Backspace/Delete exclui
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

  // Atalhos
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
      if (window.matchMedia("(max-width: 720px)").matches && !elements.app.classList.contains("sidebar-closed")) {
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

function init() {
  load();
  applyTheme(resolveCurrentTheme());
  attachEditableHandlers();
  updateAllEditableStates();
  renderList();
  updateMainMeta();
  bindEvents();

  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  if (isMobile) {
    closeSidebar();
  } else if (!state.selectedId) {
    // Auto-foca o título no estado inicial em desktop
    elements.promptTitle.focus();
  }
}

init();
