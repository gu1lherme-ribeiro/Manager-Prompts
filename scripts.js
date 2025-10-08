// Mapeamento de elementos HTML por ID
const elements = {
  promptTitle: document.getElementById("prompt-title"),
  promptContent: document.getElementById("prompt-content"),
  titleWrapper: document.getElementById("title-wrapper"),
  contentWrapper: document.getElementById("content-wrapper"),
  btnOpen: document.getElementById("btn-open"),
  btnCollapse: document.getElementById("btn-collapse"),
};

// Atualiza estado do wrapper com base no conteúdo do elemento editável
function updateEditableWrapperState(element, wrapper) {
  const hasText = element.textContent.trim().length > 0;
  wrapper.classList.toggle("is-empty", !hasText);
}

// Atualiza estado de todos os elementos editáveis
function updateAllEditableStates() {
  updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
  updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
}

// Anexa os handlers de input para atualizar estados em tempo real
function attachAllEditableHandlers() {
  elements.promptTitle.addEventListener("input", function () {
    updateEditableWrapperState(elements.promptTitle, elements.titleWrapper);
  });

  elements.promptContent.addEventListener("input", function () {
    updateEditableWrapperState(elements.promptContent, elements.contentWrapper);
  });
}

// Controla a abertura e fechamento da sidebar
function toggleSidebar(isOpen) {
  elements.app.classList.toggle('sidebar-closed', !isOpen);
  elements.btnOpen.style.display = isOpen ? 'none' : 'block';
}

// Controla a abertura e fechamento da sidebar
function toggleSidebar(isOpen) {
  const sidebar = document.querySelector(".sidebar");
  
  if (isOpen) {
    // Abre a sidebar
    sidebar.style.transform = "translateX(0)";
    elements.btnOpen.style.display = "none";
  } else {
    // Fecha a sidebar
    sidebar.style.transform = "translateX(-100%)";
    elements.btnOpen.style.display = "block";
  }
}

// Inicialização da aplicação
function init() {
  attachAllEditableHandlers();
  updateAllEditableStates();
  
  // Adiciona eventos para controlar a sidebar
  elements.btnCollapse.addEventListener("click", function() {
    toggleSidebar(false);
  });
  
  elements.btnOpen.addEventListener("click", function() {
    toggleSidebar(true);
  });
  
  // Inicializa a sidebar como aberta
  elements.btnOpen.style.display = "none";
}

// Aguarda DOM estar pronto para iniciar
document.addEventListener("DOMContentLoaded", init);
