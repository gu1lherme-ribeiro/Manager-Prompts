// Camada fina de acesso ao backend. Cookies são same-origin, CSRF vai no header.

const CSRF_COOKIE = "mp_csrf";

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : "";
}

export class ApiError extends Error {
  constructor(status, payload) {
    const msg =
      (payload && payload.error && payload.error.message) || `erro ${status}`;
    super(msg);
    this.status = status;
    this.code = payload && payload.error && payload.error.code;
    this.payload = payload;
  }
}

async function req(method, path, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    const handler = api.onUnauthorized;
    if (handler) handler();
    throw new ApiError(401, await res.json().catch(() => ({})));
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const api = {
  onUnauthorized: null,
  get: (p) => req("GET", p),
  post: (p, body) => req("POST", p, body),
  patch: (p, body) => req("PATCH", p, body),
  put: (p, body) => req("PUT", p, body),
  delete: (p) => req("DELETE", p),
};

export const endpoints = {
  me: () => api.get("/api/auth/me"),
  register: (body) => api.post("/api/auth/register", body),
  login: (body) => api.post("/api/auth/login", body),
  logout: () => api.post("/api/auth/logout"),
  forgotPassword: (body) => api.post("/api/auth/forgot", body),
  resetPassword: (body) => api.post("/api/auth/reset", body),

  listPrompts: ({ search, projectId } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (projectId) params.set("projectId", projectId);
    const qs = params.toString();
    return api.get("/api/prompts" + (qs ? `?${qs}` : ""));
  },
  getPrompt: (id) => api.get(`/api/prompts/${encodeURIComponent(id)}`),
  createPrompt: (body) => api.post("/api/prompts", body),
  updatePrompt: (id, body) =>
    api.patch(`/api/prompts/${encodeURIComponent(id)}`, body),
  deletePrompt: (id) => api.delete(`/api/prompts/${encodeURIComponent(id)}`),

  listProjects: () => api.get("/api/projects"),
  createProject: (name) => api.post("/api/projects", { name }),
  renameProject: (id, name) =>
    api.patch(`/api/projects/${encodeURIComponent(id)}`, { name }),
  deleteProject: (id) => api.delete(`/api/projects/${encodeURIComponent(id)}`),
  reorderProjects: (ids) => api.patch("/api/projects/order", { ids }),
  // Mover prompt entre projetos: PATCH com projectId (string ou null = "sem projeto").
  movePrompt: (id, projectId) =>
    api.patch(`/api/prompts/${encodeURIComponent(id)}`, { projectId }),

  listApiKeys: () => api.get("/api/settings/api-keys"),
  saveApiKey: (provider, key) =>
    api.put(`/api/settings/api-keys/${encodeURIComponent(provider)}`, { key }),
  deleteApiKey: (provider) =>
    api.delete(`/api/settings/api-keys/${encodeURIComponent(provider)}`),
  setDefaultProvider: (provider) =>
    api.patch("/api/settings/default-provider", { provider }),

  improvePrompt: (id, body) =>
    api.post(`/api/prompts/${encodeURIComponent(id)}/improve`, body || {}),

  // MFA — fluxo de login
  mfaVerify: (body) => api.post("/api/auth/mfa/verify", body),
  mfaResend: (body) => api.post("/api/auth/mfa/resend", body),

  // MFA — settings
  getMfa: () => api.get("/api/settings/mfa"),
  enableMfaStep1: (body) => api.post("/api/settings/mfa/enable", body),
  enableMfaStep2: (body) => api.post("/api/settings/mfa/enable", body),
  disableMfa: (body) => api.post("/api/settings/mfa/disable", body),
  revokeTrustedDevice: (id) =>
    api.delete(`/api/settings/mfa/trusted-devices/${encodeURIComponent(id)}`),
  revokeAllTrustedDevices: () => api.delete("/api/settings/mfa/trusted-devices"),
};
