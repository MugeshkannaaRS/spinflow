import axios from "axios";
import { useAuth } from "@/stores/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({
  baseURL: API_BASE ? `${API_BASE}/api/v1` : "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = useAuth.getState().refreshToken;
      if (refreshToken && error.config && !error.config._retry) {
        error.config._retry = true;
        try {
          const res = await api.post("/auth/refresh", { refresh_token: refreshToken });
          const { access_token, refresh_token } = res.data;
          useAuth.getState().setTokens(access_token, refresh_token);
          error.config.headers.Authorization = `Bearer ${access_token}`;
          return api(error.config);
        } catch {
          useAuth.getState().logout();
          window.location.href = "/login";
        }
      }
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
