# Política de Privacidade — Manager-Prompts

_Última atualização: 07-05-2026._

Esta política explica quais dados o Manager-Prompts coleta, por quanto tempo retém e como você pode exercer seus direitos sob a LGPD (Lei Geral de Proteção de Dados, Lei 13.709/2018) e regulamentos equivalentes.

## 1. Quem é o controlador

Para a instância oficial, o contato do controlador é **<guilherme.fernandes.dev27@gmail.com>**.

Se você está rodando uma instância própria (auto-hospedada), o controlador é você mesmo — esta política descreve como o software trata os dados, mas a operação fica sob sua responsabilidade.

## 2. Dados que coletamos

### 2.1 Dados de conta

- **E-mail** (obrigatório) — identifica você e recebe avisos de segurança e e-mails de recuperação.
- **Nome e sobrenome** (obrigatórios) — exibidos na interface.
- **Hash da senha** — armazenado com Argon2id. A senha em texto puro **nunca** é guardada.
- **Identificador Google (`googleSub`)** — opcional, criado se você fizer login com Google.

### 2.2 Conteúdo gerado por você

- **Prompts** (título e conteúdo): armazenados em texto legível no banco de dados.
- **Projetos** (nome): texto legível.
- **Presets de improve** (nome e _system prompt_ customizado): texto legível.

> **Importante**: prompts e presets ficam em texto legível no banco. **Não inclua senhas, tokens, dados financeiros, dados de saúde, ou informações pessoais de terceiros nos prompts.**

### 2.3 Chaves de API (BYOK)

Se você cadastrar chaves dos provedores (Anthropic / OpenAI / Google Gemini) na seção "chaves de API" em `/settings`, elas são **criptografadas com AES-256-GCM** antes de irem ao banco. A chave em texto puro só existe na memória do servidor durante a chamada ao provedor e é zerada (`Buffer.fill(0)`) imediatamente depois.

### 2.4 Dados operacionais

- **Endereço IP** e **user-agent** do navegador, registrados em sessões ativas, desafios MFA e dispositivos confiáveis. Usados para detecção de uso anômalo e auditoria.
- **Timestamps** de criação, último uso e expiração das mesmas entidades.

## 3. Por quanto tempo retemos

| Dado | Retenção |
|---|---|
| Conta + conteúdo (prompts, projetos, presets, chaves) | Até você deletar a conta |
| Sessão "curta" | 24 horas, ou expira após 30 minutos de inatividade |
| Sessão "manter conectado" | 30 dias, ou expira após 30 minutos de inatividade |
| Desafios MFA | 5 minutos (descartados após uso ou expiração) |
| Dispositivos confiáveis (MFA bypass) | 30 dias (renováveis) |
| Tokens de redefinição de senha | 30 minutos (consumidos no primeiro uso) |

Sessões e desafios expirados são limpos do banco de tempos em tempos.

## 4. Como deletar sua conta

Vá em `/settings` → **"Deletar conta"**. Você confirma com a senha (ou só com a sessão ativa, se for conta Google-only). A operação apaga em cascata, dentro da mesma transação:

- Sua linha em `User`
- Todos os seus prompts (`Prompt`)
- Todos os seus projetos (`Project`)
- Todos os seus presets de improve (`ImprovePreset`)
- Todas as chaves de API (`UserApiKey`)
- Todas as sessões ativas (`Session`)
- Configurações e desafios MFA (`MfaSettings`, `MfaChallenge`)
- Tokens de redefinição pendentes (`PasswordResetToken`)
- Dispositivos confiáveis (`TrustedDevice`)

**Não há recuperação.** Backups operacionais podem reter cópias por até 30 dias antes de serem rotacionados.

## 5. Compartilhamento com terceiros

### 5.1 Provedores de IA (quando você usa "melhorar")

Quando você clica em **melhorar** com sua chave própria configurada, o conteúdo do seu prompt é enviado para o provedor escolhido (Anthropic, OpenAI ou Google Gemini), junto com:

- O _system prompt_ ativo (BASE padrão ou seu preset customizado)
- A instrução adicional do campo "instrução opcional" (até 500 caracteres)

Esses provedores recebem e processam esse conteúdo conforme as próprias políticas de retenção e uso. **Não temos controle** sobre o que eles fazem com o dado depois — verifique direto:

- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- [OpenAI Privacy Policy](https://openai.com/privacy)
- [Google Gemini API Terms](https://ai.google.dev/terms)

### 5.2 Outros terceiros

- **Google OAuth** (se você usa "entrar com Google"): a Google recebe que você fez login na nossa instância. Veja a [política do Google](https://policies.google.com/privacy).
- **CDN para fontes e DOMPurify**: Google Fonts e jsDelivr servem assets estáticos (fontes Hanken Grotesk + Red Hat Mono; biblioteca DOMPurify para sanitização). Não enviamos dados pessoais a esses CDNs — eles veem apenas requisições de fonte/script.

## 6. Segurança

- Senhas: **Argon2id** com parâmetros OWASP 2024.
- Chaves BYOK: **AES-256-GCM** com AAD (`byok:v${ver}:${userId}:${provider}`) para prevenir que ciphertext de um usuário seja decifrável no contexto de outro.
- Sessões e tokens de reset/MFA/dispositivo: armazenados como hashes (SHA-256 ou HMAC-SHA-256), nunca em claro.
- CSRF: proteção double-submit em todas as rotas mutantes.
- HTTPS obrigatório em produção (HSTS por 6 meses, cookies com flag `secure`).
- CSP restritiva: sem `unsafe-eval`, scripts apenas de origem própria + jsDelivr.

## 7. Seus direitos sob a LGPD

- **Acesso**: você pode visualizar todos os seus prompts, projetos e presets em `/`.
- **Correção**: edite os dados pela interface.
- **Anonimização ou exclusão**: use **"Deletar conta"** em `/settings`.
- **Portabilidade**: exportação JSON está no roadmap. Enquanto isso, peça em **<guilherme.fernandes.dev27@gmail.com>**.
- **Revogação de consentimento**: ao deletar a conta, todo consentimento é revogado.
- **Reclamação à ANPD**: você sempre pode reclamar à autoridade brasileira de proteção de dados.

## 8. Cookies que usamos

Todos os cookies são essenciais para o funcionamento e expiram conforme abaixo:

| Cookie | Função | Expira |
|---|---|---|
| `mp_sid` | Token de sessão (httpOnly, secure) | 24h ou 30d |
| `mp_csrf` | Token CSRF (legível pelo JS) | Sessão do navegador |
| `mp_td` | Dispositivo confiável MFA (httpOnly) | 30 dias |
| `mp_oauth_state`, `mp_oauth_verifier` | Fluxo OAuth Google (PKCE) | 10 minutos |

Não usamos cookies de analytics, publicidade ou tracking.

## 9. Mudanças nesta política

Atualizações importantes serão comunicadas pelo e-mail cadastrado. A data no topo deste documento sempre indica a última revisão.
