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
import { useRBAC } from "@/hooks/useRBAC";

const ALL_MODULE_ITEMS = [
  { to: "/production", label: "Production", icon: Factory, module: "production" },
  { to: "/quality", label: "Quality", icon: BadgeCheck, module: "quality" },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, module: "maintenance" },
  { to: "/hr", label: "HR", icon: Users, module: "hr" },
  { to: "/payroll", label: "Payroll", icon: Banknote, module: "payroll" },
  { to: "/purchase", label: "Purchase", icon: Package, module: "purchase" },
  { to: "/stores", label: "Stores", icon: Warehouse, module: "stores" },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { to: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
  { to: "/lotrac", label: "LoTrac", icon: QrCode, module: "lotrac" },
  { to: "/accounts", label: "Accounts", icon: Receipt, module: "accounts" },
  { to: "/sales", label: "Sales & Stock", icon: TrendingUp, module: "sales" },
  { to: "/masters", label: "Masters", icon: Settings2, module: "masters" },
  { to: "/users", label: "Users", icon: UserCog, module: "users" },
  { to: "/audit", label: "Audit", icon: ClipboardList, module: "audit" },
  { to: "/admin", label: "Admin", icon: Shield, module: "admin" },
];

const CANDIDATE_TABS = [
  { to: "/production", label: "Production", icon: Factory, module: "production" },
  { to: "/hr", label: "HR", icon: Users, module: "hr" },
  { to: "/quality", label: "Quality", icon: BadgeCheck, module: "quality" },
  { to: "/stores", label: "Stores", icon: Warehouse, module: "stores" },
  { to: "/accounts", label: "Accounts", icon: Receipt, module: "accounts" },
];

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useWebSocket();
  const { user } = useAuth();
  const { canAccess } = useRBAC();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const visibleModules = ALL_MODULE_ITEMS.filter(item => {
    if (item.to === "/admin" && user?.role !== "SUPER_ADMIN") return false;
    return canAccess(item.module);
  });

  const middleTabs = CANDIDATE_TABS.filter(t => canAccess(t.module)).slice(0, 3);

  const bottomTabs: Array<{ to: string | null; label: string; icon: any; isAlert?: boolean }> = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...middleTabs,
    { to: null, label: "Alerts", icon: Bell, isAlert: true },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-primary)] border-t border-[var(--border)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-14">
          {bottomTabs.map((item) => {
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
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-primary)] rounded-t-2xl flex flex-col max-h-[75vh]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">All Modules</h3>
              <button onClick={() => setMoreOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
                <X className="size-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4">
              <div className="grid grid-cols-4 gap-3">
                {visibleModules.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                        active
                          ? "text-brand-500 bg-brand-500/10"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]",
                      )}
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                        <Icon className="size-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-xs text-center leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
