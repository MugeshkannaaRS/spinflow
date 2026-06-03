import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/rbac";
import { setAuthHeader } from "@/lib/api";

export interface CompanyMill {
  id: string;
  name: string;
  code: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  millId: string;
  millName: string;
  companyId?: string;
  allowedModules?: string[];
  mustChangePassword?: boolean;
  companyMills?: CompanyMill[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  activeMill: CompanyMill | null;
  login: (user: AuthUser, token: string, refreshToken?: string) => void;
  setUser: (updates: Partial<AuthUser>) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setActiveMill: (mill: CompanyMill | null) => void;
  logout: () => void;
}

const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  activeMill: null,
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,
      login: (user, token, refreshToken) => {
        const activeMill = (user.millId && user.millName)
          ? { id: user.millId, name: user.millName, code: "" }
          : null;
        set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true, activeMill });
        setAuthHeader(token);
      },
      setUser: (updates) => set((state) => {
        const merged = state.user ? { ...state.user, ...updates } : null;
        if (merged && !state.activeMill && merged.millId && merged.millName) {
          return { user: merged, activeMill: { id: merged.millId, name: merged.millName, code: "" } };
        }
        return { user: merged };
      }),
      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
        setAuthHeader(token);
      },
      setActiveMill: (mill) => set({ activeMill: mill }),
      logout: () => {
        set({ ...initialState });
        setAuthHeader(null);
      },
    }),
    {
      name: "spinflow-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        activeMill: state.activeMill,
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return current;
        return {
          ...current,
          ...p,
          refreshToken: null,
        };
      },
      migrate: (persisted: unknown) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return initialState;
        if (p.data && typeof p.data === "object") {
          const d = p.data as Record<string, unknown>;
          return {
            ...initialState,
            token: (p.token as string | null) ?? null,
            refreshToken: null,
          };
        }
        return { ...initialState, ...p, refreshToken: null };
      },
      version: 3,
    },
  ),
);
