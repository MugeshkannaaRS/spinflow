import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  const [profile, setProfile] = useState<MillConfigProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = () => setFetchKey((k) => k + 1);

  useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN") {
      setProfile(EMPTY_PROFILE);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get("/mill-config/profile")
      .then((r) => {
        if (!cancelled) {
          setProfile({
            field_labels: r.data?.field_labels ?? {},
            dropdown_options: r.data?.dropdown_options ?? {},
          });
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(EMPTY_PROFILE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, fetchKey]);

  return (
    <MillConfigContext.Provider value={{ profile, loading, refetch }}>
      {children}
    </MillConfigContext.Provider>
  );
}

export function useMillConfigProfile() {
  return useContext(MillConfigContext);
}
