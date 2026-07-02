import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, productionApi, inventoryApi, adminApi } from "@/lib/api-service";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import type { MachineGroup } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRBAC } from "@/hooks/useRBAC";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { MillCalendarManager } from "@/components/maintenance/MillCalendarManager";
import { DeptMapManager } from "@/components/maintenance/DeptMapManager";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Settings,
  Blocks,
  ArrowDown,
  Pencil,
  Factory,
  Trash2,
  Users,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useMillMasterCategory, useMillMasters } from "@/hooks/useMillConfig";
import { DirectImportModal } from "@/components/ui/DirectImportModal";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomFieldsManager } from "@/components/ui/CustomFieldsManager";
import type {
  Company,
  Mill,
  Department,
  YarnCount,
  Customer,
  MasterVehicle,
  Route as MasterRoute,
  Shift,
  Warehouse,
  ListResponse,
} from "@/lib/types";

const DEPARTMENT_TYPES = [
  "blowroom",
  "carding",
  "drawing",
  "simplex",
  "ring_frame",
  "winding",
  "quality",
  "stores",
  "dispatch",
  "hr",
  "accounts",
  "maintenance",
  "admin",
] as const;

const VEHICLE_TYPES = ["truck", "mini_truck", "lorry", "tempo", "other"] as const;

// Machine sections — physical mill sections (NOT HR departments)
const MACHINE_SECTIONS = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Autoconer / Winding",
  "A/C Plant",
  "Buffing Room",
  "Civil / General",
] as const;

export const Route = createFileRoute("/_app/masters")({
  head: () => ({ meta: [{ title: "Masters — SpinFlow ERP" }] }),
  component: MastersPage,
});

