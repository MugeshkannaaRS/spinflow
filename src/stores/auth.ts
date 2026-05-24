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
  companyId?: string;
  allowedModules?: string[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string, refreshToken?: string) => void;
  setTokens: (token: string, refreshToken: string) => void;
  logout: () => void;
}

const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,
      login: (user, token, refreshToken) => {
        set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true });
        setAuthHeader(token);
      },
      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
        setAuthHeader(token);
      },
      logout: () => {
        set({ ...initialState });
        setAuthHeader(null);
      },
    }),
    {
      name: "spinflow-auth",
      migrate: (persisted: unknown) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return initialState;
        // Handle old store shape that had a nested `data` object
        if (p.data && typeof p.data === "object") {
          const d = p.data as Record<string, unknown>;
          return {
            ...initialState,
            token: (p.token as string | null) ?? null,
            refreshToken: (p.refreshToken as string | null) ?? null,
            isAuthenticated: !!(p.token || d.user_id),
          };
        }
        return p;
      },
      version: 2,
    },
  ),
);
