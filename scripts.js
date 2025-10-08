// Mapeamento de elementos HTML por ID
const elements = {
  promptTitle: document.getElementById("prompt-title"),
  promptContent: document.getElementById("prompt-content"),
  titleWrapper: document.getElementById("title-wrapper"),
  contentWrapper: document.getElementById("content-wrapper"),
  btnOpen: document.getElementById("btn-open"),
  btnCollapse: document.getElementById("btn-collapse"),
  sidebar: document.querySelector(".sidebar"),
};

// Atualiza estado do wrapper com base no conteúdo do elemento editável
function updateEditableWrapperState(element, wrapper) {
  const hasText = element.textContent.trim().length > 0;
  wrapper.classList.toggle("is-empty", !hasText);
}

// Funções para abrir e fechar sidebar
function openSidebar() {
  elements.sidebar.style.display = "flex";
  elements.btnOpen.style.display = "none";
}

function closeSidebar() {
  elements.sidebar.style.display = "none";
  elements.btnOpen.style.display = "block";
}

// Atualiza estado de todos os elementos editáveis
function updateAllEditableStates() {
  updateEditableWrapperState(elements.promptTitle, elements.titleWrapper); //OK
  updateEditableWrapperState(elements.promptContent, elements.contentWrapper); //OK 
}

// Anexa os handlers de input para atualizar estados em tempo real
function attachAllEditableHandlers() {
  elements.promptTitle.addEventListener("input", function () {
    updateEditableWrapperState(elements.promptTitle, elements.titleWrapper); //OK
  });

  elements.promptContent.addEventListener("input", function () {
    updateEditableWrapperState(elements.promptContent, elements.contentWrapper); //OK
  });
}

// Controla a abertura e fechamento da sidebar
function toggleSidebar(isOpen) {
  elements.app.classList.toggle("sidebar-closed", !isOpen);
  elements.btnOpen.style.display = isOpen ? "none" : "block";
}

// Inicialização da aplicação
function init() {
  attachAllEditableHandlers();
  updateAllEditableStates();
  
  // Estado inicial: sidebar aberta, botão de abrir oculto
  elements.sidebar.style.display = "";
  elements.btnOpen.style.display = "none";

  // Eventos para abrir e fechar sidebar
  elements.btnOpen.addEventListener("click", openSidebar);
  elements.btnCollapse.addEventListener("click", closeSidebar);
}

// Aguarda DOM estar pronto para iniciar
init();
