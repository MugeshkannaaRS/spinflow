import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { AlertBanner } from "@/components/common/AlertBanner";
import { MobileNav } from "@/components/layout/MobileNav";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (!useAuth.getState().user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <RedirectOnMustChangePassword />
      <AppShell />
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

function AppShell() {
  const { open, close } = useSidebar();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("spinflow_sidebar_collapsed") === "true"
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
        <AlertBanner />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 p-4 lg:p-6 pb-16 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
