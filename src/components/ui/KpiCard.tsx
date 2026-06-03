import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiTrend {
  value: number;       // absolute value, e.g. 4.2
  direction: "up" | "down";
  positive: boolean;   // true = up-is-good; false = down-is-good (e.g. waste%)
}

interface KpiProgress {
  value: number;       // current value
  max: number;         // max value (100 for pct, or target qty)
  color?: string;      // tailwind bg class, e.g. "bg-blue-500"
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  iconColor?: string;   // e.g. "text-blue-600"
  iconBg?: string;      // e.g. "bg-blue-50"
  trend?: KpiTrend;
  progress?: KpiProgress;
  className?: string;
}

/**
 * Industrial KPI card used across all dashboards.
 * Large font-mono value, optional trend chip, optional progress bar.
 */
export function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-50",
  trend,
  progress,
  className,
}: KpiCardProps) {
  const progressPct = progress
    ? Math.min(100, Math.max(0, progress.max > 0 ? (progress.value / progress.max) * 100 : 0))
    : 0;

  const trendPositive =
    trend &&
    ((trend.direction === "up" && trend.positive) ||
     (trend.direction === "down" && !trend.positive));

  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-[#e2e8f0] p-5 shadow-sm flex flex-col gap-3",
        className,
      )}
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#64748b]">
          {label}
        </p>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", iconBg)}>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
      </div>

      {/* Value */}
      <div>
        <p className="text-[28px] font-bold text-[#0f172a] leading-none font-mono tabular-nums">
          {value}
        </p>

        {/* Sub-label + trend */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {subLabel && (
            <span className="text-[13px] text-[#64748b]">{subLabel}</span>
          )}
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded",
                trendPositive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700",
              )}
            >
              {trend.direction === "up"
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />
              }
              {trend.value.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="mt-1 h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progress.color ??
                (progressPct >= 90 ? "#16a34a"
               : progressPct >= 70 ? "#d97706"
               : "#dc2626"),
            }}
          />
        </div>
      )}
    </div>
  );
}
