import { api, endpoints, ApiError } from "/static/js/api.js";

const PROVIDERS = ["anthropic", "openai", "gemini"];
const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

const state = {
  user: null,
  keys: { anthropic: null, openai: null, gemini: null },
};

const el = {
  accountEmail: document.getElementById("account-email"),
  accountName: document.getElementById("account-name"),
  accountGoogle: document.getElementById("account-google"),
  accountPassword: document.getElementById("account-password"),
  btnLogout: document.getElementById("btn-logout-settings"),
  providerOptions: document.querySelectorAll(".provider-option"),
  keysList: document.getElementById("keys-list"),
  tplKey: document.getElementById("tpl-key-row"),
  toast: document.getElementById("settings-toast"),
};

function showToast(msg, variant = "info") {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  el.toast.dataset.variant = variant;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.toast.hidden = true;
  }, 2800);
}

function formatRelative(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

function renderAccount() {
  const u = state.user;
  if (!u) return;
  el.accountEmail.textContent = u.email;

  const fullName = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ");
  el.accountName.textContent = fullName || "—";
  el.accountName.classList.toggle("is-empty", !fullName);

  el.accountGoogle.textContent = u.hasGoogle ? "Conectado" : "Não conectado";
  el.accountGoogle.classList.toggle("is-empty", !u.hasGoogle);

  el.accountPassword.textContent = u.hasPassword ? "Definida" : "Sem senha (login só via google)";
  el.accountPassword.classList.toggle("is-empty", !u.hasPassword);
}

function renderDefaultProvider() {
  const current = state.user?.defaultProvider || "";
  el.providerOptions.forEach((opt) => {
    const active = (opt.dataset.provider || "") === current;
    opt.setAttribute("aria-checked", String(active));
    opt.classList.toggle("is-active", active);
  });
}

function renderKeys() {
  el.keysList.innerHTML = "";
  for (const p of PROVIDERS) {
    const node = el.tplKey.content.firstElementChild.cloneNode(true);
    node.dataset.provider = p;
    node.querySelector('[data-slot="provider"]').textContent = PROVIDER_LABELS[p];
    const info = state.keys[p];
    updateRowVisuals(node, info);
    el.keysList.appendChild(node);
  }
}

function updateRowVisuals(row, info) {
  const display = row.querySelector('[data-slot="display"]');
  const status = row.querySelector('[data-slot="status"]');
  const editBtn = row.querySelector('[data-action="edit"]');
  const removeBtn = row.querySelector('[data-action="remove"]');
  if (info?.connected) {
    display.textContent = `···${info.last4}`;
    status.textContent = `Conectado · ${formatRelative(info.updatedAt)}`;
    editBtn.textContent = "Trocar";
    removeBtn.hidden = false;
    row.classList.add("is-connected");
  } else {
    display.textContent = "—";
    status.textContent = "Não conectado";
    editBtn.textContent = "Conectar";
    removeBtn.hidden = true;
    row.classList.remove("is-connected");
  }
}

function openForm(row) {
  row.querySelector('[data-slot="form"]').hidden = false;
  row.classList.add("is-editing");
  const input = row.querySelector('[data-slot="input"]');
  input.value = "";
  input.focus();
}

function closeForm(row) {
  row.querySelector('[data-slot="form"]').hidden = true;
  row.classList.remove("is-editing");
}

async function handleSaveKey(row) {
  const provider = row.dataset.provider;
  const input = row.querySelector('[data-slot="input"]');
  const rawKey = input.value.trim();
  if (rawKey.length < 10) {
    showToast("Chave muito curta", "error");
    return;
  }
  const submit = row.querySelector('[data-action="save"]');
  submit.disabled = true;
  const originalLabel = submit.textContent;
  submit.textContent = "Salvando…";
  try {
    const info = await endpoints.saveApiKey(provider, rawKey);
    state.keys[provider] = info;
    if (state.user) state.user.hasKeys[provider] = true;
    input.value = "";
    closeForm(row);
    updateRowVisuals(row, info);
    showToast(`${PROVIDER_LABELS[provider] ?? provider} salvo`, "ok");
  } catch (err) {
    handleErr(err, "Falha ao salvar chave");
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
}

async function handleRemoveKey(row) {
  const provider = row.dataset.provider;
  const label = PROVIDER_LABELS[provider] ?? provider;
  if (!confirm(`Remover chave de ${label}?`)) return;
  try {
    await endpoints.deleteApiKey(provider);
    state.keys[provider] = null;
    if (state.user) state.user.hasKeys[provider] = false;
    updateRowVisuals(row, null);
    showToast(`${label} removida`);
  } catch (err) {
    handleErr(err, "Falha ao remover chave");
  }
}

function bindKeyEvents() {
  el.keysList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const row = btn.closest(".key-row");
    if (!row) return;
    const action = btn.dataset.action;
    if (action === "edit") openForm(row);
    else if (action === "cancel") closeForm(row);
    else if (action === "remove") handleRemoveKey(row);
  });

  el.keysList.addEventListener("submit", (event) => {
    const form = event.target.closest('[data-slot="form"]');
    if (!form) return;
    event.preventDefault();
    const row = form.closest(".key-row");
    handleSaveKey(row);
  });

  // Escape fecha o form aberto
  el.keysList.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const row = event.target.closest(".key-row.is-editing");
      if (row) {
        event.preventDefault();
        closeForm(row);
      }
    }
  });
}

function bindProviderEvents() {
  el.providerOptions.forEach((opt) => {
    opt.addEventListener("click", async () => {
      const raw = opt.dataset.provider || null;
      const provider = raw === "" ? null : raw;
      const previous = state.user?.defaultProvider ?? null;
      if (previous === provider) return;
      try {
        await endpoints.setDefaultProvider(provider);
        if (state.user) state.user.defaultProvider = provider;
        renderDefaultProvider();
        showToast(provider ? `Default: ${PROVIDER_LABELS[provider] ?? provider}` : "Default removido");
      } catch (err) {
        handleErr(err, "Falha ao atualizar provider padrão");
      }
    });
  });
}

function bindAccountEvents() {
  el.btnLogout.addEventListener("click", async () => {
    try {
      await endpoints.logout();
    } catch {
      /* ignora */
    }
    window.location.href = "/login";
  });
}

function handleErr(err, fallback) {
  if (err instanceof ApiError && err.status === 401) return;
  const msg = err instanceof ApiError ? err.message : fallback;
  console.error(err);
  showToast(msg || fallback, "error");
}

async function init() {
  api.onUnauthorized = () => {
    window.location.href = "/login?next=" + encodeURIComponent("/settings");
  };

  try {
    const [{ user }, keys] = await Promise.all([
      endpoints.me(),
      endpoints.listApiKeys(),
    ]);
    state.user = user;
    state.keys = keys;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    showToast("Falha ao carregar configurações", "error");
    console.error(err);
    return;
  }

  renderAccount();
  renderDefaultProvider();
  renderKeys();
  bindKeyEvents();
  bindProviderEvents();
  bindAccountEvents();
}

init();
