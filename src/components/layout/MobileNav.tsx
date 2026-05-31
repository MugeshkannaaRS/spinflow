import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Factory,
  Users,
  Bell,
  Grid,
  BadgeCheck,
  Wrench,
  Banknote,
  Package,
  Warehouse,
  Boxes,
  Truck,
  QrCode,
  Receipt,
  TrendingUp,
  Settings2,
  UserCog,
  ClipboardList,
  Shield,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MODULE_ACCESS, type Module } from "@/lib/rbac";

const MAIN_TABS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/hr", label: "HR", icon: Users },
  { to: null, label: "Alerts", icon: Bell, isAlert: true },
];

const MORE_ITEMS = [
  { to: "/quality", label: "Quality", icon: BadgeCheck },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/payroll", label: "Payroll", icon: Banknote },
  { to: "/purchase", label: "Purchase", icon: Package },
  { to: "/stores", label: "Stores", icon: Warehouse },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/dispatch", label: "Dispatch", icon: Truck },
  { to: "/lotrac", label: "LoTrac", icon: QrCode },
  { to: "/accounts", label: "Accounts", icon: Receipt },
  { to: "/sales", label: "Sales", icon: TrendingUp },
  { to: "/masters", label: "Masters", icon: Settings2 },
  { to: "/users", label: "Users", icon: UserCog },
  { to: "/audit", label: "Audit", icon: ClipboardList },
  { to: "/admin", label: "Admin", icon: Shield },
];

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useWebSocket();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const visibleMore = MORE_ITEMS.filter((item) => {
    const module = item.to.replace("/", "") as Module;
    const allowedByRole = MODULE_ACCESS[user?.role ?? "OPERATOR"] ?? ["dashboard"];
    const allowedByCompany = user?.allowedModules ?? allowedByRole;
    if (item.to === "/admin" && user?.role !== "SUPER_ADMIN") return false;
    return allowedByRole.includes(module) && allowedByCompany.includes(module);
  });

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-primary)] border-t border-[var(--border)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-14">
          {MAIN_TABS.map((item) => {
            const Icon = item.icon;
            const active = item.to ? isActive(item.to) : false;
            const content = (
              <div className={cn(
                "flex flex-col items-center justify-center min-w-[56px] h-full px-3 transition-colors relative",
                active ? "text-brand-500" : "text-[var(--text-muted)]",
              )}>
                {item.isAlert ? (
                  <div className="relative mb-0.5">
                    <Icon className="size-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                ) : (
                  <Icon className={cn("size-5 mb-0.5", active ? "fill-brand-500/20" : "")} />
                )}
                <span className="text-[10px] leading-tight">{item.label}</span>
              </div>
            );
            if (!item.to) {
              return <div key={item.label} className="flex items-center justify-center">{content}</div>;
            }
            return (
              <Link key={item.to} to={item.to} className="flex items-center justify-center">
                {content}
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center min-w-[56px] h-full px-3 text-[var(--text-muted)]"
          >
            <Grid className="size-5 mb-0.5" />
            <span className="text-[10px] leading-tight">More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-primary)] rounded-t-2xl p-4 pb-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-sm font-semibold text-[var(--text-primary)]">All Modules</span>
              <button onClick={() => setMoreOpen(false)} className="text-[var(--text-muted)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {visibleMore.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 rounded-xl transition-colors",
                      active ? "text-brand-500 bg-brand-500/10" : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]",
                    )}
                  >
                    <Icon className="size-6" />
                    <span className="text-[10px] text-center leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
