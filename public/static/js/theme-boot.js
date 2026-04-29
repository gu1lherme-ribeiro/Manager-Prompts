// Aplica o tema salvo ANTES do CSS pintar para evitar flash.
(function () {
  try {
    var t = localStorage.getItem("prompts_theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {
    /* ignora: localStorage pode estar indisponível */
  }
})();
