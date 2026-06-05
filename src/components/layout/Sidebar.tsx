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
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";

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
      { to: "/production", label: "Production",   icon: Factory,     module: "production" },
      { to: "/quality",    label: "Quality",       icon: BadgeCheck,  module: "quality" },
      { to: "/maintenance",label: "Maintenance",   icon: Wrench,      module: "maintenance" },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/hr",      label: "Human Resources", icon: Users,   module: "hr" },
      { to: "/payroll", label: "Payroll",          icon: Banknote, module: "payroll" },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      { to: "/purchase",   label: "Cotton Purchase", icon: Package,   module: "purchase" },
      { to: "/stores",     label: "Stores",          icon: Warehouse,  module: "stores" },
      { to: "/inventory",  label: "Inventory",       icon: Boxes,      module: "inventory" },
      { to: "/dispatch",   label: "Dispatch",        icon: Truck,      module: "dispatch" },
      { to: "/lotrac",     label: "LoTrac",          icon: QrCode,     module: "lotrac" },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/accounts", label: "Accounts", icon: Receipt,    module: "accounts" },
      { to: "/sales",    label: "Sales",    icon: TrendingUp, module: "sales" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/masters",           label: "Masters",       icon: Settings2,       module: "masters" },
      { to: "/users",             label: "Users & Roles", icon: UserCog,         module: "users" },
      { to: "/audit",             label: "Audit Logs",    icon: ClipboardList,   module: "audit" },
      { to: "/admin",             label: "Admin Panel",   icon: Shield,          module: "admin" },
      { to: "/admin/column-config", label: "Column Config", icon: SlidersHorizontal, module: "column_config" },
    ],
  },
];

const COMPANY_OWNER_ROLES = new Set(["MILL_OWNER", "SUPER_ADMIN"]);

// Role → badge color
const ROLE_BADGE_COLORS: Record<string, string> = {
  SUPER_ADMIN:          "bg-purple-600 text-white",
  MILL_OWNER:           "bg-blue-600 text-white",
  GENERAL_MANAGER:      "bg-cyan-600 text-white",
  PRODUCTION_MANAGER:   "bg-green-600 text-white",
  QUALITY_MANAGER:      "bg-yellow-500 text-white",
  DISPATCH_MANAGER:     "bg-orange-600 text-white",
  HR_MANAGER:           "bg-pink-600 text-white",
  ACCOUNTANT:           "bg-indigo-600 text-white",
  MAINTENANCE_MANAGER:  "bg-red-600 text-white",
  STORE_MANAGER:        "bg-teal-600 text-white",
  SUPERVISOR:           "bg-slate-500 text-white",
  MACHINE_OPERATOR:     "bg-slate-400 text-white",
  SECURITY_GATE:        "bg-slate-400 text-white",
  AUDITOR:              "bg-slate-400 text-white",
};

