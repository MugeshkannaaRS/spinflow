import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export interface DeptOption {
  name: string;
  id: string;
  code: string;
}

export interface ShiftOption {
  id: string;
  name: string;
  start?: string;
  end?: string;
}

export interface MachineOption {
  id: string;
  code: string;
  name: string;
  department_id: string | null;
}

export interface MillMasters {
  department: DeptOption[];
  department_names: string[];
  shift: ShiftOption[];
  designation: string[];
  grade: string[];
  machine_type: string[];
  machines: MachineOption[];
  [key: string]: unknown;
}

const EMPTY_MASTERS: MillMasters = {
  department: [],
  department_names: [],
  shift: [],
  designation: [],
  grade: [],
  machine_type: [],
  machines: [],
};

/** Returns all dynamic master lists for the current mill (departments, grades, machines, etc.) */
export function useMillMasters() {
  const user = useAuth((s) => s.user);
  const activeMill = useAuth((s) => s.activeMill);
  const millId = activeMill?.id ?? user?.millId;

  return useQuery<MillMasters>({
    queryKey: ["mill-masters", millId],
    queryFn: () =>
      api
        .get("/mill-config/masters/all")
        .then((r) => r.data)
        .catch(() => EMPTY_MASTERS),
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!millId,
    placeholderData: EMPTY_MASTERS,
  });
}

/** Returns masters for a specific category */
export function useMillMasterCategory(category: string) {
  const user = useAuth((s) => s.user);
  const activeMill = useAuth((s) => s.activeMill);
  const millId = activeMill?.id ?? user?.millId;

  return useQuery<string[]>({
    queryKey: ["mill-masters-cat", millId, category],
    queryFn: () => api.get("/mill-config/masters", { params: { category } }).then((r) => r.data),
    staleTime: 10 * 60 * 1000,
    enabled: !!millId && !!category,
    placeholderData: [],
  });
}

/** Returns subscription info: user limits, currency symbol */
export function useMillSubscription() {
  const user = useAuth((s) => s.user);

  return useQuery({
    queryKey: ["mill-subscription", user?.companyId],
    queryFn: () => api.get("/mill-config/subscription").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!user?.companyId,
    placeholderData: {
      plan: "starter",
      max_users: 10,
      current_users: 0,
      remaining_users: 10,
      currency_symbol: "₹",
      currency_code: "INR",
      is_over_limit: false,
      overage_users: 0,
    },
  });
}

/** Mutation helper to update currency */
export function useUpdateCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) =>
      api.patch("/mill-config/subscription/currency", { symbol }).then((r) => r.data),
    onSuccess: (data: { symbol: string }) => {
      qc.invalidateQueries({ queryKey: ["mill-subscription"] });
      if (typeof window !== "undefined" && data?.symbol) {
        (window as any).__spinflow_currency__ = data.symbol;
      }
    },
  });
}

/**
 * Returns the shifts defined in Masters → Shifts for the current mill.
 * Returns an empty array (not hardcoded defaults) when no shifts are configured,
 * so the UI can prompt the user to add shifts rather than silently using wrong values.
 */
export function useShifts() {
  const { data } = useMillMasters();
  return (data?.shift ?? []) as ShiftOption[];
}

/**
 * Returns a function that invalidates all mill-related queries after import.
 * Call this in every onSuccess callback after bulk import.
 */
export function useInvalidateMillMasters() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["mill-masters"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["masters"] });
    qc.invalidateQueries({ queryKey: ["machines"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["hr-employees"] });
  };
}
