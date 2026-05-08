import argon2 from "argon2";

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP 2024+
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password) {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash, password) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Top 100 senhas mais comuns (SecLists / 10-million-password-list-top-100).
// Evita os clássicos antes mesmo da regra de complexidade. Hard-coded em
// lowercase — comparação faz `.toLowerCase()` na entrada. Set pra lookup O(1).
const COMMON_PASSWORDS = new Set([
  "123456", "password", "123456789", "12345678", "12345", "qwerty", "1234567",
  "111111", "1234567890", "123123", "abc123", "1234", "password1", "iloveyou",
  "1q2w3e4r", "000000", "qwerty123", "zaq12wsx", "dragon", "sunshine",
  "princess", "letmein", "654321", "monkey", "27653", "1qaz2wsx", "123321",
  "qwertyuiop", "superman", "asdfghjkl", "passw0rd", "starwars", "freedom",
  "whatever", "trustno1", "jordan23", "harley", "ranger", "iwantu", "jennifer",
  "hunter", "buster", "soccer", "baseball", "tigger", "charlie", "andrew",
  "michelle", "love", "sunshine1", "jessica", "asshole", "6969", "pepper",
  "daniel", "access", "123456a", "joshua", "maggie", "starwars1", "silver",
  "william", "dallas", "yankees", "123qwe", "111222", "ashley", "666666",
  "hockey", "george", "amanda", "summer", "love123", "ginger", "heather",
  "hammer", "yankee", "joseph", "diamond", "fuckyou", "thomas", "gandalf",
  "robert", "matthew", "jordan", "michelle1", "killer", "qazwsx", "mickey",
  "bailey", "knight", "iceman", "tigers", "purple", "andrea", "horny",
  "dakota", "aaaaaa", "player", "sunshine123", "morgan", "starwars2",
  "boomer", "cowboys", "edward",
]);

/**
 * Valida força mínima de senha pra register e reset.
 * Retorna { ok: bool, code?: string } — code mapeado pra mensagem em pt-BR.
 *
 * Regras:
 *  - >= 8 chars (z.string().min(8) já cuida disso, mas dobramos pra mensagem coerente)
 *  - >= 1 letra (qualquer alfabeto unicode)
 *  - >= 1 número
 *  - não estar na blocklist de senhas comuns
 */
export function validatePasswordStrength(pw) {
  if (!pw || pw.length < 8) return { ok: false, code: "too_short" };
  if (!/\p{L}/u.test(pw)) return { ok: false, code: "needs_letter" };
  if (!/\d/.test(pw)) return { ok: false, code: "needs_digit" };
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return { ok: false, code: "too_common" };
  return { ok: true };
}

export const PASSWORD_STRENGTH_MESSAGES = {
  too_short: "senha precisa ter pelo menos 8 caracteres",
  needs_letter: "senha precisa ter pelo menos 1 letra",
  needs_digit: "senha precisa ter pelo menos 1 número",
  too_common: "senha muito comum — escolha uma menos previsível",
};
