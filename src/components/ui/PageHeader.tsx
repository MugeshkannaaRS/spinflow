import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Action buttons — "+ New Employee", "Export", etc. */
  actions?: React.ReactNode;
  /** Legacy prop (kept for backward compat) */
  children?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * Full-width page header used at the top of every module page.
 * Provides consistent title, subtitle, action buttons, and refresh.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  onRefresh,
  isRefreshing,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between px-6 py-4 bg-white border-b border-[#e2e8f0]",
        className,
      )}
    >
      {/* Left: title + subtitle */}
      <div>
        <h1 className="text-[22px] font-bold text-[#0f172a] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-[#64748b] mt-0.5">{subtitle}</p>}
      </div>

      {/* Right: actions + refresh */}
      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
        {actions}
        {children}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#d1d5db] bg-white",
              "text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
