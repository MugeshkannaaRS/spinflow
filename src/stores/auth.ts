import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/rbac";
import { setAuthHeader } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  millId: string;
  millName: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  login: (user: AuthUser, token: string, refreshToken?: string) => void;
  setTokens: (token: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      login: (user, token, refreshToken) => {
        set({ user, token, refreshToken: refreshToken || null });
        setAuthHeader(token);
      },
      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
        setAuthHeader(token);
      },
      logout: () => {
        set({ user: null, token: null, refreshToken: null });
        setAuthHeader(null);
      },
    }),
    { name: "spinflow-auth" },
  ),
);
