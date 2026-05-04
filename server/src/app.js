import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { env } from "./config/env.js";
import { attachUser } from "./middleware/auth.js";
import { ensureCsrfCookie, verifyCsrf } from "./middleware/csrf.js";
import authRouter from "./routes/auth.js";
import oauthRouter from "./routes/oauth.js";
import promptsRouter from "./routes/prompts.js";
import projectsRouter from "./routes/projects.js";
import settingsRouter from "./routes/settings.js";
import improveRouter from "./routes/improve.js";
import mfaRouter from "./routes/mfa.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");
const STATIC_DIR = resolve(PUBLIC_DIR, "static");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.isProd ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "https://cdn.jsdelivr.net"],
          "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
          "object-src": ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // DOMPurify CDN não suporta COEP
      referrerPolicy: { policy: "same-origin" },
      hsts: env.isProd ? undefined : false,
    }),
  );

  app.use(express.json({ limit: "512kb" }));
  app.use(cookieParser());

  app.use(
    "/static",
    express.static(STATIC_DIR, {
      maxAge: env.isProd ? "7d" : 0,
      fallthrough: true,
    }),
  );

  // Serve arquivos na raiz de /public (como favicon.svg) diretamente na raiz da URL
  // index: false evita que ele tente servir o index.html antes das rotas customizadas
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.use(attachUser);
  app.use(ensureCsrfCookie);
  app.use(verifyCsrf);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV, version: "2.0.0" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/auth", oauthRouter);
  app.use("/api/auth/mfa", mfaRouter);
  app.use("/api/prompts", promptsRouter);
  app.use("/api/prompts", improveRouter); // monta /api/prompts/:id/improve
  app.use("/api/projects", projectsRouter);
  app.use("/api/settings", settingsRouter);

  const sendHtml = (file) => (_req, res) => res.sendFile(resolve(PUBLIC_DIR, file));

  // Páginas protegidas: sem sessão, redireciona p/ /login server-side.
  // Evita que o HTML da app carregue e pisque antes do JS detectar 401 e mandar
  // pro login — esse flash quebrava o layout no primeiro paint.
  const requireAuthHtml = (file) => (req, res) => {
    if (!req.user) {
      const next = encodeURIComponent(req.originalUrl || "/");
      return res.redirect(302, `/login?next=${next}`);
    }
    res.sendFile(resolve(PUBLIC_DIR, file));
  };

  // Páginas de auth: se já está logado, manda pra app.
  const redirectIfAuthed = (file) => (req, res) => {
    if (req.user) return res.redirect(302, "/");
    res.sendFile(resolve(PUBLIC_DIR, file));
  };

  app.get("/", requireAuthHtml("index.html"));
  app.get("/settings", requireAuthHtml("settings.html"));
  app.get("/login", redirectIfAuthed("login.html"));
  app.get("/forgot", sendHtml("forgot.html"));
  app.get("/reset", sendHtml("reset.html"));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: { code: "not_found", message: "rota não encontrada" } });
    } else {
      res.status(404).type("text/plain").send("404 — página não encontrada");
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    console.error("[error]", err);
    res.status(status).json({
      error: {
        code: err.code || "internal_error",
        message: env.isProd ? "erro interno" : err.message,
      },
    });
  });

  return app;
}
