//Chave para identificar dados salvos pela nossa aplicação no navegador
const STORAGE_KEY = "prompts_storage";

//Estado para carregar os prompts salvos e exibir.
const state = {
  prompts: [],
  selectedId: null,
};

// Mapeamento de elementos HTML por ID
const elements = {
  promptTitle: document.getElementById("prompt-title"),
  promptContent: document.getElementById("prompt-content"),
  titleWrapper: document.getElementById("title-wrapper"),
  contentWrapper: document.getElementById("content-wrapper"),
  btnOpen: document.getElementById("btn-open"),
  btnCollapse: document.getElementById("btn-collapse"),
  sidebar: document.querySelector(".sidebar"),
  btnSave: document.getElementById("btn-save"),
  list: document.getElementById("prompt-list"),
  search: document.getElementById("search-input"),
  btnNew: document.getElementById("btn-new"),
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

function save() {
  const title = elements.promptTitle.textContent.trim();
  const content = elements.promptContent.innerHTML.trim();
  const hasContent = elements.promptContent.textContent.trim();

  console.log(title, content);

  if (!title || !hasContent) {
    alert("O título e o conteúdo são obrigatórios.");
    return;
  }
  
  if (state.selectedId) {
    //Editando um prompt existente
    const existingPrompt = state.prompts.find((p) => p.id === state.selectedId);
    if(existingPrompt){
      existingPrompt.title = title || "Sem título" ;
      existingPrompt.content = content || "Sem conteúdo";
    }
  } else {
    //Criando um novo prompt
    const newPrompt = {
      id: Date.now().toString(36),
      title,
      content,
    };
    state.prompts.unshift(newPrompt);
    state.selectedId = newPrompt.id;
  }

  renderList(elements.search.value);
  persist();
  alert("Prompt salvo com sucesso!");
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prompts));
  } catch (error) {
    console.log("Erro ao salvar no localStorage:", error);
  }
}

function load() {
  try {
    const storage = localStorage.getItem(STORAGE_KEY);
    state.prompts = storage ? JSON.parse(storage) : [];
    state.selectedId = null;
  } catch (error) {
    console.log("Erro ao carregar do localStorage:", error);
  }
}

function createPromptItem(prompt) {
  const tmp= document.createElement("div")
  tmp.innerHTML = prompt.content
  return `
      <li class="prompt-item" data-id="${prompt.id}" data-action ="select">
      <div class="prompt-item-content">
        <span class="prompt-item-title">${prompt.title}</span>
        <span class="prompt-item-description">${tmp.textContent}</span>
      </div>
      <button class="btn-icon" title="Remover" data-action="remove">
        <img src="./assets/remove.svg" alt="Remover" class="icon icon-trash">
      </button>
    </li>
    `;
}

function renderList(filterText = "") {
  const filteredPrompts = state.prompts
    .filter((prompt) =>
      prompt.title.toLowerCase().includes(filterText.toLowerCase().trim())
    )
    .map((p) => createPromptItem(p))
    .join("");

  elements.list.innerHTML = filteredPrompts;
}

function newPrompt(){
  state.selectedId = null;
  elements.promptTitle.textContent = "";
  elements.promptContent.textContent = "";
  updateAllEditableStates();
  elements.promptTitle.focus()
}

//Eventos
elements.btnSave.addEventListener("click", save);
elements.btnNew.addEventListener("click",newPrompt)

elements.search.addEventListener("input", function (event) {
  renderList(event.target.value);
});

elements.list.addEventListener("click", function (event){
  const removeBtn= event.target.closest ("[data-action='remove']")
  const item= event.target.closest("[data-id]")
  
  if(!item) return;

  const id = item.getAttribute ("data-id")
  state.selectedId = id;
  
  if (removeBtn){
    state.prompts = state.prompts.filter((p) => p.id !== id);
    renderList();
    persist();
    return;
  }
  if(event.target.closest("[data-action='select']")){
  const prompt = state.prompts.find((p) => p.id === id)
  if(prompt){
    elements.promptTitle.textContent = prompt.title;
    elements.promptContent.textContent = prompt.content;
    updateAllEditableStates();
  }
}
})



// Inicialização da aplicação
function init() {
  load();
  renderList();
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
