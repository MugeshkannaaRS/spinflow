import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { AlertBanner } from "@/components/common/AlertBanner";
import { MobileNav } from "@/components/layout/MobileNav";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (!useAuth.getState().user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <AppShell />
    </SidebarProvider>
  );
}

function AppShell() {
  const { open, close } = useSidebar();
  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={open} onClose={close} />
      <main className="ml-64 min-h-screen overflow-y-auto flex flex-col relative pb-16 lg:pb-0">
        <AlertBanner />
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