function RoleBadge({ role, small = false }: { role: string; small?: boolean }) {
  const colorClass = ROLE_BADGE_COLORS[role] ?? "bg-slate-500 text-white";
  const label = role.replace(/_/g, " ");
  return (
    <span className={cn(
      "inline-block rounded font-semibold uppercase tracking-wider leading-none",
      small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
      colorClass,
    )}>
      {label}
    </span>
  );
}

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const { user, logout } = useAuth();
  const { canAccess, isSuperAdmin, companyModulesLoaded, isDashboardOnly } = useRBAC();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  if (!user) return null;

  const isActive = (to: string) => {
    if (to === "/admin") return pathname === "/admin";
    return pathname === to || pathname.startsWith(to + "/");
  };

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  if (!isSuperAdmin && !companyModulesLoaded) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "#0f172a" }}>
        <div className="flex-shrink-0 px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {collapsed ? (
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
          ) : (
            <div>
              <div className="text-white font-semibold text-base">SpinFlow ERP</div>
              <div className="text-[#94a3b8] text-xs mt-0.5">Loading…</div>
            </div>
          )}
        </div>
        <nav className="flex-1 py-3 px-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse mx-1 mb-1" style={{ backgroundColor: "#1e293b" }} />
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
        // SUPER_ADMIN = vendor: only sees vendor modules
        const SA_MODULES = new Set(["dashboard", "admin", "column_config", "users", "audit", "billing"]);
        if (isSuperAdmin) return SA_MODULES.has(item.module);
        return canAccess(item.module);
      }),
    }))
    .filter((group) => group.items.length > 0);

  const showBilling = COMPANY_OWNER_ROLES.has(user.role) && !isDashboardOnly();

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#0f172a" }}>
      {/* Logo */}
      <div
        className="flex-shrink-0 px-4 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", minHeight: 64 }}
      >
        {collapsed ? (
          <Link to="/dashboard" className="flex justify-center">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              S
            </div>
          </Link>
        ) : (
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              S
            </div>
              <div className="min-w-0">
                <div className="text-white font-semibold text-base leading-tight truncate">SpinFlow ERP</div>
                <div className="text-[#94a3b8] text-xs mt-0.5 truncate">
                  {user?.role === "SUPER_ADMIN" ? "Vendor" : (user?.millName ?? "Your mill")}
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
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "#475569" }}
              >
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
                    "flex items-center rounded-md transition-all duration-150 mb-0.5 cursor-pointer min-h-[40px]",
                    collapsed ? "justify-center px-2" : "px-3",
                    active
                      ? "text-white"
                      : "hover:text-white",
                  )}
                  style={
                    active
                      ? { backgroundColor: "#3b82f6" }
                      : undefined
                  }
                  onMouseEnter={active ? undefined : (e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#1e293b";
                  }}
                  onMouseLeave={active ? undefined : (e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "";
                  }}
                >
                  <Icon
                    className={cn(
                      "shrink-0",
                      collapsed ? "w-5 h-5" : "w-[18px] h-[18px] mr-3",
                      active ? "text-white" : "text-[#94a3b8]",
                    )}
                  />
                  {!collapsed && (
                    <span className={cn("text-[14px] font-medium truncate", active ? "text-white" : "text-[#94a3b8]")}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider key={item.to}>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="text-xs"
                        style={{ backgroundColor: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
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

        {/* Billing */}
        {showBilling && (
          <div className="mb-1">
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#475569" }}>
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
                    "flex items-center rounded-md transition-all duration-150 mb-0.5 cursor-pointer min-h-[40px]",
                    collapsed ? "justify-center px-2" : "px-3",
                  )}
                  style={active ? { backgroundColor: "#3b82f6" } : undefined}
                  onMouseEnter={active ? undefined : (e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#1e293b";
                  }}
                  onMouseLeave={active ? undefined : (e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "";
                  }}
                >
                  <CreditCard className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-[18px] h-[18px] mr-3", active ? "text-white" : "text-[#94a3b8]")} />
                  {!collapsed && <span className={cn("text-[14px] font-medium truncate", active ? "text-white" : "text-[#94a3b8]")}>Billing</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs" style={{ backgroundColor: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}>
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

      {/* Bottom — user info + role badge + collapse toggle */}
      <div className="flex-shrink-0 px-3 py-3 border-t space-y-1" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {!collapsed ? (
          <Link
            to="/profile"
            onClick={onNavClick}
            className="flex items-center gap-3 px-2 py-2 rounded-lg transition-colors"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#1e293b"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: "#3b82f6" }}
            >
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-white truncate">{user?.name}</div>
              <RoleBadge role={user?.role ?? ""} small />
            </div>
          </Link>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/profile" onClick={onNavClick} className="flex justify-center py-1.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: "#3b82f6" }}
                  >
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs" style={{ backgroundColor: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}>
                {user?.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Logout */}
        {!collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[#94a3b8] hover:text-red-400 transition-colors text-[13px]"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#1e293b"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => {
            const isCollapsed = localStorage.getItem("spinflow_sidebar_collapsed") === "true";
            localStorage.setItem("spinflow_sidebar_collapsed", String(!isCollapsed));
            window.dispatchEvent(new Event("sidebar-collapse-change"));
          }}
          className="hidden lg:flex w-full items-center justify-center py-1.5 rounded-lg text-[#94a3b8] hover:text-white transition-colors min-h-[40px]"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#1e293b"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
        style={{ backgroundColor: "#0f172a" }}
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
            className="absolute left-0 top-0 h-full w-72 transition-transform duration-200 shadow-2xl"
            style={{
              transform: open ? "translateX(0)" : "translateX(-100%)",
              backgroundColor: "#0f172a",
            }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-4 p-1.5 rounded-md text-[#94a3b8] hover:bg-[#1e293b] hover:text-white transition-colors"
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
