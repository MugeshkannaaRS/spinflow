import { useQuery } from "@tanstack/react-query";
import { getRecentAuditLogs, type AuditLog } from "@/services/auditService";
import { formatRelativeTime } from "@/utils/time";

const MODULE_ICONS: Record<string, string> = {
  production: "cog",
  quality: "flask",
  dispatch: "truck",
  stores: "archive",
  hr: "users",
  accounts: "currency",
  maintenance: "wrench",
};

function deriveIcon(module: string): string {
  return MODULE_ICONS[module] || "file-text";
}

function deriveColor(actionType: string | null | undefined): string {
  const upper = (actionType ?? "").toUpperCase();
  if (upper.includes("APPROVED") || upper.includes("CONFIRMED")) return "green";
  if (upper.includes("REJECTED") || upper.includes("BREAKDOWN") || upper.includes("FAILED"))
    return "red";
  if (upper.includes("CREATED")) return "blue";
  return "gray";
}

function humanizeAction(actionType: string | null | undefined): string {
  return (actionType ?? "unknown")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function deriveSubtitle(log: AuditLog): string {
  if (log.new_value && typeof log.new_value === "object") {
    const nv = log.new_value as Record<string, unknown>;
    if (nv.department) return String(nv.department);
    if (nv.customer_name) return String(nv.customer_name);
    if (nv.customer) return String(nv.customer);
    if (nv.machine_no) return `Machine ${nv.machine_no}`;
  }
  return log.module ?? "";
}

export interface ActivityItem {
  id: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  time: string;
}

export function useRecentActivity() {
  const query = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => getRecentAuditLogs({ limit: 15 }),
    refetchInterval: 30000,
  });

  const items: ActivityItem[] = (query.data?.data ?? []).map((log) => ({
    id: log.id,
    icon: deriveIcon(log.module ?? ""),
    color: deriveColor(log.action_type),
    title: humanizeAction(log.action_type),
    subtitle: deriveSubtitle(log),
    time: formatRelativeTime(log.timestamp),
  }));

  return { ...query, items };
}
