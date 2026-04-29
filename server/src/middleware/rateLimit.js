import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

// Anti brute-force em auth: limite por IP em 15min
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "rate_limited",
      message: "muitas tentativas — aguarde alguns minutos",
    },
  },
});

// Limite para /improve: por usuário (com fallback pra IP)
export const improveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_IMPROVE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    error: {
      code: "rate_limited",
      message: "aguarde um momento antes de melhorar outro prompt",
    },
  },
});
