import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { useRBAC } from "@/hooks/useRBAC";
import {
  LayoutDashboard,
  Factory,
  BadgeCheck,
  Wrench,
  Users,
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
  SlidersHorizontal,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module: string;
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" }],
  },
  {
    label: "Operations",
    items: [
      { to: "/production", label: "Production", icon: Factory, module: "production" },
      { to: "/quality", label: "Quality", icon: BadgeCheck, module: "quality" },
      { to: "/maintenance", label: "Maintenance", icon: Wrench, module: "maintenance" },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/hr", label: "Human Resources", icon: Users, module: "hr" },
      { to: "/payroll", label: "Payroll", icon: Banknote, module: "payroll" },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      { to: "/purchase", label: "Cotton Purchase", icon: Package, module: "purchase" },
      { to: "/stores", label: "Stores", icon: Warehouse, module: "stores" },
      { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
      { to: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
      { to: "/lotrac", label: "LoTrac", icon: QrCode, module: "lotrac" },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/accounts", label: "Accounts", icon: Receipt, module: "accounts" },
      { to: "/sales", label: "Sales", icon: TrendingUp, module: "sales" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/masters", label: "Masters", icon: Settings2, module: "masters" },
      { to: "/users", label: "Users & Roles", icon: UserCog, module: "users" },
      { to: "/audit", label: "Audit Logs", icon: ClipboardList, module: "audit" },
      { to: "/admin", label: "Admin Panel", icon: Shield, module: "admin" },
      { to: "/admin/column-config", label: "Column Config", icon: SlidersHorizontal, module: "column_config" },
    ],
  },
];

const COMPANY_OWNER_ROLES = new Set(["MILL_OWNER", "SUPER_ADMIN"]);

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const { user } = useAuth();
  const { canAccess, isSuperAdmin, companyModulesLoaded, isDashboardOnly } = useRBAC();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const isActive = (to: string) => {
    if (to === "/admin") return pathname === "/admin";
    return pathname === to;
  };

  if (!isSuperAdmin && !companyModulesLoaded) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "#0f1923" }}>
        <div className="flex-shrink-0 px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
          {collapsed ? (
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
          ) : (
            <div>
              <div className="text-white font-semibold text-[15px]">SpinFlow ERP</div>
              <div className="text-[#6b7280] text-[11px] mt-0.5">Loading...</div>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 bg-[#1e2d3d] rounded-lg animate-pulse mx-2 mb-1" />
          ))}
        </nav>
      </div>
    );
  }

  const filteredGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (isDashboardOnly()) return item.module === "dashboard";
        return canAccess(item.module);
      }),
    }))
    .filter((group) => group.items.length > 0);

  const showBilling = COMPANY_OWNER_ROLES.has(user.role) && !isDashboardOnly();

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#0f1923" }}>
      {/* Logo */}
      <div className="flex-shrink-0 px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
        ) : (
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              S
            </div>
            <div>
              <div className="text-white font-semibold text-[15px] leading-tight">SpinFlow ERP</div>
              <div className="text-[#6b7280] text-[11px] mt-0.5">
                {user?.millName ?? "Your mill"}
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              const link = (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavClick}
                  className={cn(
                    "flex items-center rounded-lg transition-all duration-150 mb-0.5 cursor-pointer",
                    collapsed ? "justify-center py-2.5" : "px-3 py-2",
                    active
                      ? "bg-[#1e2d3d] text-white"
                      : "text-[#94a3b8] hover:bg-[#1a2d42] hover:text-[#d1d5db]",
                  )}
                >
                  <Icon
                    className={cn(
                      "shrink-0",
                      collapsed ? "w-5 h-5" : "w-4 h-4 mr-3",
                    )}
                  />
                  {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider key={item.to}>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#0f1923] text-white border border-[rgba(255,255,255,0.1)] text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return link;
            })}
          </div>
        ))}
        {/* Billing nav item for company owners */}
        {showBilling && (
          <div className="mb-1">
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
                Company
              </div>
            )}
            {(() => {
              const active = isActive("/company/billing");
              const link = (
                <Link
                  to="/company/billing"
                  onClick={onNavClick}
                  className={cn(
                    "flex items-center rounded-lg transition-all duration-150 mb-0.5 cursor-pointer",
                    collapsed ? "justify-center py-2.5" : "px-3 py-2",
                    active
                      ? "bg-[#1e2d3d] text-white"
                      : "text-[#94a3b8] hover:bg-[#1a2d42] hover:text-[#d1d5db]",
                  )}
                >
                  <CreditCard className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4 mr-3")} />
                  {!collapsed && <span className="text-sm font-medium truncate">Billing</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#0f1923] text-white border border-[rgba(255,255,255,0.1)] text-xs">
                        Billing
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return link;
            })()}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-[rgba(255,255,255,0.06)]">
        {!collapsed ? (
          <Link
            to="/profile"
            onClick={onNavClick}
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-[#9ca3af] hover:bg-[#1a2d42] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-[#94a3b8] truncate">{user?.role?.replace(/_/g, " ")}</div>
            </div>
          </Link>
        ) : (
          <Link to="/profile" onClick={onNavClick} className="flex justify-center py-2">
            <div className="w-7 h-7 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
          </Link>
        )}

        <button
          onClick={() => {
            const isCollapsed = localStorage.getItem("spinflow_sidebar_collapsed") === "true";
            localStorage.setItem("spinflow_sidebar_collapsed", String(!isCollapsed));
            window.dispatchEvent(new Event("sidebar-collapse-change"));
          }}
          className="hidden lg:flex w-full items-center justify-center mt-2 py-1.5 rounded-lg text-[#94a3b8] hover:bg-[#1a2d42] transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("spinflow_sidebar_collapsed") === "true",
  );

  useEffect(() => {
    const handler = () => {
      setCollapsed(localStorage.getItem("spinflow_sidebar_collapsed") === "true");
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen flex flex-col overflow-hidden z-30 transition-all duration-200 ease-in-out hidden lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
        style={{ backgroundColor: "#0f1923" }}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile overlay */}
      {open !== undefined && (
        <div
          className={cn(
            "fixed inset-0 z-50 lg:hidden",
            open ? "visible" : "invisible pointer-events-none",
          )}
        >
          <div
            className="absolute inset-0 bg-black/60 transition-opacity duration-200"
            style={{ opacity: open ? 1 : 0 }}
            onClick={onClose}
          />
          <div
            className="absolute left-0 top-0 h-full w-72 transition-transform duration-200"
            style={{
              transform: open ? "translateX(0)" : "translateX(-100%)",
              backgroundColor: "#0f1923",
            }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-4 p-1 rounded-md text-[#6b7280] hover:bg-[#1a2d42]"
            >
              <X className="size-5" />
            </button>
            <SidebarContent collapsed={false} onNavClick={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
