import { endpoints, ApiError } from "/static/js/api.js?v=20260504d";

const form = document.getElementById("reset-form");
const reveal = document.getElementById("auth-reveal");
const password = document.getElementById("password");
const confirm = document.getElementById("confirm");
const submit = document.getElementById("auth-submit");
const error = document.getElementById("auth-error");
const invalid = document.getElementById("reset-invalid");
const invalidTag = document.getElementById("invalid-tag");
const invalidTitle = document.getElementById("invalid-title");
const invalidBody = document.getElementById("invalid-body");
const done = document.getElementById("reset-done");
const checkList = document.getElementById("check-list");
const checkLength = checkList.querySelector('[data-check="length"]');
const checkMatch = checkList.querySelector('[data-check="match"]');
const tokenTag = document.getElementById("log-token-tag");
const tokenMsg = document.getElementById("log-token-msg");
const waitLine = document.getElementById("log-wait-line");

const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";

function showError(msg) {
  error.textContent = msg;
  error.hidden = false;
}
function clearError() {
  error.textContent = "";
  error.hidden = true;
}

function setTokenLogState(state) {
  tokenTag.classList.remove("auth-log-tag--active", "auth-log-tag--danger");
  if (state === "ok") {
    tokenTag.textContent = "token";
    tokenMsg.textContent = "válido — expira em até 30 min";
  } else if (state === "missing") {
    tokenTag.textContent = "token";
    tokenTag.classList.add("auth-log-tag--danger");
    tokenMsg.textContent = "ausente ou inválido";
    if (waitLine) waitLine.hidden = true;
  } else {
    tokenMsg.textContent = "validando…";
  }
}

function showInvalid(title, body) {
  if (title) invalidTitle.textContent = title;
  if (body) invalidBody.textContent = body;
  form.hidden = true;
  invalid.hidden = false;
  done.hidden = true;
  setTokenLogState("missing");
}

function showDone() {
  form.hidden = true;
  invalid.hidden = true;
  done.hidden = false;
  tokenTag.textContent = "token";
  tokenMsg.textContent = "consumido · reset aplicado";
  if (waitLine) waitLine.hidden = true;
}

reveal.addEventListener("click", () => {
  const pressed = reveal.getAttribute("aria-pressed") === "true";
  const nextPressed = !pressed;
  reveal.setAttribute("aria-pressed", String(nextPressed));
  reveal.textContent = nextPressed ? "ocultar" : "mostrar";
  reveal.setAttribute("aria-label", nextPressed ? "Ocultar senha" : "Mostrar senha");
  const t = nextPressed ? "text" : "password";
  password.type = t;
  confirm.type = t;
});

function updateChecks() {
  const p = password.value;
  const c = confirm.value;
  const okLen = p.length >= 8;
  const okMatch = p.length > 0 && p === c;
  checkLength.classList.toggle("is-ok", okLen);
  checkMatch.classList.toggle("is-ok", okMatch);
  submit.disabled = !(okLen && okMatch);
  clearError();
}

password.addEventListener("input", updateChecks);
confirm.addEventListener("input", updateChecks);

async function submitReset() {
  clearError();
  const p = password.value;
  const c = confirm.value;
  if (p.length < 8) {
    showError("senha precisa ter pelo menos 8 caracteres.");
    password.focus();
    return;
  }
  if (p !== c) {
    showError("as senhas não coincidem.");
    confirm.focus();
    return;
  }

  submit.disabled = true;
  const originalLabel = submit.textContent;
  submit.textContent = "aplicando…";

  try {
    await endpoints.resetPassword({ token, password: p });
    showDone();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "token_expired") {
        showInvalid("link expirado", "este link passou de 30 min. peça um novo para continuar.");
        invalidTag.textContent = "expirou";
      } else if (err.code === "token_used") {
        showInvalid("link já usado", "este link só pode ser usado uma vez. peça um novo se precisar.");
        invalidTag.textContent = "usado";
      } else if (err.code === "token_invalid") {
        showInvalid("link inválido", "não foi possível validar este link. peça um novo.");
        invalidTag.textContent = "inválido";
      } else if (err.code === "rate_limited") {
        showError("muitas tentativas — aguarde alguns minutos.");
        submit.disabled = false;
        submit.textContent = originalLabel;
      } else {
        showError(err.message || "falha ao redefinir senha");
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    } else {
      showError("falha inesperada — tente novamente");
      console.error(err);
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  }
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitReset();
});

// Boot
if (!token || token.length < 16 || token.length > 200) {
  showInvalid(
    "link ausente ou inválido",
    "o endereço não contém um token válido. peça um novo link de reset.",
  );
} else {
  setTokenLogState("ok");
  form.hidden = false;
  password.focus();
}
