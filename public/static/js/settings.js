import { api, endpoints, ApiError } from "/static/js/api.js?v=20260508a";
import { startIdleWatcher } from "/static/js/idle.js?v=20260508a";

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

function armIdleWatcher(session) {
  const minutes = Number(session?.idleTimeoutMin || 0);
  if (!minutes || minutes <= 0) return;
  startIdleWatcher({
    timeoutMs: minutes * 60 * 1000,
    onExpire: async () => {
      try { await endpoints.logout(); } catch { /* sessão pode já estar morta */ }
      window.location.href =
        "/login?next=" + encodeURIComponent("/settings") + "&reason=idle";
    },
  });
}

async function init() {
  api.onUnauthorized = () => {
    window.location.href = "/login?next=" + encodeURIComponent("/settings");
  };

  let session = null;
  try {
    const [meRes, keys] = await Promise.all([
      endpoints.me(),
      endpoints.listApiKeys(),
    ]);
    state.user = meRes.user;
    state.keys = keys;
    session = meRes.session;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    showToast("Falha ao carregar configurações", "error");
    console.error(err);
    return;
  }

  armIdleWatcher(session);

  renderAccount();
  renderDefaultProvider();
  renderKeys();
  bindKeyEvents();
  bindProviderEvents();
  bindAccountEvents();
}

init();

/* =========================================================================
   MFA card — Verificação Em Dois Passos
   ========================================================================= */
const _$mfa = (id) => document.getElementById(id);

const _mfaCard = _$mfa("card-mfa");
if (_mfaCard) (function setupMfaCard() {
  const pill        = _$mfa("mfa-status-pill");
  const toggleBtn   = _$mfa("mfa-toggle-btn");
  const step1       = _$mfa("mfa-enable-step1");
  const step1Form   = _$mfa("mfa-enable-step1-form");
  const step1Pwd    = _$mfa("mfa-enable-pwd");
  const step1Err    = _$mfa("mfa-enable-step1-error");
  const step2       = _$mfa("mfa-enable-step2");
  const step2Form   = _$mfa("mfa-enable-step2-form");
  const step2Code   = _$mfa("mfa-enable-code");
  const step2Err    = _$mfa("mfa-enable-step2-error");
  const disableStep = _$mfa("mfa-disable-step");
  const disableForm = _$mfa("mfa-disable-form");
  const disablePwd  = _$mfa("mfa-disable-pwd");
  const disableErr  = _$mfa("mfa-disable-error");
  const devices     = _$mfa("mfa-devices");
  const devicesList = _$mfa("mfa-devices-list");
  const revokeAll   = _$mfa("mfa-revoke-all");

  let mfaState = { enabled: false, challengeId: null };

  function setStep(id) {
    [step1, step2, disableStep].forEach((el) => {
      const on = el.id === id;
      el.dataset.shown = on ? "true" : "false";
      if (on) el.removeAttribute("inert"); else el.setAttribute("inert", "");
    });
  }

  function renderMfaState({ enabled, trustedDevices }) {
    mfaState.enabled = enabled;
    pill.dataset.on = String(enabled);
    pill.textContent = enabled ? "on" : "off";
    toggleBtn.textContent = enabled ? "Desativar" : "Ativar";
    devices.dataset.shown = enabled ? "true" : "false";
    devices.hidden = !enabled;
    if (enabled) renderDevices(trustedDevices || []);
  }

  function renderDevices(list) {
    devicesList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "trusted-device-item";
      li.innerHTML = `<div class="trusted-device-meta">// nenhum dispositivo confiável ainda</div>`;
      devicesList.appendChild(li);
      return;
    }
    for (const d of list) {
      const li = document.createElement("li");
      li.className = "trusted-device-item";
      const ua   = (d.userAgent || "navegador desconhecido").slice(0, 60);
      const ip   = d.ip || "—";
      const last = _mfaRelative(new Date(d.lastUsedAt));
      li.innerHTML = `
        <div class="trusted-device-meta">
          <div class="trusted-device-ua">${_mfaEsc(ua)}</div>
          <div>ip ${_mfaEsc(ip)} · usado ${_mfaEsc(last)}</div>
        </div>
        <button type="button" class="btn-ghost" data-revoke="${_mfaEsc(d.id)}">revogar</button>
      `;
      devicesList.appendChild(li);
    }
  }

  function _mfaEsc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function _mfaRelative(d) {
    const ms  = Date.now() - d.getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1)  return "agora";
    if (min < 60) return `há ${min}min`;
    const h   = Math.floor(min / 60);
    if (h < 24)   return `há ${h}h`;
    const days = Math.floor(h / 24);
    return `há ${days}d`;
  }

  async function loadMfa() {
    try {
      const r = await endpoints.getMfa();
      renderMfaState(r);
    } catch (err) {
      console.error("[mfa] load failed", err);
    }
  }

  toggleBtn.addEventListener("click", () => {
    if (mfaState.enabled) {
      setStep("mfa-disable-step");
      disablePwd.focus();
    } else {
      setStep("mfa-enable-step1");
      step1Pwd.focus();
    }
  });

  _mfaCard.querySelectorAll("[data-mfa-cancel]").forEach((b) => {
    b.addEventListener("click", () => {
      setStep(null);
      step1Pwd.value = "";
      step2Code.value = "";
      disablePwd.value = "";
      step1Err.hidden = true;
      step2Err.hidden = true;
      disableErr.hidden = true;
    });
  });

  step1Form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    step1Err.hidden = true;
    try {
      const r = await endpoints.enableMfaStep1({ password: step1Pwd.value });
      mfaState.challengeId = r.challengeId;
      step1Pwd.value = "";
      setStep("mfa-enable-step2");
      step2Code.focus();
    } catch (err) {
      step1Err.textContent = err instanceof ApiError ? err.message : "Falha.";
      step1Err.hidden = false;
    }
  });

  step2Form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    step2Err.hidden = true;
    const code = step2Code.value.replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      step2Err.textContent = "Digite os 6 dígitos.";
      step2Err.hidden = false;
      return;
    }
    try {
      await endpoints.enableMfaStep2({ challengeId: mfaState.challengeId, code });
      step2Code.value = "";
      setStep(null);
      await loadMfa();
    } catch (err) {
      step2Err.textContent = err instanceof ApiError ? err.message : "Falha.";
      step2Err.hidden = false;
    }
  });

  disableForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    disableErr.hidden = true;
    try {
      await endpoints.disableMfa({ password: disablePwd.value });
      disablePwd.value = "";
      setStep(null);
      await loadMfa();
    } catch (err) {
      disableErr.textContent = err instanceof ApiError ? err.message : "Falha.";
      disableErr.hidden = false;
    }
  });

  devicesList.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-revoke]");
    if (!btn) return;
    const id = btn.dataset.revoke;
    try {
      await endpoints.revokeTrustedDevice(id);
      await loadMfa();
    } catch (err) {
      console.error("[mfa] revoke failed", err);
    }
  });

  revokeAll.addEventListener("click", async () => {
    try {
      await endpoints.revokeAllTrustedDevices();
      await loadMfa();
    } catch (err) {
      console.error("[mfa] revokeAll failed", err);
    }
  });

  loadMfa();
})();

