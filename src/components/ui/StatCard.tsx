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

const colorMap: Record<string, { iconBg: string; iconColor: string; progressBar: string }> = {
  blue:    { iconBg: "bg-blue-50 dark:bg-blue-900/30",    iconColor: "text-blue-500",    progressBar: "bg-blue-500" },
  green:   { iconBg: "bg-emerald-50 dark:bg-emerald-900/30", iconColor: "text-emerald-500", progressBar: "bg-emerald-500" },
  indigo:  { iconBg: "bg-blue-50 dark:bg-blue-900/30",     iconColor: "text-blue-500",    progressBar: "bg-blue-500" },
  orange:  { iconBg: "bg-orange-50 dark:bg-orange-900/30",  iconColor: "text-orange-500",  progressBar: "bg-orange-500" },
  emerald: { iconBg: "bg-teal-50 dark:bg-teal-900/30",      iconColor: "text-teal-500",    progressBar: "bg-teal-500" },
  red:     { iconBg: "bg-red-50 dark:bg-red-900/30",        iconColor: "text-red-500",     progressBar: "bg-red-500" },
  purple:  { iconBg: "bg-purple-50 dark:bg-purple-900/30",  iconColor: "text-purple-500",  progressBar: "bg-purple-500" },
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
        "relative bg-white dark:bg-slate-800 rounded-2xl p-5",
        "border border-gray-100 dark:border-slate-700",
        "shadow-sm hover:shadow-md transition-all duration-200",
        alert && "border-l-4 border-l-red-500",
        onClick && "cursor-pointer hover:-translate-y-0.5"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
          {title}
        </p>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          c.iconBg
        )}>
          <Icon className={cn("w-5 h-5", c.iconColor)} />
        </div>
      </div>

      <div className="mb-1">
        <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
          {value}
        </span>
      </div>

      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">{subtitle}</p>
      )}

      {trend && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium mt-1",
          trendUp ? "text-emerald-600" : "text-red-500"
        )}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend}
        </div>
      )}

      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{progressLabel}</span>
            <span className="font-medium">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", c.progressBar)}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
