import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
  icon: React.ElementType;
  color: "blue" | "green" | "indigo" | "orange" | "emerald" | "red" | "purple";
  progress?: number;
  progressLabel?: string;
  alert?: boolean;
  onClick?: () => void;
}

const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
  green: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", bar: "bg-green-500" },
  indigo: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400", bar: "bg-purple-500" },
};

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendUp,
  icon: Icon,
  color,
  progress,
  progressLabel,
  alert,
  onClick,
}: StatCardProps) {
  const c = colorMap[color];
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-lg)] hover:-translate-y-0.5 transition-all duration-200",
        alert && "border-l-4 border-red-500",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-medium">
          {title}
        </div>
        <div className={cn("size-10 rounded-full flex items-center justify-center shrink-0", c.bg, c.text)}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-2 text-[28px] font-bold text-[var(--text-primary)] leading-none">{value}</div>
      {subtitle && <div className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{subtitle}</div>}
      {trend && (
        <div className={cn("mt-1 text-xs flex items-center gap-1", trendUp ? "text-emerald-600" : "text-red-500")}>
          {trendUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          <span>{trend}</span>
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", c.bar)}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {progressLabel && (
            <div className="mt-1 text-[11px] text-[var(--text-muted)] flex justify-between">
              <span>{progressLabel}</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