/* =========================================================================
   Presets de improve — CRUD + default
   ========================================================================= */
const _presetsSection = document.getElementById("presets-list");
if (_presetsSection) (function setupPresets() {
  const list      = _presetsSection;
  const empty     = document.getElementById("presets-empty");
  const tpl       = document.getElementById("tpl-preset-row");
  const btnAdd    = document.getElementById("presets-add");
  const form      = document.getElementById("presets-form");
  const nameInput = document.getElementById("presets-form-name");
  const promptTa  = document.getElementById("presets-form-system-prompt");
  const counter   = document.getElementById("presets-form-counter");
  const btnRestore= document.getElementById("presets-form-restore");
  const btnCancel = document.getElementById("presets-form-cancel");
  const btnSave   = document.getElementById("presets-form-save");
  const errBox    = document.getElementById("presets-form-error");

  // editingId: null = criando, "<id>" = editando aquele preset
  const presetState = {
    items: [],
    template: "",
    defaultId: null,
    editingId: null,
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function preview(text) {
    const norm = (text || "").replace(/\s+/g, " ").trim();
    return norm.length > 120 ? norm.slice(0, 120) + "…" : norm;
  }

  function renderList() {
    list.innerHTML = "";
    if (!presetState.items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const p of presetState.items) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      node.querySelector('[data-slot="name"]').textContent = p.name;
      const isDefault = p.id === presetState.defaultId;
      const badge = node.querySelector('[data-slot="default-badge"]');
      badge.hidden = !isDefault;
      if (isDefault) node.classList.add("is-default");
      const setDefaultBtn = node.querySelector('[data-action="set-default"]');
      setDefaultBtn.textContent = isDefault ? "remover padrão" : "tornar padrão";
      node.querySelector('[data-slot="preview"]').textContent = preview(p.systemPrompt);
      list.appendChild(node);
    }
  }

  function showFormError(msg) {
    errBox.textContent = msg;
    errBox.hidden = false;
  }
  function clearFormError() {
    errBox.hidden = true;
    errBox.textContent = "";
  }

  function updateCounter() {
    const n = promptTa.value.length;
    counter.textContent = `${n} / 4000`;
    counter.classList.toggle("is-over", n >= 4000);
  }

  function openForm(preset) {
    presetState.editingId = preset?.id || null;
    nameInput.value = preset?.name || "";
    promptTa.value = preset?.systemPrompt || presetState.template || "";
    updateCounter();
    clearFormError();
    form.hidden = false;
    btnAdd.hidden = true;
    nameInput.focus();
  }

  function closeForm() {
    form.hidden = true;
    btnAdd.hidden = false;
    presetState.editingId = null;
    nameInput.value = "";
    promptTa.value = "";
    clearFormError();
  }

  async function loadPresets() {
    try {
      const r = await endpoints.listImprovePresets();
      presetState.items = r.items || [];
      presetState.template = r.template || "";
      presetState.defaultId = r.defaultId || null;
      renderList();
    } catch (err) {
      handleErr(err, "Falha ao carregar presets");
    }
  }

  async function handleSave() {
    const name = nameInput.value.trim();
    const systemPrompt = promptTa.value.trim();
    if (!name) {
      showFormError("Informe um nome.");
      return;
    }
    if (!systemPrompt) {
      showFormError("System prompt vazio.");
      return;
    }
    btnSave.disabled = true;
    const original = btnSave.textContent;
    btnSave.textContent = "Salvando…";
    try {
      let saved;
      if (presetState.editingId) {
        saved = await endpoints.updateImprovePreset(presetState.editingId, { name, systemPrompt });
        presetState.items = presetState.items.map((p) => (p.id === saved.id ? saved : p));
      } else {
        saved = await endpoints.createImprovePreset({ name, systemPrompt });
        presetState.items = [saved, ...presetState.items];
      }
      // Reordena por updatedAt desc — mesma regra do servidor.
      presetState.items.sort((a, b) => b.updatedAt - a.updatedAt);
      renderList();
      closeForm();
      showToast("Preset salvo", "ok");
    } catch (err) {
      btnSave.disabled = false;
      btnSave.textContent = original;
      const msg = err instanceof ApiError ? err.message : "Falha ao salvar";
      showFormError(msg);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remover preset "${name}"?`)) return;
    try {
      await endpoints.deleteImprovePreset(id);
      presetState.items = presetState.items.filter((p) => p.id !== id);
      // FK SetNull no servidor já zerou o default se era esse — refletir local.
      if (presetState.defaultId === id) presetState.defaultId = null;
      renderList();
      showToast(`"${name}" removido`);
    } catch (err) {
      handleErr(err, "Falha ao remover preset");
    }
  }

  async function handleSetDefault(id) {
    // Toggle: clicar no que já é default = remove default (manda null).
    const next = presetState.defaultId === id ? null : id;
    try {
      await endpoints.setDefaultImprovePreset(next);
      presetState.defaultId = next;
      renderList();
      showToast(next ? "Default atualizado" : "Default removido");
    } catch (err) {
      handleErr(err, "Falha ao atualizar default");
    }
  }

  // Events
  btnAdd.addEventListener("click", () => openForm(null));
  btnCancel.addEventListener("click", closeForm);
  btnRestore.addEventListener("click", () => {
    promptTa.value = presetState.template || "";
    updateCounter();
    promptTa.focus();
  });
  promptTa.addEventListener("input", updateCounter);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    handleSave();
  });
  // Escape no form fecha (se nada estava sendo digitado intensivamente)
  form.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeForm();
    }
  });

  list.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const row = btn.closest(".preset-row");
    if (!row) return;
    const id = row.dataset.id;
    const preset = presetState.items.find((p) => p.id === id);
    if (!preset) return;
    const action = btn.dataset.action;
    if (action === "edit") openForm(preset);
    else if (action === "remove") handleDelete(id, preset.name);
    else if (action === "set-default") handleSetDefault(id);
  });

  loadPresets();
})();
