import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import { MODULE_ACCESS, ROLE_LABELS, type Module } from "@/lib/rbac";
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
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[]; superAdminOnly?: boolean }> = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { to: "/production", label: "Production", icon: Factory },
      { to: "/quality", label: "Quality", icon: BadgeCheck },
      { to: "/maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/hr", label: "Human Resources", icon: Users },
      { to: "/payroll", label: "Payroll", icon: Banknote },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      { to: "/purchase", label: "Cotton Purchase", icon: Package },
      { to: "/stores", label: "Stores", icon: Warehouse },
      { to: "/inventory", label: "Inventory", icon: Boxes },
      { to: "/dispatch", label: "Dispatch", icon: Truck },
      { to: "/lotrac", label: "LoTrac", icon: QrCode },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/accounts", label: "Accounts", icon: Receipt },
      { to: "/sales", label: "Sales", icon: TrendingUp },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/masters", label: "Masters", icon: Settings2 },
      { to: "/users", label: "Users & Roles", icon: UserCog },
      { to: "/audit", label: "Audit Logs", icon: ClipboardList },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/admin", label: "Admin Panel", icon: Shield },
      { to: "/admin/column-config", label: "Column Config", icon: SlidersHorizontal },
    ],
    superAdminOnly: true,
  },
];

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const filteredGroups = NAV_GROUPS.filter((group) => {
    if (group.superAdminOnly && user.role !== "SUPER_ADMIN") return false;
    return group.items.some((item) => {
      const module = item.to.replace("/", "") as Module;
      const allowedByRole = MODULE_ACCESS[user?.role] ?? ["dashboard"];
      const allowedByCompany = user?.allowedModules ?? allowedByRole;
      return allowedByRole.includes(module) && allowedByCompany.includes(module);
    });
  });

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#1e1b4b", color: "#c7d2fe" }}>
      <div className="flex-shrink-0 border-b border-indigo-800/50">
        <div className="px-4 py-5">
          {collapsed ? (
            <div className="size-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(99,102,241,0.2)" }}>
              <span style={{ color: "#6366f1", fontWeight: 700, fontSize: "1.125rem" }}>SF</span>
            </div>
          ) : (
            <div className="text-left">
              <div className="text-white font-bold text-lg tracking-tight">SpinFlow</div>
              <div className="text-indigo-400 text-[11px] mt-0.5">Your mill. In your hands.</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-1 scrollbar-thin">
        {filteredGroups.map((group) => (
          <div key={group.label + (group.superAdminOnly ? "-sa" : "")}>
            {!collapsed && (
              <div className="px-4 mb-1 mt-4 first:mt-0">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70">
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
                      ? "text-white bg-indigo-500/25 border-l-[3px] border-indigo-400 font-medium"
                      : "text-indigo-200 hover:text-white hover:bg-indigo-500/20",
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active ? "text-indigo-300" : "text-indigo-400/70")} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
              if (collapsed) {
                return (
                  <TooltipProvider key={item.to}>
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" style={{ backgroundColor: "#1e1b4b", color: "#ffffff", border: "1px solid #4338ca" }}>
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

      <div className="mt-auto flex-shrink-0 border-t border-indigo-800/50">
        {!collapsed && (
          <div className="px-4 py-3">
            <div className="text-xs font-medium truncate text-indigo-300">{user.millName}</div>
            <div className="text-indigo-500 text-[11px]">{ROLE_LABELS[user.role]}</div>
          </div>
        )}

        <div className="flex items-center px-3 py-2 gap-1">
          <button
            onClick={toggle}
            className={cn(
              "flex items-center justify-center h-9 rounded-lg transition-colors",
              collapsed ? "w-full" : "w-9",
            )}
            style={{ color: "#818cf8" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(99,102,241,0.1)"; }}
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
            style={{ color: "#818cf8" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#818cf8"; }}
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
              style={{ color: "#818cf8" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(99,102,241,0.1)"; }}
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
              style={{ color: "#818cf8" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(99,102,241,0.1)"; }}
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
          "fixed top-0 left-0 h-screen flex flex-col overflow-hidden z-30 transition-all duration-200 ease-in-out hidden lg:flex border-r border-[#2d2b6b]",
          collapsed ? "w-16" : "w-60",
        )}
        style={{ backgroundColor: "#1e1b4b" }}
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
            style={{ transform: open ? "translateX(0)" : "translateX(-100%)", backgroundColor: "#1e1b4b", color: "#c7d2fe" }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-4 p-1 rounded-md"
              style={{ color: "rgba(199,210,254,0.7)" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(99,102,241,0.1)"; }}
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
