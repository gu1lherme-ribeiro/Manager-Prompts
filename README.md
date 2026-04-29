# Manager-Prompts

Sistema para gerenciar e melhorar prompts de IA, com contas multi-usuário, MySQL e integração com provedores de IA (Anthropic · OpenAI · Gemini) via chave do próprio usuário.

## Stack

- **Frontend**: HTML/CSS/JavaScript vanilla, sem build step. Servido pelo Express.
- **Backend**: Node.js + Express + Prisma.
- **Banco**: MySQL 8.
- **Autenticação**: email/senha (argon2id) ou Google OAuth (arctic 2.x), sessão em cookie HttpOnly + CSRF double-submit.
- **Criptografia BYOK**: AES-256-GCM com AAD amarrada a `userId+provider`.
- **Sanitização de conteúdo**: DOMPurify no client + `sanitize-html` no server.

## Estrutura

```
Manager-Prompts/
├── public/                      # Frontend estático (servido pelo Express)
│   ├── index.html               # Editor
│   ├── login.html               # Login / criar conta / Google
│   ├── settings.html            # Conta, provider padrão, chaves BYOK
│   ├── forgot.html · reset.html # Fluxo "esqueci senha"
│   └── static/
│       ├── assets/              # SVGs
│       ├── css/style.css
│       └── js/                  # scripts.js, api.js, sanitize.js, settings.js
└── server/
    ├── package.json
    ├── .env.example
    ├── prisma/
    │   ├── schema.prisma        # User, Prompt, Project, UserApiKey, Session, PasswordResetToken
    │   └── migrations/
    └── src/
        ├── index.js             # bootstrap
        ├── app.js               # monta Express (helmet+CSP, CSRF, rotas)
        ├── config/env.js        # valida process.env
        ├── db/prisma.js         # PrismaClient singleton
        ├── middleware/          # auth, csrf, rateLimit
        ├── routes/              # auth, oauth, prompts, projects, settings, improve
        ├── services/            # passwords, sessions, crypto, apiKeys, providers/, mailer, passwordResets
        └── utils/               # id (nanoid), sanitizeContent, contentSchema
```

## Setup (dev)

### Pré-requisitos
- Node.js 20+
- MySQL 8 rodando (localhost:3306)

### 1. Banco
Crie o database:

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

- `DATABASE_URL` — URL do MySQL. **Se a senha tem caracteres especiais**, rode `npm run db:set-password` e informe a senha sem eco no terminal; o script URL-encoda e grava em `.env`.
- `SESSION_SECRET` e `ENCRYPTION_KEY` — gere com `npm run gen:secret` (32 bytes base64).
- `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` — opcional. Obtenha no [Google Cloud Console](https://console.cloud.google.com) → Credentials → OAuth client ID (Web). Adicione `http://localhost:3000/api/auth/google/callback` em Authorized redirect URIs.
- `SMTP_*` — opcional. Sem SMTP, o mailer cai pra `stdout` em dev; o link de reset aparece no console.
- Os modelos dos provedores (`ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`) são configuráveis — sem rebuild.

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

Abra [http://localhost:3000](http://localhost:3000).

## Fluxo de uso

1. Criar conta em `/login` (tab "criar conta") ou entrar com Google.
2. Criar prompt no editor (`Ctrl+S` salva; `Ctrl+K` foca busca).
3. (Opcional) Criar um projeto no rail da sidebar (`+` no topo da seção *projetos*) e selecioná-lo — novos prompts criados enquanto o projeto está ativo já nascem dentro dele. Filtros virtuais "todos" e "sem projeto" sempre presentes; duplo-clique no nome renomeia, `×` no hover exclui (os prompts caem em "sem projeto").
4. Em `/settings`, colar a chave do provedor que você usa (Anthropic/OpenAI/Gemini) e opcionalmente definir um default.
5. No editor, com um prompt selecionado, clicar **melhorar** → overlay com original × melhorado → **aplicar** → **salvar**.

## Segurança

- Sessão em cookie **HttpOnly + SameSite=Lax**. Servidor guarda apenas `sha256(token)`.
- **CSRF** double-submit (cookie `mp_csrf` + header `x-csrf-token`) em todo `POST/PATCH/PUT/DELETE`.
- **BYOK**: chave da IA é criptografada com AES-256-GCM antes de gravar. AAD amarrada a `userId:provider`, então um ciphertext copiado entre usuários ou providers não decifra. Plaintext só vive em memória durante a chamada pro provedor e é zerado com `buf.fill(0)` após uso.
- **Sanitização em duas camadas**: `sanitize-html` no server (na escrita) + DOMPurify no client (na renderização). Tags permitidas centralizadas em `server/src/utils/contentSchema.js`.
- **Rate limit**: `/auth/login` · `/register` · `/forgot` · `/reset` — 10 tentativas / 15min / IP. `/improve` — 20 req / min / usuário.
- **Helmet + CSP** restritivo (apenas DOMPurify via CDN e Google Fonts são permitidos além de `'self'`).
- Google OAuth com **PKCE** e vinculação por email verificado (se o mesmo email já existir como conta email/senha, o `googleSub` é linkado no user existente — não duplica).

## Operação

### Scripts npm (em `server/`)
- `npm run dev` — nodemon
- `npm start` — produção
- `npm run db:migrate` — `prisma migrate dev`
- `npm run db:deploy` — `prisma migrate deploy` (prod)
- `npm run db:studio` — Prisma Studio
- `npm run db:set-password` — prompt silencioso pra preencher `DATABASE_URL` com senha URL-encoded
- `npm run gen:secret` — gera 32 bytes base64 pra `SESSION_SECRET` / `ENCRYPTION_KEY`

### Produção
- Setar `NODE_ENV=production`, `COOKIE_SECURE=true`, `BASE_URL` com HTTPS.
- `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` são obrigatórias — o boot falha fast se ausentes.
- Rotação da `ENCRYPTION_KEY`: a coluna `UserApiKey.keyVersion` já reserva espaço. Um protocolo de re-encrypt em lote é trabalho futuro.

## Limitações conhecidas

- **"Esqueci senha"** depende de SMTP configurado. Sem ele, o link é logado no console (ok em dev).
- **Streaming de improve**: não implementado. Resposta única, UI mostra spinner → diff side-by-side.
- **Undo de delete**: usa re-POST, portanto o prompt restaurado ganha um novo `id` (hash curto muda).
- **Customização do meta-prompt** (system prompt do improve): fixo no servidor em `services/providers/systemPrompt.js`. Customização por usuário é trabalho futuro.