function MastersPage() {
  const user = useAuth((s) => s.user);
  const { canAccess } = useRBAC();
  const canEdit = canAccess("masters", true);
  const deptColConfig = useColumnConfig("masters_departments");
  const custColConfig = useColumnConfig("masters_customers");
  const vehColConfig = useColumnConfig("masters_vehicles");
  const shiftColConfig = useColumnConfig("masters_shifts");
  const yarnColConfig = useColumnConfig("masters_yarn_counts");
  const machineColConfig = useColumnConfig("masters_machines");
  const [tab, setTab] = useState(user?.role === "SUPER_ADMIN" ? "companies" : "mills");
  const [search, setSearch] = useState("");
  const [modulesCompany, setModulesCompany] = useState<Company | null>(null);
  const [settingsMill, setSettingsMill] = useState<Mill | null>(null);
  const qcMasters = useQueryClient();

  function deactivateCustomer(id: string) {
    mastersApi
      .deactivateCustomer(id)
      .then(() => {
        toast.success("Customer deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
      })
      .catch(() => toast.error("Failed to deactivate customer"));
  }

  function deactivateDepartment(id: string) {
    mastersApi
      .deleteDepartment(id)
      .then(() => {
        toast.success("Department deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
        qcMasters.invalidateQueries({ queryKey: ["maintenance"] });
      })
      .catch(() => toast.error("Failed to deactivate department"));
  }

  function deactivateYarnCount(id: string) {
    mastersApi
      .deleteYarnCount(id)
      .then(() => {
        toast.success("Yarn count deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
      })
      .catch(() => toast.error("Failed to deactivate yarn count"));
  }

  function deactivateVehicle(id: string) {
    mastersApi
      .deleteVehicle(id)
      .then(() => {
        toast.success("Vehicle deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
      })
      .catch(() => toast.error("Failed to deactivate vehicle"));
  }

  function deactivateRoute(id: string) {
    mastersApi
      .deleteRoute(id)
      .then(() => {
        toast.success("Route deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
      })
      .catch(() => toast.error("Failed to deactivate route"));
  }

  function deactivateWarehouse(id: string) {
    inventoryApi
      .deleteWarehouse(id)
      .then(() => {
        toast.success("Warehouse deactivated");
        qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
      })
      .catch(() => toast.error("Failed to deactivate warehouse"));
  }

  async function deleteDepartment(id: string) {
    await mastersApi.deleteDepartment(id);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
    qcMasters.invalidateQueries({ queryKey: ["maintenance"] });
  }
  async function deleteYarnCount(id: string) {
    await mastersApi.deleteYarnCount(id);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
  }
  async function deleteCustomer(id: string) {
    await api.delete(`/masters/customers/${id}`);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
  }
  async function deleteVehicle(id: string) {
    await mastersApi.deleteVehicle(id);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
  }
  async function deleteRoute(id: string) {
    await mastersApi.deleteRoute(id);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
  }
  async function deleteWarehouse(id: string) {
    await inventoryApi.deleteWarehouse(id);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
  }
  async function deleteShift(id: string) {
    await api.delete(`/production/shifts/${id}`);
    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
    qcMasters.invalidateQueries({ queryKey: ["mill-masters"] });
  }

  // ── Single bulk fetch — replaces 10 individual API calls ────────────────────
  const allMastersQ = useQuery({
    queryKey: ["masters", "all"],
    queryFn: () => api.get("/masters/all").then((r) => r.data),
    staleTime: 5 * 60_000,   // 5 min — masters rarely change mid-session
    gcTime: 15 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const _all = allMastersQ.data ?? {};

  const companiesData = (_all.companies ?? []) as Company[];
  const activeCompaniesData = useMemo(
    () => companiesData.filter((c: any) => c?.id && c.is_active !== false),
    [companiesData],
  );
  const millsData    = (_all.mills        ?? []) as Mill[];
  const deptsData    = (_all.departments  ?? []) as Department[];
  const yarnData     = (_all.yarn_counts  ?? []) as YarnCount[];
  const custData     = (_all.customers    ?? []) as Customer[];
  const vehData      = (_all.vehicles     ?? []) as MasterVehicle[];
  const routeData    = (_all.routes       ?? []) as MasterRoute[];
  const shiftsData   = (_all.shifts       ?? []) as any[];
  const warehousesData = (_all.warehouses ?? []) as any[];
  const machinesData = (_all.machines     ?? []) as any[];

  if (!user)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

  // SUPER_ADMIN should not land on Masters — redirect to Admin
  if (user.role === "SUPER_ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="Manage companies, mills, departments & reference data"
        onRefresh={() => qcMasters.invalidateQueries({ queryKey: ["masters", "all"] })}
        isRefreshing={allMastersQ.isFetching}
      />
      <AccessGuard module="masters">
        <div className="p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or code..."
              className="pl-10 max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              {(() => {
                const allTabs = [
                  { key: "companies", label: "Companies" },
                  { key: "mills", label: "Mills" },
                  { key: "machines", label: "Machines" },
                  { key: "machine-groups", label: "Machine Groups" },
                  { key: "departments", label: "Departments" },
                  { key: "yarn-counts", label: "Yarn Counts" },
                  { key: "customers", label: "Customers" },
                  { key: "vehicles", label: "Vehicles" },
                  { key: "routes", label: "Routes" },
                  { key: "shifts", label: "Shifts" },
                  { key: "warehouses", label: "Warehouses" },
                  { key: "stop-codes", label: "Stop Codes" },
                  { key: "calendar", label: "Calendar & Mapping" },
                  { key: "custom-fields", label: "Custom Fields" },
                ];
                const isSuperAdmin = false;
                return allTabs
                  .filter((t) =>
                    isSuperAdmin ? ["companies", "mills"].includes(t.key) : t.key !== "companies",
                  )
                  .map((t) => (
                    <TabsTrigger key={t.key} value={t.key}>
                      {t.label}
                    </TabsTrigger>
                  ));
              })()}
            </TabsList>

            <TabsContent value="companies">
              <ErrorBoundary inline label="Companies">
                <MasterTable
                  title="Companies"
                  data={companiesData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "name", label: "Name" },
                    { key: "gstin", label: "GSTIN" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<CompanyForm />}
                  onEdit={(item) => <CompanyForm item={item} />}
                  extraActions={(item) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModulesCompany(item as Company)}
                    >
                      <Blocks className="size-3.5 mr-1" /> Modules
                    </Button>
                  )}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="mills">
              <ErrorBoundary inline label="Mills">
                <MasterTable
                  title="Mills"
                  data={millsData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "name", label: "Name" },
                    { key: "city", label: "City" },
                    { key: "state", label: "State" },
                    { key: "phone", label: "Phone" },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit && user?.role !== "MILL_OWNER" /* CATEGORY B: deliberate MILL_OWNER exclusion for mill editing — platform operation, not module override. */}
                  onAdd={
                    user?.role !== "MILL_OWNER" ? (
                      <MillForm companies={activeCompaniesData} />
                    ) : (
                      <></>
                    )
                  }
                  onEdit={(item) => <MillForm item={item} companies={activeCompaniesData} />}
                  headerExtra={
                    user?.role === "MILL_OWNER" ? (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                        <span>Need another mill?</span>
                        <Link
                          to="/company/billing"
                          className="font-semibold text-amber-800 hover:text-amber-900 underline"
                        >
                          Upgrade plan
                        </Link>
                      </div>
                    ) : undefined
                  }
                  extraActions={(item) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSettingsMill(item as Mill)}
                    >
                      <Settings className="size-3.5 mr-1" /> Settings
                    </Button>
                  )}
                />
              </ErrorBoundary>
            </TabsContent>

            {/* ── Machines ─────────────────────────────────────────────────── */}
            <TabsContent value="machines">
              <ErrorBoundary inline label="Machines">
                <MachinesTab
                  machines={machinesData.filter((x: any) => matchesSearch(x, search))}
                  isLoading={allMastersQ.isLoading}
                  colConfig={machineColConfig}
                  canEdit={canEdit}
                  onImportSuccess={() =>
                    qcMasters.invalidateQueries({ queryKey: ["masters", "all"] })
                  }
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="machine-groups">
              <ErrorBoundary inline label="Machine Groups">
                <MachineGroupsTab allMachines={machinesData} canEdit={canEdit} search={search} />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="departments">
              <ErrorBoundary inline label="Departments">
                <MasterTable
                  title="Departments"
                  data={deptsData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: deptColConfig.getLabel("code") },
                    { key: "name", label: deptColConfig.getLabel("name") },
                    { key: "department_type", label: deptColConfig.getLabel("department_type") },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<DepartmentForm mills={millsData} />}
                  onEdit={(item) => <DepartmentForm item={item} mills={millsData} />}
                  onDelete={canEdit ? deleteDepartment : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="yarn-counts">
              <ErrorBoundary inline label="Yarn Counts">
                <MasterTable
                  title="Yarn Counts"
                  data={yarnData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "count", label: yarnColConfig.getLabel("count") },
                    { key: "count_value", label: yarnColConfig.getLabel("count_value") },
                    { key: "blend", label: yarnColConfig.getLabel("blend") },
                    { key: "standard_csp", label: yarnColConfig.getLabel("standard_csp") },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<YarnCountForm mills={millsData} />}
                  onEdit={(item) => <YarnCountForm item={item} mills={millsData} />}
                  onDelete={canEdit ? deleteYarnCount : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="customers">
              <ErrorBoundary inline label="Customers">
                <MasterTable
                  title="Customers"
                  data={custData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: custColConfig.getLabel("code") },
                    { key: "name", label: custColConfig.getLabel("name") },
                    { key: "city", label: custColConfig.getLabel("city") },
                    { key: "phone", label: custColConfig.getLabel("phone") },
                    { key: "credit_limit", label: custColConfig.getLabel("credit_limit") },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<CustomerForm mills={millsData} />}
                  onEdit={(item) => <CustomerForm item={item} mills={millsData} />}
                  onDelete={canEdit ? deleteCustomer : undefined}
                  headerExtra={canEdit ? <ImportCustomersDialog /> : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="vehicles">
              <ErrorBoundary inline label="Vehicles">
                <MasterTable
                  title="Vehicles"
                  data={vehData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "vehicle_no", label: vehColConfig.getLabel("vehicle_no") },
                    { key: "vehicle_type", label: vehColConfig.getLabel("vehicle_type") },
                    { key: "capacity_kg", label: vehColConfig.getLabel("capacity_kg") },
                    { key: "driver_name", label: vehColConfig.getLabel("driver_name") },
                    { key: "driver_phone", label: vehColConfig.getLabel("driver_phone") },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<VehicleForm mills={millsData} />}
                  onEdit={(item) => <VehicleForm item={item} mills={millsData} />}
                  onDelete={canEdit ? deleteVehicle : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="routes">
              <ErrorBoundary inline label="Routes">
                <MasterTable
                  title="Routes"
                  data={routeData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "name", label: "Name" },
                    { key: "origin", label: "Origin" },
                    { key: "destination", label: "Destination" },
                    { key: "distance_km", label: "Distance (km)" },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<RouteForm mills={millsData} />}
                  onEdit={(item) => <RouteForm item={item} mills={millsData} />}
                  onDelete={canEdit ? deleteRoute : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="shifts">
              <ErrorBoundary inline label="Shifts">
                <MasterTable
                  title="Shifts"
                  data={shiftsData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: shiftColConfig.getLabel("code") },
                    { key: "name", label: shiftColConfig.getLabel("name") },
                    { key: "start_time", label: shiftColConfig.getLabel("start_time") },
                    { key: "end_time", label: shiftColConfig.getLabel("end_time") },
                  ]}
                  noStatus
                  canEdit={canEdit}
                  onAdd={<ShiftForm />}
                  onEdit={(item) => <ShiftForm item={item} />}
                  onDelete={canEdit ? deleteShift : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="warehouses">
              <ErrorBoundary inline label="Warehouses">
                <MasterTable
                  title="Warehouses"
                  data={warehousesData.filter((x) => matchesSearch(x, search))}
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "name", label: "Name" },
                    { key: "location", label: "Location" },
                    { key: "capacity_bags", label: "Capacity (bags)" },
                  ]}
                  activeKey="is_active"
                  canEdit={canEdit}
                  onAdd={<WarehouseForm />}
                  onEdit={(item) => <WarehouseForm item={item} />}
                  onDelete={canEdit ? deleteWarehouse : undefined}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="stop-codes">
              <ErrorBoundary inline label="Stop Codes">
                <StopCodesTab canEdit={canEdit} search={search} />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="calendar">
              <ErrorBoundary inline label="Calendar">
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3">
                      <h3 className="text-base font-semibold">Mill Calendar</h3>
                      <p className="text-sm text-muted-foreground">
                        Set holidays, half-days, leave and the weekly off for this mill. Used across modules (e.g. PM Day Plan capacity).
                      </p>
                    </div>
                    <MillCalendarManager />
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3">
                      <h3 className="text-base font-semibold">Department → Machine Mapping</h3>
                      <p className="text-sm text-muted-foreground">
                        Link PM-schedule departments to the real Machines-master departments so the Day Plan shows actual machine numbers (e.g. Autoconer → Finishing).
                      </p>
                    </div>
                    <DeptMapManager />
                  </div>
                </div>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="custom-fields">
              <ErrorBoundary inline label="Custom Fields">
                <CustomFieldsManager />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </div>

        <Sheet
          open={!!modulesCompany}
          onOpenChange={(o) => {
            if (!o) setModulesCompany(null);
          }}
        >
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Modules — {modulesCompany?.name}</SheetTitle>
            </SheetHeader>
            {modulesCompany && (
              <CompanyModulesPanel
                companyId={modulesCompany.id}
                onClose={() => {
                  setModulesCompany(null);
                  qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
                }}
              />
            )}
          </SheetContent>
        </Sheet>

        <Sheet
          open={!!settingsMill}
          onOpenChange={(o) => {
            if (!o) setSettingsMill(null);
          }}
        >
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Mill Settings — {settingsMill?.name}</SheetTitle>
            </SheetHeader>
            {settingsMill && (
              <MillSettingsPanel
                millId={settingsMill.id}
                onClose={() => {
                  setSettingsMill(null);
                  qcMasters.invalidateQueries({ queryKey: ["masters", "all"] });
                }}
              />
            )}
          </SheetContent>
        </Sheet>
      </AccessGuard>
    </>
  );
}

