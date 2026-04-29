import "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "../../.env");

function loadDotenv() {
  try {
    const raw = readFileSync(ENV_PATH, "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

loadDotenv();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`env ausente: ${name}`);
  return v;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

function base64Bytes(name, minBytes) {
  const v = process.env[name];
  if (!v) return null;
  const buf = Buffer.from(v, "base64");
  if (buf.length < minBytes) {
    throw new Error(
      `env ${name}: precisa de ${minBytes}+ bytes em base64 (encontrado ${buf.length})`,
    );
  }
  return buf;
}

const NODE_ENV = optional("NODE_ENV", "development");
const isProd = NODE_ENV === "production";

const PORT = Number(optional("PORT", "3000"));
const BASE_URL = optional("BASE_URL", `http://localhost:${PORT}`);
const DATABASE_URL = optional("DATABASE_URL", "");

const sessionSecret = base64Bytes("SESSION_SECRET", 32);
const encryptionKey = base64Bytes("ENCRYPTION_KEY", 32);

const cookieSecure = (optional("COOKIE_SECURE", "false") || "false").toLowerCase() === "true";

if (isProd) {
  if (!DATABASE_URL) throw new Error("em prod DATABASE_URL é obrigatório");
  if (!sessionSecret) throw new Error("em prod SESSION_SECRET é obrigatório");
  if (!encryptionKey) throw new Error("em prod ENCRYPTION_KEY é obrigatório");
  if (!cookieSecure) throw new Error("em prod COOKIE_SECURE deve ser true");
}

export const env = {
  NODE_ENV,
  isProd,
  PORT,
  BASE_URL,
  DATABASE_URL,
  SESSION_SECRET: sessionSecret,
  ENCRYPTION_KEY: encryptionKey,
  COOKIE_SECURE: cookieSecure,
  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", ""),
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),
  GOOGLE_REDIRECT_URI: optional(
    "GOOGLE_REDIRECT_URI",
    `${BASE_URL}/api/auth/google/callback`,
  ),
  ANTHROPIC_MODEL: optional("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
  OPENAI_MODEL: optional("OPENAI_MODEL", "gpt-4o"),
  GEMINI_MODEL: optional("GEMINI_MODEL", "gemini-2.0-flash"),
  RATE_LIMIT_AUTH_MAX: Number(optional("RATE_LIMIT_AUTH_MAX", "10")),
  RATE_LIMIT_IMPROVE_MAX: Number(optional("RATE_LIMIT_IMPROVE_MAX", "20")),

  // SMTP — opcional em dev (quando ausente, o mailer cai pra stdout).
  SMTP_HOST: optional("SMTP_HOST", ""),
  SMTP_PORT: Number(optional("SMTP_PORT", "587")),
  SMTP_SECURE: (optional("SMTP_SECURE", "false") || "false").toLowerCase() === "true",
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASSWORD: optional("SMTP_PASSWORD", ""),
  SMTP_FROM: optional("SMTP_FROM", ""),
  SMTP_FROM_NAME: optional("SMTP_FROM_NAME", "manager-prompts"),
};
