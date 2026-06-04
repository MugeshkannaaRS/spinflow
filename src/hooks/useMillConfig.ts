import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export interface MillMasters {
  department: string[];
  designation: string[];
  grade: string[];
  shift: string[];
  machine_type: string[];
  machine_brand: string[];
  vehicle_type: string[];
  inventory_category: string[];
  employee_category: string[];
  blood_group: string[];
  section: string[];
  [key: string]: string[];
}

export interface MillSubscription {
  plan: string;
  max_users: number;
  current_users: number;
  remaining_users: number;
  currency_symbol: string;
  currency_code: string;
  is_over_limit: boolean;
  overage_users: number;
}

const EMPTY_MASTERS: MillMasters = {
  department: [], designation: [], grade: [],
  shift: [], machine_type: [], machine_brand: [],
  vehicle_type: [], inventory_category: [],
  employee_category: [], blood_group: [], section: [],
};

/** Returns all dynamic master lists for the current mill (departments, grades, etc.) */
export function useMillMasters() {
  const user = useAuth(s => s.user);
  const activeMill = useAuth(s => s.activeMill);
  const millId = activeMill?.id ?? user?.millId;

  return useQuery<MillMasters>({
    queryKey: ["mill-masters", millId],
    queryFn: () => api.get("/mill-config/masters/all").then(r => r.data),
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!millId,
    placeholderData: EMPTY_MASTERS,
  });
}

/** Returns masters for a specific category */
export function useMillMasterCategory(category: string) {
  const user = useAuth(s => s.user);
  const activeMill = useAuth(s => s.activeMill);
  const millId = activeMill?.id ?? user?.millId;

  return useQuery<string[]>({
    queryKey: ["mill-masters-category", millId, category],
    queryFn: () => api.get("/mill-config/masters", { params: { category } }).then(r => r.data),
    staleTime: 10 * 60 * 1000,
    enabled: !!millId && !!category,
    placeholderData: [],
  });
}

/** Returns subscription info including user limits and currency */
export function useMillSubscription() {
  const user = useAuth(s => s.user);

  return useQuery<MillSubscription>({
    queryKey: ["mill-subscription", user?.companyId],
    queryFn: () => api.get("/mill-config/subscription").then(r => r.data),
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

/** Mutation to update the display currency for the company */
export function useUpdateCurrency() {
  const qc = useQueryClient();
  const user = useAuth(s => s.user);

  return useMutation({
    mutationFn: (symbol: string) =>
      api.patch("/mill-config/subscription/currency", { symbol }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["mill-subscription"] });
      // Update the global currency symbol in formatters
      if (typeof window !== "undefined" && data?.symbol) {
        (window as any).__spinflow_currency__ = data.symbol;
      }
    },
  });
}

/** Returns custom field definitions for a module */
export function useMillCustomFields(module: string) {
  const user = useAuth(s => s.user);
  const activeMill = useAuth(s => s.activeMill);
  const millId = activeMill?.id ?? user?.millId;

  return useQuery({
    queryKey: ["mill-custom-fields", millId, module],
    queryFn: () => api.get("/mill-config/custom-fields", { params: { module } }).then(r => r.data),
    staleTime: 10 * 60 * 1000,
    enabled: !!millId && !!module,
    placeholderData: [],
  });
}
