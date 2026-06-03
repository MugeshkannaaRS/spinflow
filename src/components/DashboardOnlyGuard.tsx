import { useRouter, Link } from "@tanstack/react-router";
import { useRBAC } from "@/hooks/useRBAC";
import { LayoutDashboard } from "lucide-react";

const DASHBOARD_PATH = "/dashboard";

export function DashboardOnlyGuard({ children }: { children: React.ReactNode }) {
  const { isDashboardOnly } = useRBAC();
  const router = useRouter();
  const pathname = router.state.location.pathname;

  if (!isDashboardOnly()) {
    return <>{children}</>;
  }

  if (pathname === DASHBOARD_PATH) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
      <LayoutDashboard className="size-12 text-muted-foreground/60" />
      <p className="text-lg font-semibold">Dashboard Only</p>
      <p className="text-sm text-center max-w-md text-muted-foreground/80">
        Your role only has access to the Dashboard.
      </p>
      <Link
        to={DASHBOARD_PATH}
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <LayoutDashboard className="size-4" />
        Go to Dashboard
      </Link>
    </div>
  );
}
