import { endpoints, ApiError } from "/static/js/api.js?v=20260504d";

const form = document.getElementById("forgot-form");
const email = document.getElementById("email");
const submit = document.getElementById("auth-submit");
const error = document.getElementById("auth-error");
const done = document.getElementById("forgot-done");
const doneEmail = document.getElementById("forgot-done-email");
const again = document.getElementById("forgot-again");

function showError(msg) {
  error.textContent = msg;
  error.hidden = false;
}
function clearError() {
  error.textContent = "";
  error.hidden = true;
}

email.addEventListener("input", clearError);

function showDoneFor(addr) {
  doneEmail.textContent = addr;
  form.hidden = true;
  done.hidden = false;
}

function resetToForm() {
  done.hidden = true;
  form.hidden = false;
  email.focus();
  email.select();
}

again.addEventListener("click", resetToForm);

async function submitForgot() {
  clearError();
  const mail = email.value.trim();
  if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    showError("email inválido.");
    email.focus();
    return;
  }

  submit.disabled = true;
  const originalLabel = submit.textContent;
  submit.textContent = "enviando…";

  try {
    await endpoints.forgotPassword({ email: mail });
    showDoneFor(mail);
  } catch (err) {
    if (err instanceof ApiError && err.code === "rate_limited") {
      showError("muitas tentativas — aguarde alguns minutos e tente de novo.");
    } else if (err instanceof ApiError) {
      showError(err.message || "falha ao enviar link");
    } else {
      showError("falha inesperada — tente novamente");
      console.error(err);
    }
    submit.disabled = false;
    submit.textContent = originalLabel;
    return;
  }

  submit.disabled = false;
  submit.textContent = originalLabel;
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitForgot();
});

email.focus();
