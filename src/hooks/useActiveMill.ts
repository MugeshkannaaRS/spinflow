import { useAuth } from "@/stores/auth";

export function useActiveMill() {
  const user = useAuth(s => s.user);
  const activeMill = useAuth(s => s.activeMill);

  const millId = activeMill?.id ?? user?.millId ?? null;
  const millName = activeMill?.name ?? user?.millName ?? "Your Mill";
  const mills = user?.companyMills ?? [];
  const hasMultipleMills = mills.length > 1;

  return { millId, millName, mills, hasMultipleMills, activeMill };
}
