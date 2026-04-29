import { SESSION_COOKIE, findSessionByToken } from "../services/sessions.js";

export async function attachUser(req, _res, next) {
  req.user = null;
  req.session = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const session = await findSessionByToken(token);
    if (session) {
      req.session = session;
      req.user = session.user;
    }
  } catch (err) {
    console.error("[auth] falha ao resolver sessão:", err);
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res
      .status(401)
      .json({ error: { code: "unauthorized", message: "autentique-se" } });
  }
  next();
}
