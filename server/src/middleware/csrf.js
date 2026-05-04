import crypto from "node:crypto";
import {
  CSRF_COOKIE,
  csrfCookieOptions,
  issueCsrfToken,
} from "../services/sessions.js";

// Garante que existe um cookie `mp_csrf` em qualquer navegação top-level
// (GET HTML ou GET /api/auth/me). O cliente lê este cookie e ecoa em
// `x-csrf-token` quando faz requisições mutantes.
export function ensureCsrfCookie(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, issueCsrfToken(), csrfCookieOptions());
  }
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Endpoints isentos de CSRF (o usuário ainda não tem cookie de sessão OU
// é um callback top-level de OAuth).
const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/mfa/verify",
  "/api/auth/mfa/resend",
]);

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();

  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!header || !cookie || !safeEqual(header, cookie)) {
    return res
      .status(403)
      .json({ error: { code: "csrf", message: "token csrf inválido" } });
  }
  next();
}
