import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { useRBAC } from "@/hooks/useRBAC";
import { SuperAdminDashboard } from "@/components/dashboard/SuperAdminDashboard";
import {
  HRDashboard,
  ProductionDashboard,
  QualityDashboard,
  AccountsDashboard,
  StoresDashboard,
  DispatchDashboard,
  MillOwnerDashboard,
} from "@/components/dashboard/RoleDashboards";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SpinFlow ERP" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { isSuperAdmin } = useRBAC();
  const user = useAuth((s) => s.user);
  const role = user?.role ?? "MACHINE_OPERATOR";

  if (isSuperAdmin) return <SuperAdminDashboard />;
  if (role === "HR_MANAGER") return <HRDashboard />;
  if (role === "PRODUCTION_MANAGER" || role === "SUPERVISOR") return <ProductionDashboard />;
  if (role === "QUALITY_MANAGER") return <QualityDashboard />;
  if (role === "ACCOUNTANT") return <AccountsDashboard />;
  if (role === "STORE_MANAGER" || role === "MAINTENANCE_MANAGER") return <StoresDashboard />;
  if (role === "DISPATCH_MANAGER") return <DispatchDashboard />;

  return <MillOwnerDashboard />;
}
