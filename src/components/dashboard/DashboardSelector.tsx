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

const ROLE_DASHBOARD: Record<string, React.ComponentType> = {
  SUPER_ADMIN: SuperAdminDashboard,
  MILL_OWNER: MillOwnerDashboard,
  GENERAL_MANAGER: MillOwnerDashboard,
  PRODUCTION_MANAGER: ProductionDashboard,
  QUALITY_MANAGER: QualityDashboard,
  DISPATCH_MANAGER: DispatchDashboard,
  STORE_MANAGER: StoresDashboard,
  HR_MANAGER: HRDashboard,
  ACCOUNTANT: AccountsDashboard,
  MAINTENANCE_MANAGER: StoresDashboard,
  SUPERVISOR: ProductionDashboard,
  MACHINE_OPERATOR: MillOwnerDashboard,
  SECURITY_GATE: MillOwnerDashboard,
  AUDITOR: MillOwnerDashboard,
};

export function DashboardSelector() {
  const { role } = useRBAC();
  const DashboardComponent = ROLE_DASHBOARD[role] ?? MillOwnerDashboard;
  return <DashboardComponent />;
}
