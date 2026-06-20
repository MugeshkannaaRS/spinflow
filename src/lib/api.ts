import axios from "axios";
import { useAuth } from "@/stores/auth";
import { toast } from "sonner";

if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Set it in .env or the environment before starting.",
  );
}
const API_BASE = import.meta.env.VITE_API_BASE_URL;
export { API_BASE };

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

let slowToastId: string | number | null = null;
let slowRequestTimer: ReturnType<typeof setTimeout> | null = null;

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

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

function processRefreshQueue(token: string) {
  refreshQueue.forEach(({ resolve }) => resolve(token));
  refreshQueue = [];
}

function rejectRefreshQueue(error: unknown) {
  refreshQueue.forEach(({ reject }) => reject(error));
  refreshQueue = [];
}

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

      if (!url.includes("/auth/") && error.config && !error.config._retry) {
        error.config._retry = true;

        if (isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
          })
            .then((token) => {
              error.config.headers.Authorization = `Bearer ${token}`;
              return api(error.config);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        isRefreshing = true;

        try {
          const res = await api.post("/auth/refresh");
          const { access_token, refresh_token } = res.data;
          useAuth.getState().setTokens(access_token, refresh_token);
          processRefreshQueue(access_token);
          error.config.headers.Authorization = `Bearer ${access_token}`;
          return api(error.config);
        } catch {
          const { refreshToken, logout } = useAuth.getState();
          if (refreshToken) {
            try {
              const res = await api.post("/auth/refresh", { refresh_token: refreshToken });
              const { access_token, refresh_token } = res.data;
              useAuth.getState().setTokens(access_token, refresh_token);
              processRefreshQueue(access_token);
              error.config.headers.Authorization = `Bearer ${access_token}`;
              return api(error.config);
            } catch (e) {
              rejectRefreshQueue(e);
              logout();
              window.location.href = "/login";
              return Promise.reject(error);
            }
          }
          rejectRefreshQueue(error);
          logout();
          window.location.href = "/login";
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
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
