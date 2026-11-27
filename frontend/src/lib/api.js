import axios from "axios";
import { requestFinished, requestStarted } from "@/lib/apiActivity";

const api = axios.create({
  // From .env. Keep it relative ("/api/v1") so cookies stay first-party: Vite proxies it in dev, Vercel rewrites it in prod.
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  withCredentials: true,
  timeout: 20000,
});

// Count requests in flight for the top loading bar. Registered first, so this response handler
// runs before the others (a retried request is counted again as its own request).
api.interceptors.request.use((config) => {
  requestStarted();
  return config;
});
api.interceptors.response.use(
  (res) => {
    requestFinished();
    return res;
  },
  (error) => {
    requestFinished();
    return Promise.reject(error);
  },
);

// CSRF token from GET /auth/csrf/ (X-CSRFToken header). When the API is on another domain the
// csrftoken cookie belongs to that domain and document.cookie can't see it, so keep it here.
let csrfToken = null;
export const loadCsrf = () =>
  api.get("/auth/csrf/").then((res) => {
    csrfToken = res.headers?.["x-csrftoken"] || csrfToken;
    return res;
  });

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let collegeId = null; // Super Admin "managing a college" context
export const setCollegeContext = (id) => {
  collegeId = id;
};

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken || getCookie("csrftoken");
    if (token) config.headers["X-CSRFToken"] = token;
  }
  if (collegeId && !config.url?.startsWith("/platform/")) config.headers["X-College-Id"] = collegeId;
  return config;
});

// Refresh once on TOKEN_EXPIRED; concurrent requests share one refresh call
let refreshing = null;

// The API always answers with JSON (or an empty 204). An HTML page means /api was not routed to
// the backend (e.g. a wrong Vercel rewrite falling through to index.html); treat it as an error
// instead of letting the page be read as data, which made the router bounce /login <-> / forever.
function isNonJsonBody(res) {
  if (res.status === 204 || res.data === "" || res.data == null) return false;
  const type = String(res.headers?.["content-type"] || "");
  return !type.includes("json") && !(res.data instanceof Blob) && !(res.data instanceof ArrayBuffer);
}

api.interceptors.response.use(
  (res) => {
    if (isNonJsonBody(res)) {
      return Promise.reject({
        status: res.status,
        code: "BAD_RESPONSE",
        message: "The server sent an unexpected response. The API address may be misconfigured.",
        details: {},
      });
    }
    return res;
  },
  async (error) => {
    const original = error.config || {};
    const code = error.response?.data?.error?.code;
    const isAuthCall = original.url?.startsWith("/auth/refresh/") || original.url?.startsWith("/auth/login/");
    if (code === "TOKEN_EXPIRED" && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh/").finally(() => (refreshing = null));
        await refreshing;
        return api(original);
      } catch {
        window.dispatchEvent(new Event("pms:logout")); // AuthContext clears state, goes to /login
      }
    } else if (!isAuthCall && (code === "REFRESH_INVALID" || code === "NOT_AUTHENTICATED")) {
      window.dispatchEvent(new Event("pms:logout"));
    } else if (code === "PASSWORD_CHANGE_REQUIRED") {
      window.dispatchEvent(new Event("pms:password-change-required"));
    }
    return Promise.reject(normalizeError(error));
  },
);

// API error body: { error: { code, message, details? } } (API.md §3)
// Normalized to:  { status, code, message, details }
function normalizeError(error) {
  if (!error.response) {
    return { status: 0, code: "NETWORK_ERROR", message: "Network error. Check your connection.", details: {} };
  }
  const e = error.response.data?.error || {};
  return {
    status: error.response.status,
    code: e.code || "SERVER_ERROR",
    message: e.message || "Something went wrong.",
    details: e.details || {},
  };
}

// Small helpers so feature api.js files stay one-liners
export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);
export const del = (url, params) => api.delete(url, { params }).then((r) => r.data);

export default api;
