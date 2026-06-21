import { createFileRoute, Outlet, redirect, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { AlertBanner } from "@/components/common/AlertBanner";
import { DashboardOnlyGuard } from "@/components/DashboardOnlyGuard";
import { useRBAC, DASHBOARD_ONLY_ROLES } from "@/hooks/useRBAC";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { HelpWidget } from "@/components/help/HelpWidget";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { NudgeBar } from "@/components/nudge/NudgeBar";
import { MillConfigProvider } from "@/contexts/MillConfigContext";

const ALLOWED_DASHBOARD_ONLY_PATHS = ["/dashboard", "/profile", "/login"];

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ location }) => {
    const state = useAuth.getState();
    const user = state.user;
    if (!user) throw redirect({ to: "/login" });

    if (DASHBOARD_ONLY_ROLES.has(user.role)) {
      const path = location.pathname;
      const allowed = ALLOWED_DASHBOARD_ONLY_PATHS.some(
        (p) => path === p || path.startsWith(p + "/"),
      );
      if (!allowed) {
        throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const user = useAuth((s) => s.user);

  if (!user) return null;

  return (
    <SidebarProvider>
      <RedirectOnMustChangePassword />
      <MillConfigProvider>
        <AppShell />
      </MillConfigProvider>
    </SidebarProvider>
  );
}

function RedirectOnMustChangePassword() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (user?.mustChangePassword && router.state.location.pathname !== "/change-password") {
      setShowBanner(true);
      const timer = setTimeout(() => {
        router.navigate({ to: "/change-password" as any });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

  if (!showBanner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md text-center space-y-3">
        <div className="text-lg font-semibold">Password Change Required</div>
        <p className="text-sm text-muted-foreground">
          You must change your password to continue. Redirecting...
        </p>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "100%" }} />
        </div>
      </div>
    </div>
  );
}

function ModuleAccessGuard({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  const { canAccessRoute } = useRBAC();

  if (!user || user.role === "SUPER_ADMIN") return <>{children}</>;

  const bypassPaths = [
    "/dashboard",
    "/profile",
    "/change-password",
    "/login",
    "/company/billing",
    "/onboarding",
    "/import-hub",
    "/help-center",
    "/recommendations",
    "/executive-dashboard",
    "/register",
  ];
  if (bypassPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }

  if (!canAccessRoute(location.pathname)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-12 text-center">
        <div className="size-20 rounded-full bg-[#f1f5f9] flex items-center justify-center mx-auto mb-6">
          <Lock className="size-10 text-[#94a3b8]" />
        </div>
        <h2 className="text-2xl font-semibold text-[#0f172a] mb-3">Module Not Enabled</h2>
        <p className="text-[#64748b] max-w-md mb-2">
          Your subscription does not include this module.
        </p>
        <p className="text-[#94a3b8] text-sm mb-8">
          Contact your SpinFlow vendor to enable access.
        </p>
        <a
          href="/dashboard"
          className="px-4 py-2 bg-[#3b82f6] text-white rounded-md text-sm font-medium hover:bg-[#2563eb]"
        >
          Back to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
}

function AppShell() {
  const { open, close } = useSidebar();
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
    <div className="flex h-screen overflow-hidden bg-[var(--bg-secondary)]">
      <Sidebar open={open} onClose={close} />
      <div
        className={cn(
          "flex flex-col flex-1 overflow-hidden transition-all duration-200 ease-in-out",
          collapsed ? "lg:ml-16" : "lg:ml-60",
        )}
      >
        <Topbar />
        <AlertBanner />
        <NudgeBar />
        <main className="flex-1 overflow-y-auto bg-white lg:bg-gray-50 dark:bg-slate-900 p-4 lg:p-6">
          <DashboardOnlyGuard>
            <ModuleAccessGuard>
              <Outlet />
              <HelpWidget />
              <TourOverlay />
            </ModuleAccessGuard>
          </DashboardOnlyGuard>
        </main>
      </div>
    </div>
  );
}
