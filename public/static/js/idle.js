// Watcher de ociosidade. Reseta um timer em qualquer atividade do usuário e
// dispara onExpire quando passa do limite. O backend já expira a sessão por
// idle (lastUsedAt) — esse módulo só antecipa o redirect, sem esperar a
// próxima request 401.

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
];

// Eventos como mousemove disparam dezenas de vezes por segundo. Em vez de
// resetar o timer em cada um, marcamos "houve atividade" e o próprio timer
// se reagenda — custo O(1) por evento.
export function startIdleWatcher({ timeoutMs, onExpire }) {
  if (!timeoutMs || timeoutMs <= 0) return () => {};

  let lastActivity = Date.now();
  let timer = null;
  let expired = false;

  function markActivity() {
    if (expired) return;
    lastActivity = Date.now();
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(check, delay);
  }

  function check() {
    if (expired) return;
    const elapsed = Date.now() - lastActivity;
    if (elapsed >= timeoutMs) {
      expired = true;
      stop();
      try {
        onExpire();
      } catch (err) {
        console.error("[idle] onExpire crashed:", err);
      }
      return;
    }
    schedule(timeoutMs - elapsed);
  }

  function onVisibility() {
    // Voltou pra aba — confere imediatamente. Pode ter passado do limite
    // enquanto a aba estava em background (timers de aba oculta são throttled).
    if (document.visibilityState === "visible") check();
  }

  function onFocus() {
    // Janela recebeu foco — cobre o caso de janela parcialmente obscurecida
    // por outra (visibilityState ainda é "visible", mas timers podem ter
    // sofrido throttle de janela ocluída).
    check();
  }

  function stop() {
    clearTimeout(timer);
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, markActivity, true);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
  }

  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, markActivity, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  schedule(timeoutMs);

  return stop;
}
