import { endpoints, ApiError } from "/static/js/api.js";

const form = document.getElementById("auth-form");
const reveal = document.getElementById("auth-reveal");
const password = document.getElementById("password");
const email = document.getElementById("email");
const keep = document.getElementById("auth-keep");
const submit = document.getElementById("auth-submit");
const error = document.getElementById("auth-error");
const tabs = document.querySelectorAll(".auth-tab");
const tabsList = document.querySelector(".auth-tabs");
const heading = document.querySelector(".auth-heading");
const titleEl = document.getElementById("auth-title");
const subtitleEl = document.getElementById("auth-subtitle");
const nameRow = document.getElementById("auth-name-row");
const firstName = document.getElementById("first-name");
const lastName = document.getElementById("last-name");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let mode = "login";

// Reanima o heading quando o modo troca — fade-in + leve subida.
// Sem WAAPI, o swap de textContent ficaria abrupto.
function animateHeadingSwap() {
  if (reducedMotion.matches || !heading || !heading.animate) return;
  heading.animate(
    [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" },
  );
}

const EMAIL_TYPO_DOMAINS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

function validateEmail(raw) {
  const value = (raw || "").trim();
  if (!value) return { ok: false, message: "Informe seu email." };
  if (value.length > 254) {
    return { ok: false, message: "Email muito longo (máx. 254 caracteres)." };
  }
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) {
    return { ok: false, message: "Email inválido — verifique o formato." };
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (local.length > 64) {
    return { ok: false, message: "Parte antes do @ muito longa (máx. 64)." };
  }
  if (!/^[a-zA-Z0-9._%+\-]+$/.test(local)) {
    return { ok: false, message: "Caracteres inválidos antes do @." };
  }
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, message: "Pontos só no meio do email, sem repetir." };
  }
  if (!/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/.test(domain)) {
    return { ok: false, message: "Domínio do email inválido." };
  }
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (tld.length < 2) {
    return { ok: false, message: "Domínio do email inválido." };
  }
  const suggestion = EMAIL_TYPO_DOMAINS[domain];
  if (suggestion) {
    return {
      ok: false,
      message: `Domínio "${domain}" parece errado — você quis dizer "${suggestion}"?`,
    };
  }
  return { ok: true, value: value.toLowerCase() };
}

function showError(msg) {
  error.textContent = msg;
  error.hidden = false;
}
function clearError() {
  error.textContent = "";
  error.hidden = true;
}

function setMode(next) {
  const previous = mode;
  mode = next;
  tabs.forEach((t) => {
    const active = t.dataset.mode === next;
    t.setAttribute("aria-selected", String(active));
  });
  if (tabsList) tabsList.dataset.mode = next;
  const isRegister = next === "register";
  if (isRegister) {
    titleEl.textContent = "Criar Conta";
    subtitleEl.textContent = "Nova conta — começa vazia, pronta pra colar prompts.";
    submit.textContent = "Criar Conta";
    password.autocomplete = "new-password";
  } else {
    titleEl.textContent = "Entrar";
    subtitleEl.textContent = "Acesse sua biblioteca de prompts.";
    submit.textContent = "Entrar";
    password.autocomplete = "current-password";
  }
  nameRow.dataset.shown = String(isRegister);
  nameRow.setAttribute("aria-hidden", String(!isRegister));
  if (isRegister) {
    nameRow.removeAttribute("inert");
  } else {
    nameRow.setAttribute("inert", "");
  }
  firstName.required = isRegister;
  lastName.required = isRegister;
  clearError();
  if (previous !== next) animateHeadingSwap();
}

tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

email.addEventListener("input", clearError);
password.addEventListener("input", clearError);
firstName.addEventListener("input", clearError);
lastName.addEventListener("input", clearError);

reveal.addEventListener("click", () => {
  const pressed = reveal.getAttribute("aria-pressed") === "true";
  const nextPressed = !pressed;
  reveal.setAttribute("aria-pressed", String(nextPressed));
  reveal.textContent = nextPressed ? "Ocultar" : "Mostrar";
  reveal.setAttribute(
    "aria-label",
    nextPressed ? "Ocultar senha" : "Mostrar senha",
  );
  password.type = nextPressed ? "text" : "password";
});

function redirectAfterAuth() {
  const params = new URLSearchParams(window.location.search);
  let next = params.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  window.location.href = next;
}

async function submitAuth() {
  clearError();
  const mail = email.value.trim();
  const pass = password.value;
  const first = firstName.value.trim();
  const last = lastName.value.trim();

  if (mode === "register") {
    if (!first) {
      showError("Informe seu nome.");
      firstName.focus();
      return;
    }
    if (!last) {
      showError("Informe seu sobrenome.");
      lastName.focus();
      return;
    }
  }
  const emailCheck = validateEmail(mail);
  if (!emailCheck.ok) {
    showError(emailCheck.message);
    email.focus();
    return;
  }
  if (pass.length < 8) {
    showError("Senha precisa ter pelo menos 8 caracteres.");
    password.focus();
    return;
  }

  submit.disabled = true;
  const originalLabel = submit.textContent;
  submit.textContent = mode === "register" ? "Criando…" : "Autenticando…";

  try {
    const body = { email: emailCheck.value, password: pass, keep: keep.checked };
    if (mode === "register") {
      body.firstName = first;
      body.lastName = last;
      await endpoints.register(body);
    } else {
      await endpoints.login(body);
    }
    redirectAfterAuth();
  } catch (err) {
    if (err instanceof ApiError) {
      showError(err.message || "Falha na autenticação");
    } else {
      showError("Falha inesperada — tente novamente");
      console.error(err);
    }
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitAuth();
});

document.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
    ev.preventDefault();
    form.requestSubmit();
  }
});

// Mostra erros vindos do callback do OAuth (?error=...) de forma amigável.
const OAUTH_ERRORS = {
  google_disabled: "Login com google não está configurado neste servidor.",
  oauth_state: "Sessão do login com google expirou — tente novamente.",
  oauth_token: "O google recusou o login — tente novamente.",
  oauth_network: "Falha de rede ao falar com o google.",
  oauth_profile: "O google não retornou email/identidade.",
  oauth_email_unverified: "Email do google não verificado — use uma conta com email confirmado.",
  oauth_unexpected: "Falha inesperada no login com google.",
};
const REASON_MESSAGES = {
  idle: "Sua sessão expirou por inatividade. Entre novamente.",
};

(function () {
  const params = new URLSearchParams(window.location.search);
  const errCode = params.get("error");
  const reason = params.get("reason");
  if (errCode && OAUTH_ERRORS[errCode]) {
    showError(OAUTH_ERRORS[errCode]);
    params.delete("error");
  } else if (reason && REASON_MESSAGES[reason]) {
    showError(REASON_MESSAGES[reason]);
    params.delete("reason");
  }
  const rest = params.toString();
  const cleanUrl =
    window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash;
  if (cleanUrl !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState({}, "", cleanUrl);
  }
})();

email.focus();
