# Manager-Prompts
Um sistema desenvolvido para Gerenciar e Guardar Prompts. 

## Configuração (segurança)
- Não commite segredos. O arquivo `Settings/MCP.json` foi removido do histórico e está ignorado por `.gitignore`.
- Use `Settings/MCP.example.json` como base. Copie para `Settings/MCP.json` e defina a variável `FIGMA_API_KEY` localmente (por exemplo, em variáveis de ambiente).
- Alternativamente, ajuste os argumentos para buscar o token de um `.env` local, sem subir para o repositório.

### Exemplo de uso (Windows)
- Defina `FIGMA_API_KEY` no ambiente: `setx FIGMA_API_KEY "sua_chave_aqui"`
- No próximo terminal, o MCP usará `--figma-api-key=%FIGMA_API_KEY%`.
