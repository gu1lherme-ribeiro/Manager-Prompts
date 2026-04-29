import { Router } from "express";
import * as arctic from "arctic";
import prisma from "../db/prisma.js";
import { env } from "../config/env.js";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  sessionCookieOptions,
  csrfCookieOptions,
  issueCsrfToken,
} from "../services/sessions.js";

const router = Router();

const STATE_COOKIE = "mp_oauth_state";
const VERIFIER_COOKIE = "mp_oauth_verifier";
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

function googleClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return new arctic.Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

function shortCookieOpts({ withMaxAge = true } = {}) {
  const opts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  };
  if (withMaxAge) opts.maxAge = OAUTH_MAX_AGE_MS;
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

function redirectWithError(res, code) {
  return res.redirect(`/login?error=${encodeURIComponent(code)}`);
}

router.get("/google", (_req, res) => {
  const google = googleClient();
  if (!google) return redirectWithError(res, "google_disabled");

  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();
  const scopes = ["openid", "profile", "email"];
  const url = google.createAuthorizationURL(state, codeVerifier, scopes);

  res.cookie(STATE_COOKIE, state, shortCookieOpts());
  res.cookie(VERIFIER_COOKIE, codeVerifier, shortCookieOpts());
  res.redirect(url.toString());
});

router.get("/google/callback", async (req, res) => {
  const google = googleClient();
  if (!google) return redirectWithError(res, "google_disabled");

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const storedState = req.cookies?.[STATE_COOKIE];
  const storedVerifier = req.cookies?.[VERIFIER_COOKIE];

  const clearOpts = shortCookieOpts({ withMaxAge: false });
  res.clearCookie(STATE_COOKIE, clearOpts);
  res.clearCookie(VERIFIER_COOKIE, clearOpts);

  if (!code || !state || !storedState || !storedVerifier || state !== storedState) {
    return redirectWithError(res, "oauth_state");
  }

  let payload;
  try {
    const tokens = await google.validateAuthorizationCode(code, storedVerifier);
    payload = arctic.decodeIdToken(tokens.idToken());
  } catch (err) {
    if (err instanceof arctic.OAuth2RequestError) return redirectWithError(res, "oauth_token");
    if (err instanceof arctic.ArcticFetchError) return redirectWithError(res, "oauth_network");
    console.error("[oauth] erro inesperado:", err);
    return redirectWithError(res, "oauth_unexpected");
  }

  const sub = payload?.sub;
  const email = String(payload?.email || "").toLowerCase().trim();
  const emailVerified = payload?.email_verified === true || payload?.email_verified === "true";
  const givenName = payload?.given_name || null;
  const familyName = payload?.family_name || null;
  const displayName =
    payload?.name || (givenName && familyName ? `${givenName} ${familyName}` : null);

  if (!sub || !email) return redirectWithError(res, "oauth_profile");
  if (!emailVerified) return redirectWithError(res, "oauth_email_unverified");

  try {
    let user = await prisma.user.findUnique({ where: { googleSub: sub } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleSub: sub,
            firstName: byEmail.firstName ?? givenName,
            lastName: byEmail.lastName ?? familyName,
            displayName: byEmail.displayName ?? displayName,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            googleSub: sub,
            firstName: givenName,
            lastName: familyName,
            displayName,
          },
        });
      }
    }

    const keep = true; // login por Google entra como "manter sessão" — 30d
    const { token } = await createSession({
      userId: user.id,
      keep,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ keep }));
    res.cookie(CSRF_COOKIE, issueCsrfToken(), csrfCookieOptions());

    return res.redirect("/");
  } catch (err) {
    console.error("[oauth] falha ao criar sessão:", err);
    return redirectWithError(res, "oauth_unexpected");
  }
});

export default router;
