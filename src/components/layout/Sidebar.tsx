import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import { useRBAC } from "@/hooks/useRBAC";
import { ROLE_LABELS } from "@/lib/rbac";
import { toast } from "sonner";
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
  LogOut,
  Moon,
  Sun,
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

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const { user, logout, activeMill, setActiveMill } = useAuth();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const { canAccess, isSuperAdmin, companyModulesLoaded } = useRBAC();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const mills = user?.companyMills ?? [];
  const hasMultipleMills = mills.length > 1;
  const displayMillName = activeMill?.name ?? user?.millName ?? "Your Mill";

  const handleMillSwitch = useCallback((newMillId: string) => {
    const selected = mills.find(m => m.id === newMillId);
    if (!selected || selected.id === activeMill?.id) return;
    setActiveMill(selected);
    toast.info(`Switching to ${selected.name}...`, { duration: 1500 });
    queryClient.invalidateQueries();
  }, [mills, activeMill, setActiveMill, queryClient]);

  if (!user) return null;

  const isActive = (to: string) => {
    if (to === "/admin") return pathname === "/admin";
    return pathname === to;
  };

  if (!isSuperAdmin && !companyModulesLoaded) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "#1e3a5f" }}>
        <div className="flex-shrink-0 border-b border-blue-800/50">
          <div className="px-4 py-5">
            {collapsed ? (
              <div className="size-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.2)" }}>
                <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: "1.125rem" }}>SF</span>
              </div>
            ) : (
              <div className="text-left">
                <div className="text-white font-bold text-lg tracking-tight">SpinFlow</div>
                <div className="text-blue-400 text-[11px] mt-0.5">Your mill. In your hands.</div>
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 space-y-1 px-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-9 bg-blue-900/20 rounded-lg animate-pulse mx-2" />
          ))}
        </nav>
      </div>
    );
  }

  const filteredGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccess(item.module))
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#1e3a5f", color: "#dbeafe" }}>
      <div className="flex-shrink-0 border-b border-blue-800/50">
        <div className="px-4 py-5">
          {collapsed ? (
            <div className="size-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.2)" }}>
              <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: "1.125rem" }}>SF</span>
            </div>
          ) : (
            <div className="text-left">
              <div className="text-white font-bold text-lg tracking-tight">SpinFlow</div>
              <div className="text-blue-400 text-[11px] mt-0.5">Your mill. In your hands.</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-1 scrollbar-thin">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-4 mb-1 mt-4 first:mt-0">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-blue-400/70">
                  {group.label}
                </div>
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              const link = (
                <Link
                  to={item.to}
                  onClick={onNavClick}
                  className={cn(
                    "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer",
                    collapsed && "justify-center mx-1 px-0 border-l-0",
                    active
                      ? "text-white bg-blue-500/25 border-l-[3px] border-blue-400 font-medium"
                      : "text-blue-200 hover:text-white hover:bg-blue-500/20",
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active ? "text-blue-300" : "text-blue-400/70")} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider key={item.to}>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" style={{ backgroundColor: "#1e3a5f", color: "#ffffff", border: "1px solid #1d4ed8" }}>
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return <div key={item.to}>{link}</div>;
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex-shrink-0 border-t border-blue-800/50">
        {!collapsed && (
          <div className="px-4 py-3">
            {hasMultipleMills ? (
              <select
                value={activeMill?.id ?? user?.millId ?? ""}
                onChange={(e) => handleMillSwitch(e.target.value)}
                className="w-full bg-blue-900/30 text-blue-100 text-xs rounded-lg px-2 py-1.5 border border-blue-700/50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1"
              >
                {mills.map(m => (
                  <option key={m.id} value={m.id} className="bg-slate-800">{m.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-medium text-blue-100 truncate mb-0.5">{displayMillName}</p>
            )}
            <p className="text-xs text-blue-400">{user.role.replace(/_/g, " ")}</p>
          </div>
        )}

        <div className="flex items-center px-3 py-2 gap-1">
          <button
            onClick={toggle}
            className={cn(
              "flex items-center justify-center h-9 rounded-lg transition-colors",
              collapsed ? "w-full" : "w-9",
            )}
            style={{ color: "#93c5fd" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
          </button>

          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            className={cn(
              "flex items-center justify-center h-9 rounded-lg transition-colors",
              collapsed ? "w-full" : "w-9",
            )}
            style={{ color: "#93c5fd" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#93c5fd"; }}
            title="Logout"
          >
            <LogOut className="size-[18px]" />
          </button>

          {!collapsed && (
            <button
              onClick={() => {
                const isCollapsed = localStorage.getItem("spinflow_sidebar_collapsed") === "true";
                localStorage.setItem("spinflow_sidebar_collapsed", String(!isCollapsed));
                window.dispatchEvent(new Event("sidebar-collapse-change"));
              }}
              className="flex items-center justify-center h-9 w-9 rounded-lg transition-colors ml-auto"
              style={{ color: "#93c5fd" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-[18px]" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="px-2 pb-2">
            <button
              onClick={() => {
                localStorage.setItem("spinflow_sidebar_collapsed", "false");
                window.dispatchEvent(new Event("sidebar-collapse-change"));
              }}
              className="flex items-center justify-center h-9 w-full rounded-lg transition-colors"
              style={{ color: "#93c5fd" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              title="Expand sidebar"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("spinflow_sidebar_collapsed") === "true");

  useEffect(() => {
    const handler = () => {
      setCollapsed(localStorage.getItem("spinflow_sidebar_collapsed") === "true");
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  return (
    <>
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen flex flex-col overflow-hidden z-30 transition-all duration-200 ease-in-out hidden lg:flex border-r border-[#1e3a5f]",
          collapsed ? "w-16" : "w-60",
        )}
        style={{ backgroundColor: "#1e3a5f" }}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

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
            style={{ transform: open ? "translateX(0)" : "translateX(-100%)", backgroundColor: "#1e3a5f", color: "#dbeafe" }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-4 p-1 rounded-md"
              style={{ color: "rgba(199,210,254,0.7)" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
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
