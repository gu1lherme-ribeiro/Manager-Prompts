// server/src/services/users.js
import { hasKeysMap } from "./apiKeys.js";

/**
 * Projeção pública do user pra resposta de auth/me. Inclui flag `hasKeys`
 * derivada de api keys cadastradas por provider.
 */
export async function meResponse(user) {
  const hasKeys = await hasKeysMap(user.id);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    defaultProvider: user.defaultProvider,
    hasGoogle: !!user.googleSub,
    hasPassword: !!user.passwordHash,
    hasKeys,
  };
}