function matchesSearch(item: any, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return Object.values(item).some((v) =>
    String(v ?? "")
      .toLowerCase()
      .includes(q),
  );
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function MasterTable<T = any>({
  title,
  data,
  columns,
  activeKey,
  noStatus,
  canEdit,
  onAdd,
  onEdit,
  onDeactivate,
  onDelete,
  extraActions,
  headerExtra,
}: {
  title: string;
  data: T[];
  columns: { key: string; label: string }[];
  activeKey?: string;
  noStatus?: boolean;
  canEdit: boolean;
  onAdd: React.ReactElement;
  onEdit: (item: T) => React.ReactElement;
  onDeactivate?: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
  extraActions?: (item: T) => React.ReactElement;
  headerExtra?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<T | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<string | null>(null);
  const tableId = `masters_${title.toLowerCase().replace(/\s+/g, "_")}`;

  const colDefs: ColDef<T>[] = [
    ...columns.map(
      (col) =>
        ({
          key: col.key,
          label: col.label,
          render: (item: T) => <span>{formatValue((item as any)[col.key])}</span>,
        }) as ColDef<T>,
    ),
    ...(!noStatus
      ? [
          {
            key: "_status",
            label: "Status",
            filterable: false,
            render: (item: T) => {
              const row = item as any;
              if (activeKey === "current_status")
                return (
                  <Badge
                    variant={
                      row[activeKey] === "running"
                        ? "default"
                        : row[activeKey] === "idle"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {String(row[activeKey] ?? "unknown")}
                  </Badge>
                );
              if (activeKey)
                return (
                  <Badge variant={row[activeKey] ? "default" : "secondary"}>
                    {row[activeKey] ? "Active" : "Inactive"}
                  </Badge>
                );
              return <span className="text-muted-foreground">-</span>;
            },
          } as ColDef<T>,
        ]
      : []),
  ];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {title} ({data.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4 mr-1" /> Add {singularize(title)}
              </Button>
            )}
            {headerExtra}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            tableId={tableId}
            columns={colDefs}
            data={data}
            loading={false}
            rowKey={(item: any) => String(item.id ?? "")}
            exportFilename={title.toLowerCase().replace(/\s+/g, "_")}
            actions={
              canEdit || extraActions
                ? (item: T) => {
                    const row = item as any;
                    const id = String(row.id ?? "");
                    return (
                      <div className="flex items-center gap-1">
                        {/* Edit — compact icon button, opens sheet */}
                        {canEdit && (
                          <button
                            title="Edit"
                            onClick={() => setEditItem(item)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        {extraActions?.(item)}
                        {/* Hard delete — ConfirmDeleteButton */}
                        {canEdit && onDelete && (
                          <ConfirmDeleteButton
                            onConfirm={() => onDelete(id)}
                            label={`Delete this ${singularize(title).toLowerCase()}?`}
                            title={`Delete ${singularize(title)}?`}
                            confirmText="Delete"
                            successMessage={`${singularize(title)} deleted`}
                          />
                        )}
                        {/* Deactivate — confirm then call (only when no hard delete) */}
                        {canEdit && onDeactivate && !onDelete && (
                          <button
                            title={
                              row[activeKey ?? "is_active"] ? "Deactivate" : "Already inactive"
                            }
                            disabled={!row[activeKey ?? "is_active"]}
                            onClick={() => setDeactivateConfirm(id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editItem}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {singularize(title)}</DialogTitle>
          </DialogHeader>
          <div className="mt-2">{editItem ? onEdit(editItem) : null}</div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          if (!o) setAdding(false);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {singularize(title)}</DialogTitle>
          </DialogHeader>
          <div className="mt-2">{onAdd}</div>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      {deactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="size-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Deactivate {singularize(title)}?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This marks it as inactive. It won't appear in active lists but data is preserved.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeactivateConfirm(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onDeactivate!(deactivateConfirm);
                  setDeactivateConfirm(null);
                }}
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// ── Company Modules Panel ────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  production: "Production",
  quality: "Quality",
  stock: "Stock",
  inventory: "Inventory",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  accounts: "Accounts",
  maintenance: "Maintenance",
  payroll: "Payroll",
  users: "Users",
  audit: "Audit",
  reports: "Reports",
  masters: "Masters",
  sales: "Sales",
  lotrac: "LoTrac",
};
const ALL_MODULES = Object.keys(MODULE_LABELS);

function CompanyModulesPanel({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const modulesQ = useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => adminApi.getCompanyModules(companyId),
    staleTime: 60_000,
  });
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (modulesQ.data && !initialized) {
      setModules(modulesQ.data);
      setInitialized(true);
    }
  }, [modulesQ.data, initialized]);

  const updateM = useMutation({
    mutationFn: () => adminApi.updateCompanyModules(companyId, modules),
    onSuccess: () => {
      toast.success("Modules updated");
      qc.invalidateQueries({ queryKey: ["company-modules", companyId] });
      onClose();
    },
    onError: () => toast.error("Failed to update modules"),
  });

  return (
    <div className="mt-4 space-y-4">
      {ALL_MODULES.map((mod) => (
        <div key={mod} className="flex items-center justify-between py-2 border-b last:border-0">
          <Label className={cn(mod === "dashboard" && "text-muted-foreground")}>
            {MODULE_LABELS[mod]}
          </Label>
          <Switch
            checked={modules[mod] ?? false}
            disabled={mod === "dashboard" || updateM.isPending}
            onCheckedChange={(v) => setModules((prev) => ({ ...prev, [mod]: v }))}
          />
        </div>
      ))}
      <DialogFooter>
        <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
          {updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Mill Settings Panel ──────────────────────────────────

function MillSettingsPanel({ millId, onClose }: { millId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["mill-settings", millId],
    queryFn: () => adminApi.getMillSettings(millId),
    staleTime: 60_000,
  });
  const [form, setForm] = useState({
    working_hours_per_day: 8,
    shifts_per_day: 3,
    production_target_kg: 0,
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (settingsQ.data && !initialized) {
      setForm((prev) => ({ ...prev, ...settingsQ.data }));
      setInitialized(true);
    }
  }, [settingsQ.data, initialized]);

  const updateM = useMutation({
    mutationFn: () => adminApi.updateMillSettings(millId, form),
    onSuccess: () => {
      toast.success("Mill settings updated");
      qc.invalidateQueries({ queryKey: ["mill-settings", millId] });
      onClose();
    },
    onError: () => toast.error("Failed to update mill settings"),
  });

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Working Hours / Day</Label>
        <Input
          type="number"
          value={form.working_hours_per_day}
          onChange={(e) =>
            setForm({ ...form, working_hours_per_day: parseInt(e.target.value) || 0 })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>Shifts / Day</Label>
        <Input
          type="number"
          value={form.shifts_per_day}
          onChange={(e) => setForm({ ...form, shifts_per_day: parseInt(e.target.value) || 0 })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Production Target (kg)</Label>
        <Input
          type="number"
          step="any"
          value={form.production_target_kg}
          onChange={(e) =>
            setForm({ ...form, production_target_kg: parseFloat(e.target.value) || 0 })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INR">INR (₹)</SelectItem>
            <SelectItem value="USD">USD ($)</SelectItem>
            <SelectItem value="EUR">EUR (€)</SelectItem>
            <SelectItem value="GBP">GBP (£)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Timezone</Label>
        <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
            <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
            <SelectItem value="UTC">UTC</SelectItem>
            <SelectItem value="America/New_York">America/New_York</SelectItem>
            <SelectItem value="Europe/London">Europe/London</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
          {updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Form Components ──────────────────────────────────────

function CompanyForm({ item }: { item?: Company }) {
  const qc = useQueryClient();
  const requiredFields = ["code", "name"];
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    gstin: item?.gstin ?? "",
    address: item?.address ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => form[f as keyof typeof form] !== "");
  const err = (f: string) =>
    touched[f] && !form[f as keyof typeof form] ? "This field is required" : undefined;

  const createM = useMutation({
    mutationFn: () => mastersApi.createCompany(form),
    onSuccess: () => {
      toast.success("Company created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateCompany(item!.id, form),
    onSuccess: () => {
      toast.success("Company updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>GSTIN</Label>
        <Input
          value={form.gstin}
          onChange={(e) => setForm({ ...form, gstin: e.target.value })}
          placeholder="15 alphanumeric chars"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MillForm({ item, companies }: { item?: Mill; companies: Company[] }) {
  const qc = useQueryClient();
  const requiredFields = ["company_id", "code", "name"];
  const [form, setForm] = useState({
    company_id: item?.company_id ?? "",
    code: item?.code ?? "",
    name: item?.name ?? "",
    address: item?.address ?? "",
    city: item?.city ?? "",
    state: item?.state ?? "",
    pincode: item?.pincode ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => form[f as keyof typeof form] !== "");
  const err = (f: string) =>
    touched[f] && !form[f as keyof typeof form] ? "This field is required" : undefined;

  const createM = useMutation({
    mutationFn: () => mastersApi.createMill(form),
    onSuccess: () => {
      toast.success("Mill created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateMill(item!.id, form),
    onSuccess: () => {
      toast.success("Mill updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("company_id") && "text-destructive")}>
          Company <span className="text-destructive">*</span>
        </Label>
        <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
          <SelectTrigger className={cn(err("company_id") && "border-destructive")}>
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent>
            {companies
              .filter((c) => c?.id)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {err("company_id") && <p className="text-xs text-destructive">{err("company_id")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pincode</Label>
          <Input
            value={form.pincode}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DepartmentForm({ item }: { item?: Department; mills: Mill[] }) {
  const qc = useQueryClient();
  const { activeMill } = useActiveMill();
  const { user } = useAuth();
  const currentMillId = activeMill?.id ?? user?.millId ?? "";
  const requiredFields = ["code", "name", "department_type"];
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? currentMillId,
    code: item?.code ?? "",
    name: item?.name ?? "",
    department_type: item?.department_type ?? "ring_frame",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => form[f as keyof typeof form] !== "");
  const err = (f: string) =>
    touched[f] && !form[f as keyof typeof form] ? "This field is required" : undefined;

  const createM = useMutation({
    mutationFn: () => mastersApi.createDepartment(form),
    onSuccess: () => {
      toast.success("Department created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
      // Departments feed maintenance schedules, manpower, day-plan & dept-map dropdowns
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateDepartment(item!.id, form),
    onSuccess: () => {
      toast.success("Department updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
      // Departments feed maintenance schedules, manpower, day-plan & dept-map dropdowns
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("department_type") && "text-destructive")}>
          Department Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.department_type}
          onValueChange={(v) => setForm({ ...form, department_type: v })}
        >
          <SelectTrigger className={cn(err("department_type") && "border-destructive")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {err("department_type") && (
          <p className="text-xs text-destructive">{err("department_type")}</p>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function YarnCountForm({ item }: { item?: YarnCount; mills: Mill[] }) {
  const qc = useQueryClient();
  const { activeMill } = useActiveMill();
  const { user } = useAuth();
  const currentMillId = activeMill?.id ?? user?.millId ?? "";
  const requiredFields = ["count", "count_value"];
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? currentMillId,
    count: item?.count ?? "",
    count_value: item?.count_value ?? 0,
    blend: item?.blend ?? "",
    twist_per_meter: item?.twist_per_meter ?? undefined,
    standard_csp: item?.standard_csp ?? undefined,
    standard_u_percent: item?.standard_u_percent ?? undefined,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => mastersApi.createYarnCount(form),
    onSuccess: () => {
      toast.success("Yarn count created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateYarnCount(item!.id, form),
    onSuccess: () => {
      toast.success("Yarn count updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("count") && "text-destructive")}>
          Count <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.count}
          onChange={(e) => setForm({ ...form, count: e.target.value })}
          placeholder="40s"
          className={cn(err("count") && "border-destructive")}
        />
        {err("count") && <p className="text-xs text-destructive">{err("count")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("count_value") && "text-destructive")}>
          Count Value <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          step="any"
          value={form.count_value}
          onChange={(e) => setForm({ ...form, count_value: parseFloat(e.target.value) })}
          className={cn(err("count_value") && "border-destructive")}
        />
        {err("count_value") && <p className="text-xs text-destructive">{err("count_value")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Blend</Label>
        <Input
          value={form.blend}
          onChange={(e) => setForm({ ...form, blend: e.target.value })}
          placeholder="100% Cotton"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Twist/m</Label>
          <Input
            type="number"
            step="any"
            value={form.twist_per_meter ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                twist_per_meter: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Std CSP</Label>
          <Input
            type="number"
            step="any"
            value={form.standard_csp ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                standard_csp: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Std U%</Label>
          <Input
            type="number"
            step="any"
            value={form.standard_u_percent ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                standard_u_percent: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CustomerForm({ item }: { item?: Customer; mills: Mill[] }) {
  const qc = useQueryClient();
  const { activeMill } = useActiveMill();
  const { user } = useAuth();
  const currentMillId = activeMill?.id ?? user?.millId ?? "";
  const requiredFields = ["code", "name"];
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? currentMillId,
    code: item?.code ?? "",
    name: item?.name ?? "",
    gstin: item?.gstin ?? "",
    pan: item?.pan ?? "",
    billing_address: item?.billing_address ?? "",
    shipping_address: item?.shipping_address ?? "",
    city: item?.city ?? "",
    state: item?.state ?? "",
    pincode: item?.pincode ?? "",
    contact_person: item?.contact_person ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
    credit_limit: item?.credit_limit ?? 0,
    payment_terms_days: item?.payment_terms_days ?? 30,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => mastersApi.createCustomer(form),
    onSuccess: () => {
      toast.success("Customer created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateCustomer(item!.id, form),
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>GSTIN</Label>
          <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>PAN</Label>
          <Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Billing Address</Label>
        <Input
          value={form.billing_address}
          onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Shipping Address</Label>
        <Input
          value={form.shipping_address}
          onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Pincode</Label>
          <Input
            value={form.pincode}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Contact Person</Label>
        <Input
          value={form.contact_person}
          onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Credit Limit</Label>
          <Input
            type="number"
            step="any"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: parseFloat(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Payment Terms (days)</Label>
          <Input
            type="number"
            value={form.payment_terms_days}
            onChange={(e) => setForm({ ...form, payment_terms_days: parseInt(e.target.value) })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function VehicleForm({ item }: { item?: MasterVehicle; mills: Mill[] }) {
  const qc = useQueryClient();
  const { activeMill } = useActiveMill();
  const { user } = useAuth();
  const currentMillId = activeMill?.id ?? user?.millId ?? "";
  const requiredFields = ["vehicle_no", "vehicle_type"];
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? currentMillId,
    vehicle_no: item?.vehicle_no ?? "",
    vehicle_type: item?.vehicle_type ?? "truck",
    make: item?.make ?? "",
    model: item?.model ?? "",
    capacity_kg: item?.capacity_kg ?? undefined,
    driver_name: item?.driver_name ?? "",
    driver_phone: item?.driver_phone ?? "",
    driver_license: item?.driver_license ?? "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => mastersApi.createVehicle(form),
    onSuccess: () => {
      toast.success("Vehicle created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateVehicle(item!.id, form),
    onSuccess: () => {
      toast.success("Vehicle updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("vehicle_no") && "text-destructive")}>
          Vehicle No <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.vehicle_no}
          onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })}
          placeholder="TN 11 AB 1234"
          className={cn(err("vehicle_no") && "border-destructive")}
        />
        {err("vehicle_no") && <p className="text-xs text-destructive">{err("vehicle_no")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("vehicle_type") && "text-destructive")}>
          Vehicle Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.vehicle_type}
          onValueChange={(v) => setForm({ ...form, vehicle_type: v })}
        >
          <SelectTrigger className={cn(err("vehicle_type") && "border-destructive")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VEHICLE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {err("vehicle_type") && <p className="text-xs text-destructive">{err("vehicle_type")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Make</Label>
          <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Capacity (kg)</Label>
        <Input
          type="number"
          step="any"
          value={form.capacity_kg ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              capacity_kg: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>Driver Name</Label>
        <Input
          value={form.driver_name}
          onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Driver Phone</Label>
          <Input
            value={form.driver_phone}
            onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>License No</Label>
          <Input
            value={form.driver_license}
            onChange={(e) => setForm({ ...form, driver_license: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RouteForm({ item }: { item?: MasterRoute; mills: Mill[] }) {
  const qc = useQueryClient();
  const { activeMill } = useActiveMill();
  const { user } = useAuth();
  const currentMillId = activeMill?.id ?? user?.millId ?? "";
  const requiredFields = ["code", "name", "origin", "destination"];
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? currentMillId,
    code: item?.code ?? "",
    name: item?.name ?? "",
    origin: item?.origin ?? "",
    destination: item?.destination ?? "",
    distance_km: item?.distance_km ?? undefined,
    estimated_hours: item?.estimated_hours ?? undefined,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => mastersApi.createRoute(form),
    onSuccess: () => {
      toast.success("Route created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateRoute(item!.id, form),
    onSuccess: () => {
      toast.success("Route updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={cn(err("origin") && "text-destructive")}>
            Origin <span className="text-destructive">*</span>
          </Label>
          <Input
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
            className={cn(err("origin") && "border-destructive")}
          />
          {err("origin") && <p className="text-xs text-destructive">{err("origin")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className={cn(err("destination") && "text-destructive")}>
            Destination <span className="text-destructive">*</span>
          </Label>
          <Input
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            className={cn(err("destination") && "border-destructive")}
          />
          {err("destination") && <p className="text-xs text-destructive">{err("destination")}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Distance (km)</Label>
          <Input
            type="number"
            step="any"
            value={form.distance_km ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                distance_km: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Est. Hours</Label>
          <Input
            type="number"
            step="any"
            value={form.estimated_hours ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                estimated_hours: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ImportCustomersDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDown className="size-4 mr-1" />
        Import Excel
      </Button>
      <DirectImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="masters_customers"
        endpoint="/masters/customers/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["masters", "all"] })}
        title="Import Customers"
      />
    </>
  );
}

function ShiftForm({ item, mills }: { item?: Shift; mills?: Mill[] }) {
  const qc = useQueryClient();
  const requiredFields = ["code", "name", "start_time", "end_time"];
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    start_time: item?.start_time ?? "",
    end_time: item?.end_time ?? "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => productionApi.createShift(form),
    onSuccess: () => {
      toast.success("Shift created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
      qc.invalidateQueries({ queryKey: ["mill-masters"] });
    },
  });

  const updateM = useMutation({
    mutationFn: () => productionApi.updateShift(item!.id, form),
    onSuccess: () => {
      toast.success("Shift updated");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
      qc.invalidateQueries({ queryKey: ["mill-masters"] });
    },
  });

  const isPending = createM.isPending || updateM.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    if (item?.id) updateM.mutate();
    else createM.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Shift Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          placeholder="e.g. A, B, Night, G"
          maxLength={10}
          onChange={(e) => {
            setTouched((t) => ({ ...t, code: true }));
            setForm({ ...form, code: e.target.value.toUpperCase() });
          }}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Shift Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={cn(err("start_time") && "text-destructive")}>
            Start Time <span className="text-destructive">*</span>
          </Label>
          <Input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className={cn(err("start_time") && "border-destructive")}
          />
          {err("start_time") && <p className="text-xs text-destructive">{err("start_time")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className={cn(err("end_time") && "text-destructive")}>
            End Time <span className="text-destructive">*</span>
          </Label>
          <Input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            className={cn(err("end_time") && "border-destructive")}
          />
          {err("end_time") && <p className="text-xs text-destructive">{err("end_time")}</p>}
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !isComplete}>
          {isPending ? "Saving…" : item?.id ? "Update" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function WarehouseForm({ item }: { item?: Warehouse }) {
  const qc = useQueryClient();
  const requiredFields = ["code", "name"];
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    location: item?.location ?? "",
    capacity_bags: item?.capacity_bags ?? undefined,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isComplete = requiredFields.every((f) => {
    const v = form[f as keyof typeof form];
    return v !== "" && v !== undefined && v !== null;
  });
  const err = (f: string) => {
    if (!touched[f]) return undefined;
    const v = form[f as keyof typeof form];
    if (v === "" || v === undefined || v === null) return "This field is required";
    return undefined;
  };

  const createM = useMutation({
    mutationFn: () => inventoryApi.createWarehouse(form),
    onSuccess: () => {
      toast.success("Warehouse created");
      qc.invalidateQueries({ queryKey: ["masters", "all"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    createM.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className={cn(err("code") && "text-destructive")}>
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className={cn(err("code") && "border-destructive")}
        />
        {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={cn(err("name") && "text-destructive")}>
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cn(err("name") && "border-destructive")}
        />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Location</Label>
        <Input
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Capacity (bags)</Label>
        <Input
          type="number"
          value={form.capacity_bags ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              capacity_bags: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={createM.isPending || !isComplete}>
          {createM.isPending ? "Saving…" : item?.id ? "Update" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Machines Tab ─────────────────────────────────────────────────────────────
function MachinesTab({
  machines,
  isLoading,
  colConfig,
  canEdit,
  onImportSuccess,
}: {
  machines: any[];
  isLoading: boolean;
  colConfig: any;
  canEdit: boolean;
  onImportSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Derive visible column keys from column config, fallback to sensible defaults
  const visibleKeys: string[] = colConfig?.columns
    ?.filter((c: any) => c.is_visible !== false)
    .map((c: any) => c.key) ?? [
    "code",
    "name",
    "machine_type",
    "department",
    "spindles",
    "current_status",
    "make",
    "installation_date",
    "is_active",
  ];

  const allColDefs: ColDef<any>[] = [
    {
      key: "code",
      label: "Code",
      render: (m) => <span className="font-mono text-xs font-semibold">{m.code}</span>,
    },
    { key: "name", label: "Name", render: (m) => <span className="font-medium">{m.name}</span> },
    {
      key: "machine_type",
      label: "Type/Model",
      render: (m) => <span className="text-xs">{m.machine_type ?? m.model ?? "—"}</span>,
    },
    {
      key: "department",
      label: "Section",
      render: (m) => <span className="text-xs">{m.department ?? "—"}</span>,
    },
    {
      key: "spindles",
      label: "Spindles/Heads",
      render: (m) => <span className="text-xs">{m.spindles ?? "—"}</span>,
    },
    {
      key: "make",
      label: "Make",
      render: (m) => <span className="text-xs text-muted-foreground">{m.make ?? "—"}</span>,
    },
    {
      key: "installation_date",
      label: "Comm. Date",
      render: (m) => (
        <span className="text-xs">
          {m.installation_date ? String(m.installation_date).slice(0, 10) : "—"}
        </span>
      ),
    },
    {
      key: "current_status",
      label: "Status",
      render: (m) => {
        const s = m.current_status ?? "running";
        const cls =
          s === "running"
            ? "bg-green-100 text-green-700"
            : s === "breakdown"
              ? "bg-red-100 text-red-700"
              : s === "maintenance"
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-600";
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}
          >
            {s}
          </span>
        );
      },
    },
    {
      key: "is_active",
      label: "Active",
      render: (m) => (
        <span
          className={`text-xs font-medium ${m.is_active !== false ? "text-emerald-600" : "text-red-500"}`}
        >
          {m.is_active !== false ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  // Auto-append custom field columns from first machine's custom_fields dict
  // and from colConfig custom keys not already in allColDefs
  const customColKeys = (colConfig?.columns ?? [])
    .filter((c: any) => c._isCustom && c.is_visible !== false)
    .map((c: any) => ({ key: c.key, label: c.label }));

  // Also pick up any custom_fields keys that came from the API (imported but not yet in config)
  const apiCustomKeys = new Set<string>();
  for (const m of machines.slice(0, 5)) {
    if (m.custom_fields && typeof m.custom_fields === "object") {
      Object.keys(m.custom_fields).forEach((k) => apiCustomKeys.add(k));
    }
  }

  const allCustomKeys = [
    ...customColKeys,
    ...[...apiCustomKeys]
      .filter((k) => !customColKeys.find((c: any) => c.key === k))
      .map((k) => ({
        key: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      })),
  ];

  const customColDefs: ColDef<any>[] = allCustomKeys.map(
    ({ key, label }: { key: string; label: string }) => ({
      key,
      label,
      render: (m: any) => {
        const val = m.custom_fields?.[key] ?? m[key] ?? "—";
        return <span className="text-xs text-blue-700">{String(val)}</span>;
      },
    }),
  );

  const colDefs = [...allColDefs.filter((c) => visibleKeys.includes(c.key)), ...customColDefs];

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Factory className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Machines</h2>
          {!isLoading && (
            <span className="text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded-full">
              {machines.length}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <ArrowDown className="size-4 mr-1" /> Import Excel
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-1" /> Add Machine
            </Button>
          </div>
        )}
      </div>

      {/* Info banner shown only when empty */}
      {!isLoading && machines.length === 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
          <p className="font-semibold mb-1">How to import machines</p>
          <p>
            Use <strong>Import Excel</strong> with your machine register file. Supported columns:
          </p>
          <p className="mt-1 font-mono text-[11px]">
            Mc_code · Department · Name of item · Type No · Manufacturing Year · No of delivery Head
            · Comm. Date · Remarks
          </p>
          <p className="mt-1">
            Machines without a code get auto-generated codes. Brand/Country from Remarks is captured
            automatically.
          </p>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        tableId="masters_machines"
        columns={colDefs}
        data={machines}
        isLoading={isLoading}
        emptyMessage="No machines yet — click Import Excel to upload your machine register."
        exportFilename="machines"
        rowKey={(m) => m.id ?? m.code}
        onRowClick={canEdit ? (m) => setEditItem(m) : undefined}
        actions={
          canEdit
            ? (m: any) => (
                <ConfirmDeleteButton
                  onConfirm={async () => {
                    await productionApi.deleteMachine(m.id);
                    qc.invalidateQueries({ queryKey: ["masters", "all"] });
                    qc.invalidateQueries({ queryKey: ["machines"] });
                    // Maintenance reads machines for machine lists, manpower counts & day-plan numbers
                    qc.invalidateQueries({ queryKey: ["maintenance"] });
                    qc.invalidateQueries({ queryKey: ["pm-entry-machines"] });
                    qc.invalidateQueries({ queryKey: ["machines-carding"] });
                  }}
                  label={`Delete machine ${m.code}?`}
                  title="Delete Machine?"
                  confirmText="Delete"
                  successMessage={`Machine ${m.code} deleted`}
                />
              )
            : undefined
        }
      />

      {/* Import Modal */}
      <DirectImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        tableName="masters_machines"
        endpoint="/masters/machines/bulk"
        onSuccess={() => {
          setImportOpen(false);
          onImportSuccess();
          qc.invalidateQueries({ queryKey: ["machines"] });
          // Maintenance reads machines for machine lists, manpower counts & day-plan numbers
          qc.invalidateQueries({ queryKey: ["maintenance"] });
          qc.invalidateQueries({ queryKey: ["pm-entry-machines"] });
          qc.invalidateQueries({ queryKey: ["machines-carding"] });
        }}
        title="Import Machines from Excel"
      />

      {/* Add / Edit Machine Sheet */}
      <MachineForm
        item={editItem ?? undefined}
        open={addOpen || !!editItem}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false);
            setEditItem(null);
          }
        }}
        onSaved={() => {
          setAddOpen(false);
          setEditItem(null);
          onImportSuccess();
          qc.invalidateQueries({ queryKey: ["machines"] });
          // Maintenance reads machines for machine lists, manpower counts & day-plan numbers
          qc.invalidateQueries({ queryKey: ["maintenance"] });
          qc.invalidateQueries({ queryKey: ["pm-entry-machines"] });
          qc.invalidateQueries({ queryKey: ["machines-carding"] });
        }}
      />
    </div>
  );
}

// ── MachineForm (add / edit single machine) ───────────────────────────────────
function MachineForm({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item?: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { millId } = useActiveMill();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    machine_type: item?.machine_type ?? "",
    department: item?.department ?? "",
    spindles: item?.spindles ? String(item.spindles) : "",
    make: item?.make ?? "",
    installation_date: item?.installation_date ? String(item.installation_date).slice(0, 10) : "",
    current_status: item?.current_status ?? "running",
  });
  // Custom fields from MillCustomField definitions
  const [customVals, setCustomVals] = useState<Record<string, string>>(item?.custom_fields ?? {});
  const [saving, setSaving] = useState(false);
  const isEdit = !!item;

  // Machine sections are a fixed list — not HR departments

  // Fetch custom field definitions for this mill's machines
  const { data: customFieldDefs } = useQuery({
    queryKey: ["custom-field-defs", millId, "machines"],
    queryFn: () =>
      api
        .get("/ui-config/custom-fields", {
          params: { mill_id: millId, module: "machines" },
        })
        .then((r) => r.data?.fields ?? []),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const customDefs = (Array.isArray(customFieldDefs) ? customFieldDefs : []) as any[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        spindles: form.spindles ? Number(form.spindles) : null,
        installation_date: form.installation_date || null,
        mill_id: millId,
      };
      if (isEdit) {
        await productionApi.updateMachine(item.id, payload);
        toast.success("Machine updated");
      } else {
        await productionApi.createMachine(payload);
        toast.success("Machine created");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save machine");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Factory className="size-4" />
            {isEdit ? `Edit — ${item?.code}` : "Add Machine"}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Code <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. CD_001"
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.current_status}
                onValueChange={(v) => setForm({ ...form, current_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="breakdown">Breakdown</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Name / Model <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Trutzschler DK-740"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select
              value={form.department}
              onValueChange={(v) => setForm({ ...form, department: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select section…" />
              </SelectTrigger>
              <SelectContent>
                {MACHINE_SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type / Model No</Label>
              <Input
                value={form.machine_type}
                onChange={(e) => setForm({ ...form, machine_type: e.target.value })}
                placeholder="e.g. 168757 L"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Spindles / Heads</Label>
              <Input
                type="number"
                value={form.spindles}
                onChange={(e) => setForm({ ...form, spindles: e.target.value })}
                placeholder="e.g. 120"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Make (Brand / Country)</Label>
            <Input
              value={form.make}
              onChange={(e) => setForm({ ...form, make: e.target.value })}
              placeholder="e.g. Trutzschler (Germany)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Commissioning Date</Label>
            <Input
              type="date"
              value={form.installation_date}
              onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
            />
          </div>

          {/* Custom fields — rendered from MillCustomField definitions */}
          {customDefs.length > 0 && (
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Custom Fields
              </p>
              {customDefs.map((def: any) => (
                <div key={def.field_key} className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    {def.field_label}
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-sans">
                      custom
                    </span>
                  </Label>
                  <Input
                    type={
                      def.field_type === "number"
                        ? "number"
                        : def.field_type === "date"
                          ? "date"
                          : "text"
                    }
                    value={customVals[def.field_key] ?? ""}
                    onChange={(e) =>
                      setCustomVals((prev) => ({ ...prev, [def.field_key]: e.target.value }))
                    }
                    placeholder={`Enter ${def.field_label.toLowerCase()}…`}
                  />
                </div>
              ))}
            </div>
          )}

          <SheetFooter className="pt-2">
            <Button
              type="submit"
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="w-full"
            >
              {saving ? "Saving…" : isEdit ? "Update Machine" : "Add Machine"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Machine Groups Tab ─────────────────────────────────────────────────────────

function MachineGroupsTab({
  allMachines,
  canEdit,
  search,
}: {
  allMachines: any[];
  canEdit: boolean;
  search: string;
}) {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MachineGroup | null>(null);
  const [form, setForm] = useState({ name: "", description: "", machine_codes: [] as string[] });
  const [machineSearch, setMachineSearch] = useState("");

  const groupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: false }),
    staleTime: 30_000,
    enabled: !!millId,
  });
  const groups: MachineGroup[] = (groupsQ.data ?? []) as MachineGroup[];
  const filtered = groups.filter(
    (g) =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? productionApi.updateMachineGroup(editing.id, form)
        : productionApi.createMachineGroup({
            ...form,
            is_active: true,
            mill_id: millId ?? undefined,
          }),
    onSuccess: () => {
      toast.success(editing ? "Machine group updated" : "Machine group created");
      qc.invalidateQueries({ queryKey: ["machine-groups"] });
      setSheetOpen(false);
    },
    onError: () => toast.error("Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => productionApi.deleteMachineGroup(id),
    onSuccess: () => {
      toast.success("Machine group deleted");
      qc.invalidateQueries({ queryKey: ["machine-groups"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", description: "", machine_codes: [] });
    setMachineSearch("");
    setSheetOpen(true);
  }

  function openEdit(g: MachineGroup) {
    setEditing(g);
    setForm({
      name: g.name,
      description: g.description ?? "",
      machine_codes: g.machine_codes ?? [],
    });
    setMachineSearch("");
    setSheetOpen(true);
  }

  function toggleMachine(code: string) {
    setForm((prev) => ({
      ...prev,
      machine_codes: prev.machine_codes.includes(code)
        ? prev.machine_codes.filter((c) => c !== code)
        : [...prev.machine_codes, code],
    }));
  }

  const filteredMachines = allMachines.filter(
    (m: any) =>
      !machineSearch ||
      m.code?.toLowerCase().includes(machineSearch.toLowerCase()) ||
      m.name?.toLowerCase().includes(machineSearch.toLowerCase()) ||
      m.department?.toLowerCase().includes(machineSearch.toLowerCase()),
  );

  // Group machines by department for the picker
  const machinesByDept = filteredMachines.reduce((acc: Record<string, any[]>, m: any) => {
    const dept = m.department || "Uncategorised";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(m);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Blocks className="size-4" /> Machine Groups
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Name and group your machines (e.g. "Carding Line 1", "Ring Frame Section A"). In Shift
            Entry, the worker selects a group to log entries.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="size-3.5 mr-1" /> New Group
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {groupsQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <Blocks className="size-8 mx-auto opacity-30" />
            <p className="text-sm">No machine groups yet.</p>
            <p className="text-xs">
              Create groups like "Carding Line 1" or "Ring Frame Section A".
            </p>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="size-3.5 mr-1" /> Create first group
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((g) => (
              <div key={g.id} className="flex items-start gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{g.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {(g.machine_codes ?? []).length} machines
                    </Badge>
                    {!g.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(g.machine_codes ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        No machines assigned
                      </span>
                    ) : (
                      (g.machine_codes ?? []).slice(0, 12).map((code) => (
                        <Badge key={code} variant="secondary" className="text-xs font-mono">
                          {code}
                        </Badge>
                      ))
                    )}
                    {(g.machine_codes ?? []).length > 12 && (
                      <Badge variant="secondary" className="text-xs">
                        +{(g.machine_codes ?? []).length - 12} more
                      </Badge>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete machine group "${g.name}"?`)) {
                          deleteMut.mutate(g.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Machine Group" : "New Machine Group"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>
                Group Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Carding Line 1, Ring Frame Section A"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Description <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="e.g. North wing, 3rd floor"
              />
            </div>

            {/* Machine picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Machines in this group ({form.machine_codes.length} selected)</Label>
                {form.machine_codes.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-6 text-muted-foreground"
                    onClick={() => setForm((p) => ({ ...p, machine_codes: [] }))}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Search machines…"
                  value={machineSearch}
                  onChange={(e) => setMachineSearch(e.target.value)}
                />
              </div>
              <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
                {Object.keys(machinesByDept).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No machines found
                  </p>
                ) : (
                  Object.entries(machinesByDept).map(([dept, machines]) => (
                    <div key={dept}>
                      <div className="px-3 py-1.5 bg-muted/50 sticky top-0">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {dept}
                        </span>
                      </div>
                      {(machines as any[]).map((m: any) => {
                        const selected = form.machine_codes.includes(m.code);
                        return (
                          <button
                            key={m.code}
                            type="button"
                            onClick={() => toggleMachine(m.code)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 transition-colors ${selected ? "bg-primary/5" : ""}`}
                          >
                            <div
                              className={`size-4 rounded flex items-center justify-center border ${selected ? "bg-primary border-primary" : "border-input"}`}
                            >
                              {selected && <Check className="size-2.5 text-white" />}
                            </div>
                            <span className="font-mono text-xs font-medium">{m.code}</span>
                            {m.name && (
                              <span className="text-xs text-muted-foreground truncate">
                                {m.name}
                              </span>
                            )}
                            {m.department && (
                              <span className="ml-auto text-xs text-muted-foreground/60">
                                {m.department}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim()}
              className="w-full"
            >
              {saveMut.isPending ? "Saving…" : editing ? "Update Group" : "Create Group"}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// ── Stop Codes Tab ────────────────────────────────────────────────────────────

const STOP_CODE_CATEGORIES = [
  { value: "normal", label: "Normal" },
  { value: "planned", label: "Planned" },
  { value: "breakdown_mechanical", label: "Breakdown — Mechanical" },
  { value: "breakdown_electrical", label: "Breakdown — Electrical" },
  { value: "production_change", label: "Production Change" },
  { value: "quality", label: "Quality" },
  { value: "utility", label: "Utility" },
  { value: "misc", label: "Misc" },
];

function StopCodesTab({ canEdit, search }: { canEdit: boolean; search: string }) {
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    departments: [] as string[],
  });

  // Mill departments for checkbox list
  const { data: millMasters } = useMillMasters();
  const deptOptions = (millMasters?.department ?? []) as any[];

  const codesQ = useQuery({
    queryKey: ["stop-codes", "all"],
    queryFn: productionApi.getAllStopCodes,
    staleTime: 30_000,
  });
  const allCodes = (codesQ.data ?? []) as any[];
  const filtered = allCodes.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      String(c.code).includes(q) ||
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.category ?? "").toLowerCase().includes(q)
    );
  });

  const toggleDept = (name: string) => {
    setForm((p) => ({
      ...p,
      departments: p.departments.includes(name)
        ? p.departments.filter((d) => d !== name)
        : [...p.departments, name],
    }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      // departments: empty array = applies to all; non-empty = specific depts only
      const depts = form.departments.length > 0 ? form.departments : null;
      if (editing) {
        return productionApi.updateStopCode(editing.code, {
          name: form.name,
          category: form.category || undefined,
          departments: depts as any,
        });
      } else {
        return productionApi.createStopCode({
          code: parseInt(form.code),
          name: form.name,
          category: form.category || undefined,
          departments: depts as any,
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Stop code updated" : "Stop code created");
      qc.invalidateQueries({ queryKey: ["stop-codes"] });
      setSheetOpen(false);
      setEditing(null);
      setForm({ code: "", name: "", category: "", departments: [] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to save stop code");
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ code: "", name: "", category: "", departments: [] });
    setSheetOpen(true);
  };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({
      code: String(c.code),
      name: c.name,
      category: c.category ?? "",
      departments: Array.isArray(c.departments) ? c.departments : [],
    });
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          DATALOG Stop Codes
          {!codesQ.isLoading && (
            <span className="text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded-full">
              {allCodes.length}
            </span>
          )}
        </h2>
        {canEdit && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4 mr-1" /> Add Stop Code
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b text-xs text-muted-foreground">
                  <th className="text-left pl-4 py-2 w-14">Code</th>
                  <th className="text-left py-2 w-48">Name / Reason</th>
                  <th className="text-left py-2 w-36">Category</th>
                  <th className="text-left py-2">
                    Departments <span className="font-normal opacity-70">(blank = all)</span>
                  </th>
                  <th className="text-left py-2 w-14">Active</th>
                  <th className="py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {codesQ.isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                      No stop codes found. Add one above.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c: any, idx: number) => (
                    <tr
                      key={c.code}
                      className={[
                        "border-b last:border-0",
                        idx % 2 === 0 ? "" : "bg-muted/20",
                      ].join(" ")}
                    >
                      <td className="pl-4 py-2 font-mono font-bold text-primary">{c.code}</td>
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {STOP_CODE_CATEGORIES.find((x) => x.value === c.category)?.label ??
                          c.category ??
                          "—"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {Array.isArray(c.departments) && c.departments.length > 0 ? (
                          c.departments.join(", ")
                        ) : (
                          <span className="italic opacity-60">All departments</span>
                        )}
                      </td>
                      <td className="py-2">
                        <span
                          className={`text-xs font-medium ${c.is_active !== false ? "text-emerald-600" : "text-red-500"}`}
                        >
                          {c.is_active !== false ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {canEdit && (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                              title="Edit"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <ConfirmDeleteButton
                              onConfirm={async () => {
                                await productionApi.deleteStopCode(c.code);
                                qc.invalidateQueries({ queryKey: ["stop-codes"] });
                              }}
                              label={`Deactivate code ${c.code} — ${c.name}?`}
                              title="Deactivate Stop Code?"
                              confirmText="Deactivate"
                              successMessage="Stop code deactivated"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) {
            setSheetOpen(false);
            setEditing(null);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? `Edit Code ${editing.code}` : "Add Stop Code"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-xs">Code Number *</Label>
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="e.g. 1"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Numeric code used in DATALOG system (1–9999)
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason / Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Cleaning, Creel Change…"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {STOP_CODE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Departments — checkboxes */}
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-semibold">Applicable Departments</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Leave all unchecked = applies to every department
                </p>
              </div>
              {deptOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No departments set up in Masters yet
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 border rounded-md p-3 bg-muted/20">
                  {deptOptions.map((d: any) => {
                    const name = typeof d === "string" ? d : d.name;
                    const checked = form.departments.includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDept(name)}
                          className="rounded border-gray-300"
                        />
                        <span className={checked ? "font-medium" : ""}>{name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {form.departments.length > 0 && (
                <p className="text-xs text-primary">
                  ✓ Will only appear in: {form.departments.join(", ")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim() || (!editing && !form.code)}
              className="w-full"
            >
              {saveMut.isPending ? "Saving…" : editing ? "Update" : "Add Stop Code"}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
