import { cn } from "@/lib/utils";

type StatusVariant = "green" | "yellow" | "red" | "slate";

interface StatusConfig {
  variant: StatusVariant;
  label?: string; // optional override label
}

// Normalize incoming status string → variant + optional display label
function resolveStatus(raw: string): StatusConfig {
  const s = raw.toLowerCase().replace(/[\s-]/g, "_");

  // Green — active / good states
  if (
    [
      "active",
      "present",
      "paid",
      "delivered",
      "running",
      "pass",
      "passed",
      "approved",
      "processed",
      "finalized",
      "completed",
      "done",
      "success",
      "in_stock",
      "available",
      "open",
    ].includes(s)
  )
    return { variant: "green" };

  // Yellow — in-progress / pending states
  if (
    [
      "pending",
      "in_transit",
      "in_progress",
      "processing",
      "loaded",
      "loading",
      "partial",
      "review",
      "draft",
      "scheduled",
      "dispatched",
      "sent",
    ].includes(s)
  )
    return { variant: "yellow" };

  // Red — bad / failure states
  if (
    [
      "inactive",
      "absent",
      "overdue",
      "failed",
      "fail",
      "rejected",
      "down",
      "breakdown",
      "maintenance",
      "suspended",
      "cancelled",
      "canceled",
      "late",
      "error",
      "unpaid",
      "deactivated",
    ].includes(s)
  )
    return { variant: "red" };

  // Slate — neutral
  if (
    [
      "idle",
      "draft",
      "on_leave",
      "transferred",
      "archived",
      "closed",
      "unknown",
      "n_a",
      "na",
    ].includes(s)
  )
    return { variant: "slate" };

  return { variant: "slate" };
}

const VARIANT_STYLES: Record<StatusVariant, { badge: string; dot: string }> = {
  green: { badge: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  yellow: { badge: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" },
  red: { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  slate: { badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

interface StatusBadgeProps {
  status: string;
  /** Override the display text (defaults to status string, title-cased) */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Semantic status badge with colored dot.
 * Maps status strings to green/yellow/red/slate automatically.
 *
 * Usage:
 *   <StatusBadge status="approved" />
 *   <StatusBadge status="pending" label="Awaiting review" />
 *   <StatusBadge status={row.status} size="sm" />
 */
export function StatusBadge({ status, label, size = "md", className }: StatusBadgeProps) {
  const { variant } = resolveStatus(status);
  const { badge, dot } = VARIANT_STYLES[variant];
  const displayLabel = label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-[12px] px-2.5 py-0.5",
        badge,
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full shrink-0",
          size === "sm" ? "w-1.5 h-1.5" : "w-[6px] h-[6px]",
          dot,
        )}
      />
      {displayLabel}
    </span>
  );
}

export { resolveStatus, VARIANT_STYLES };
export type { StatusVariant };
