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
  moduleRestrictions?: Record<string, boolean> | null;
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
        // Resolve the code from companyMills if available
        const millCode = user.companyMills?.find(m => m.id === user.millId)?.code ?? "";
        const activeMill = (user.millId && user.millName)
          ? { id: user.millId, name: user.millName, code: millCode }
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
      // SECURITY: access token is NOT persisted to localStorage.
      // It lives only in memory (Zustand state) and is re-acquired on
      // browser refresh via the httponly refresh cookie → /auth/refresh.
      // XSS cannot steal the access token from storage.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        activeMill: state.activeMill,
        // token intentionally excluded
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return current;
        return {
          ...current,
          user: (p.user as AuthUser | null) ?? null,
          isAuthenticated: (p.isAuthenticated as boolean) ?? false,
          activeMill: (p.activeMill as CompanyMill | null) ?? null,
          // token and refreshToken are intentionally NOT restored from storage
          token: null,
          refreshToken: null,
        };
      },
      migrate: (persisted: unknown) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return initialState;
        // Strip any token that may have been persisted by older versions
        return {
          ...initialState,
          user: (p.user as AuthUser | null) ?? null,
          activeMill: (p.activeMill as CompanyMill | null) ?? null,
        };
      },
      version: 4,  // bumped: removes token from localStorage
    },
  ),
);
