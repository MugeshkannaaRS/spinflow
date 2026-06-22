import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";

export interface MillConfigProfile {
  field_labels: Record<string, string>;
  dropdown_options: Record<string, any>;
}

interface MillConfigContextValue {
  profile: MillConfigProfile;
  loading: boolean;
  refetch: () => void;
}

const EMPTY_PROFILE: MillConfigProfile = {
  field_labels: {},
  dropdown_options: {},
};

const MillConfigContext = createContext<MillConfigContextValue>({
  profile: EMPTY_PROFILE,
  loading: false,
  refetch: () => {},
});

export function MillConfigProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // useQuery deduplicates concurrent callers — no matter how many DataTable /
  // CustomLabel components mount at once, only one HTTP request is made.
  const { data, isLoading } = useQuery<MillConfigProfile>({
    queryKey: ["mill-config-profile", user?.millId ?? user?.id],
    queryFn: () =>
      api
        .get("/mill-config/profile")
        .then((r) => ({
          field_labels: r.data?.field_labels ?? {},
          dropdown_options: r.data?.dropdown_options ?? {},
        }))
        .catch(() => EMPTY_PROFILE),
    staleTime: 10 * 60 * 1000,   // 10 min
    gcTime: 20 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    enabled: !!user && !isSuperAdmin,
    placeholderData: EMPTY_PROFILE,
  });

  const refetch = () =>
    qc.invalidateQueries({ queryKey: ["mill-config-profile"] });

  return (
    <MillConfigContext.Provider
      value={{ profile: data ?? EMPTY_PROFILE, loading: isLoading, refetch }}
    >
      {children}
    </MillConfigContext.Provider>
  );
}

export function useMillConfigProfile() {
  return useContext(MillConfigContext);
}
