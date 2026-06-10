import axios from "axios";
import { useAuth } from "@/stores/auth";
import { toast } from "sonner";

// VITE_API_BASE_URL must be set in .env (or .env.production for builds).
// There is intentionally no fallback — a missing env var means the app would
// silently hit the wrong backend, causing hard-to-debug data corruption.
const API_BASE = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE) {
  throw new Error(
    "[SpinFlow] VITE_API_BASE_URL is not set. " +
    "Create a .env file with VITE_API_BASE_URL=http://localhost:8000 for local dev, " +
    "or set it in your deployment environment."
  );
}
export { API_BASE };

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

let slowToastId: string | number | null = null;
let slowRequestTimer: ReturnType<typeof setTimeout> | null = null;

function clearSlowRequest() {
  if (slowRequestTimer) clearTimeout(slowRequestTimer);
  slowRequestTimer = null;
  if (slowToastId) {
    toast.dismiss(slowToastId);
    slowToastId = null;
  }
}

api.interceptors.request.use((config) => {
  const state = useAuth.getState();
  const token = state?.token ?? (state as any)?.data?.token ?? null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  clearSlowRequest();
  slowRequestTimer = setTimeout(() => {
    slowToastId = toast.info("Loading... (server is starting up, please wait)");
  }, 3000);
  return config;
});

api.interceptors.response.use(
  (response) => {
    clearSlowRequest();
    return response;
  },
  async (error) => {
    clearSlowRequest();
    if (error.response?.status === 401) {
      const url = error.config?.url || "";

      if (url.includes("/auth/refresh")) {
        useAuth.getState().logout();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (!url.includes("/auth/")) {
        const { refreshToken, logout } = useAuth.getState();
        if (error.config && !error.config._retry) {
          error.config._retry = true;
          try {
            const res = await api.post("/auth/refresh");
            const { access_token, refresh_token } = res.data;
            useAuth.getState().setTokens(access_token, refresh_token);
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return api(error.config);
          } catch {
            if (refreshToken) {
              try {
                const res = await api.post("/auth/refresh", { refresh_token: refreshToken });
                const { access_token, refresh_token } = res.data;
                useAuth.getState().setTokens(access_token, refresh_token);
                error.config.headers.Authorization = `Bearer ${access_token}`;
                return api(error.config);
              } catch {
                logout();
                window.location.href = "/login";
                return Promise.reject(error);
              }
            }
            logout();
            window.location.href = "/login";
            return Promise.reject(error);
          }
        }
        logout();
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);

export function setAuthHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}
