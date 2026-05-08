# Manager-Prompts

App web multi-usuário para gerenciar e melhorar prompts de IA. Organização em projetos, edição rica com sanitização, e *improve* via chave do próprio usuário (BYOK) nos provedores **Anthropic**, **OpenAI** e **Gemini**.

UI e mensagens em **pt-BR**. Frontend vanilla, **sem build step**.

## Stack

- **Frontend** — HTML/CSS/JavaScript vanilla (ESM no navegador), servido pelo Express. Sem bundler, sem framework.
- **Backend** — Node.js 20+ · Express · Prisma.
- **Banco** — MySQL 8.
- **Auth** — email/senha (argon2id) ou Google OAuth (arctic 2.x), sessão em cookie HttpOnly + CSRF double-submit. **MFA por email** opt-in com *trusted devices* de 30 dias.
- **BYOK** — AES-256-GCM com AAD amarrada a `userId+provider`.
- **Sanitização de conteúdo** — `sanitize-html` no server (escrita) + DOMPurify no client (renderização).

## Estrutura

```
Manager-Prompts/
├── public/                       # frontend estático (mesma origem que o backend)
│   ├── index.html                # editor
│   ├── login.html                # login / criar conta / Google / MFA
│   ├── settings.html             # conta, provider padrão, chaves BYOK, MFA, dispositivos confiáveis
│   ├── forgot.html · reset.html  # fluxo "esqueci senha"
│   ├── privacy.html              # política de privacidade (LGPD)
│   └── static/{assets, css/style.css, js/*}
└── server/
    ├── package.json · .env.example
    ├── prisma/
    │   ├── schema.prisma         # User, Prompt, Project, UserApiKey, Session,
    │   │                         # PasswordResetToken, MfaSettings, MfaChallenge, TrustedDevice
    │   └── migrations/
    └── src/
        ├── index.js · app.js     # bootstrap + Express (helmet+CSP, CSRF, rotas)
        ├── config/env.js         # valida process.env, falha-rápido se faltar segredo
        ├── db/prisma.js          # PrismaClient singleton
        ├── middleware/{auth,csrf,rateLimit}.js
        ├── routes/{auth,oauth,prompts,projects,settings,improve,improvePresets,mfa}.js
        └── services/
            ├── passwords.js · sessions.js · crypto.js · apiKeys.js · users.js
            ├── providers/{index, anthropic, openai, gemini, systemPrompt}.js
            ├── mailer.js · passwordResets.js
            ├── mfaChallenges.js · trustedDevices.js
            ├── improvePresets.js
            ├── emailTemplates/{passwordReset, mfaChallenge}.js
            └── utils/{id, contentSchema, sanitizeContent}.js
```

## Setup (dev)

### Pré-requisitos
- Node.js 20+
- MySQL 8 rodando (default em `localhost:3306`)

### 1. Banco

```sql
CREATE DATABASE IF NOT EXISTS manager_prompts CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env
```

Preencha o `.env`:

- `DATABASE_URL` — URL do MySQL. **Senha com caracteres especiais?** Rode `npm run db:set-password` — o script lê a senha sem eco no terminal, URL-encoda e grava em `.env`.
- `SESSION_SECRET` · `ENCRYPTION_KEY` · `MFA_HMAC_KEY` — todas obrigatórias em prod, 32 bytes em base64. Gere cada uma com `npm run gen:secret`.
- `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` — opcional. Obtenha em [Google Cloud Console](https://console.cloud.google.com) → Credentials → OAuth client ID (Web). Adicione `http://localhost:3000/api/auth/google/callback` em *Authorized redirect URIs*.
- `SMTP_*` — opcional em dev. Sem SMTP, o mailer cai pra `stdout`: o link de reset e o código de MFA aparecem no console.
- Modelos dos provedores (`ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`) — trocáveis sem rebuild.
- `SESSION_IDLE_TIMEOUT_MIN` — minutos de ociosidade até expirar a sessão (default 30; `0` desliga e só vale a absoluta de 24h / 30d com "manter conectado").

### 3. Migrações

```bash
npm run db:migrate
```

### 4. Rodar

```bash
npm run dev         # nodemon, hot reload
# ou
npm start           # node puro
```

Abra [http://localhost:3000](http://localhost:3000). Express serve `/static` e os HTMLs no mesmo processo — sem CORS, tudo same-origin.

## Fluxo de uso

1. Criar conta em `/login` (tab *criar conta*) ou entrar com Google.
2. (Opcional) Em `/settings`, ativar **MFA por email** — cada login passa a exigir um código de 6 dígitos enviado pro email cadastrado. Marque *confiar neste dispositivo* pra pular o desafio nos próximos 30 dias.
3. Criar prompt no editor (`Ctrl+S` salva, `Ctrl+K` foca a busca).
4. Organizar em **projetos**: `+` no topo do rail cria; duplo-clique renomeia; arrastar prompts entre projetos move; arrastar projetos reordena. Filtros virtuais *todos* e *sem projeto* sempre presentes — novos prompts herdam o projeto ativo.
5. Em `/settings`, colar a chave do provedor (Anthropic / OpenAI / Gemini) e opcionalmente definir um default.
6. No editor, com prompt selecionado, clicar **melhorar** → escolher um *preset* (ou prompt-livre) → overlay com *original × melhorado* → **aplicar** → **salvar**.

## Segurança

- **Sessão** em cookie HttpOnly + SameSite=Lax. Servidor guarda só `sha256(token)`. Idle-timeout configurável; absoluto de 24h (ou 30d com "manter conectado").
- **CSRF** double-submit (`mp_csrf` + `x-csrf-token`) em todo `POST/PATCH/PUT/DELETE`. Rotas exemptas listadas em `middleware/csrf.js#EXEMPT_PATHS` (login, register, OAuth callbacks, verify/resend de MFA).
- **MFA por email** — opt-in, código de 6 dígitos com TTL curto, hash HMAC-SHA256 em `MfaChallenge.codeHash` (chave dedicada `MFA_HMAC_KEY` — espaço de 1M é frágil em DB leak com SHA puro). *Trusted devices* têm token raw 32B base64url no cookie `mp_td`, hash sha256 no DB; cookie de outro usuário é inútil. Disable de MFA revoga **todos** os trusted devices. OAuth Google bypassa o desafio (Google já validou o email).
- **BYOK** — chave do provedor é cifrada com AES-256-GCM antes de ir pro DB. AAD amarrada a `byok:v${version}:${userId}:${provider}`: ciphertext copiado entre usuários ou providers não decifra. Plaintext só vive em memória durante a chamada e é zerado com `buf.fill(0)` no `finally`.
- **Sanitização em duas camadas** — `sanitize-html` no server (escrita) + DOMPurify no client (renderização). Tags permitidas em `server/src/utils/contentSchema.js`, espelhadas em `public/static/js/sanitize.js`.
- **Rate limit** — `/auth/*` (login, register, forgot, reset, MFA): 10 req / 15min / IP. `/improve`: 20 req / min / usuário. Reads: 100 req / min / usuário. Tudo configurável no `.env`.
- **Helmet + CSP restritivo** — sem `unsafe-inline` em scripts; só DOMPurify (CDN) e Google Fonts são permitidos além de `'self'`.
- **Google OAuth** com PKCE e vinculação por email verificado: se já existir conta email/senha com o mesmo email, o `googleSub` é linkado no usuário existente — não duplica.
- **LGPD** — política de privacidade em `/privacy.html` (controlador, finalidades, base legal, retenção, direitos do titular).

## Operação

### Scripts npm (em `server/`)

| Script | O que faz |
| --- | --- |
| `npm run dev` | nodemon com hot-reload |
| `npm start` | produção (node puro) |
| `npm run db:migrate` | `prisma migrate dev` (cria + aplica em dev) |
| `npm run db:deploy` | `prisma migrate deploy` (prod) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:set-password` | prompt silencioso pra preencher `DATABASE_URL` com senha URL-encoded |
| `npm run gen:secret` | gera 32 bytes base64 (use pra `SESSION_SECRET`, `ENCRYPTION_KEY`, `MFA_HMAC_KEY`) |

### Produção

- `NODE_ENV=production`, `COOKIE_SECURE=true`, `BASE_URL` com HTTPS.
- `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `MFA_HMAC_KEY` são obrigatórias — o boot falha-rápido se ausentes.
- Atrás de proxy/CDN, garanta que o `X-Forwarded-Proto` chega no Express (Express já confia em `trust proxy` no app).
- Rotação de `ENCRYPTION_KEY`: a coluna `UserApiKey.keyVersion` reserva espaço; protocolo de re-encrypt em lote é trabalho futuro.

### Deploy via Easypanel (uso atual)

A produção roda como app Easypanel numa VPS Hostinger compartilhada com outros serviços. Configuração mínima:

- **Source** — repositório Git, branch `main`.
- **Build** — Nixpacks detecta `server/package.json`. Working dir = `server/`. Install = `npm ci`. Build = `npx prisma generate`. Start = `npx prisma migrate deploy && node src/index.js`.
- **Env** — todas as vars do `.env.example`, com `DATABASE_URL` apontando pro MySQL gerenciado pelo próprio Easypanel.
- **Domain** — domínio próprio com HTTPS automático via Let's Encrypt.

## Limitações conhecidas

- *Esqueci senha* e MFA dependem de SMTP em prod. Sem SMTP, links e códigos vão pro stdout (ok em dev).
- *Improve* não faz streaming — resposta única, UI mostra spinner → diff side-by-side.
- *Undo* de delete usa re-POST → o prompt restaurado ganha um novo `id` (e novo hash curto).
- Meta-prompt do *improve* (system prompt) é fixo no servidor em `services/providers/systemPrompt.js`. Customização por usuário é trabalho futuro.
- Rotação de `ENCRYPTION_KEY` não tem endpoint admin — `keyVersion` reservado no schema.
