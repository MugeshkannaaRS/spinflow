import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, productionApi, inventoryApi, adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Search, Settings, Blocks, ArrowDownToLine, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useMillMasterCategory } from "@/hooks/useMillConfig";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
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

export const Route = createFileRoute("/_app/masters")({
  head: () => ({ meta: [{ title: "Masters — SpinFlow ERP" }] }),
  component: MastersPage,
});

function MastersPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "masters");
  const deptColConfig = useColumnConfig("masters_departments");
  const custColConfig = useColumnConfig("masters_customers");
  const vehColConfig = useColumnConfig("masters_vehicles");
  const shiftColConfig = useColumnConfig("masters_shifts");
  const yarnColConfig = useColumnConfig("masters_yarn_counts");
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
        qcMasters.invalidateQueries({ queryKey: ["masters", "customers"] });
      })
      .catch(() => toast.error("Failed to deactivate customer"));
  }

  const companiesQ = useQuery({
    queryKey: ["masters", "companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
    retry: 1,
  });
  const millsQ = useQuery({
    queryKey: ["masters", "mills"],
    queryFn: () => mastersApi.getMills(),
    staleTime: 60_000,
    retry: 1,
  });
  const deptsQ = useQuery({
    queryKey: ["masters", "departments"],
    queryFn: () => mastersApi.getDepartments(),
    staleTime: 60_000,
    retry: 1,
  });
  const yarnQ = useQuery({
    queryKey: ["masters", "yarn-counts"],
    queryFn: () => mastersApi.getYarnCounts(),
    staleTime: 60_000,
    retry: 1,
  });
  const custQ = useQuery({
    queryKey: ["masters", "customers"],
    queryFn: () => mastersApi.getCustomers(),
    staleTime: 60_000,
    retry: 1,
  });
  const vehQ = useQuery({
    queryKey: ["masters", "vehicles"],
    queryFn: () => mastersApi.getVehicles(),
    staleTime: 60_000,
    retry: 1,
  });
  const routeQ = useQuery({
    queryKey: ["masters", "routes"],
    queryFn: () => mastersApi.getRoutes(),
    staleTime: 60_000,
    retry: 1,
  });

  const shiftsQ = useQuery({
    queryKey: ["masters", "shifts"],
    queryFn: () => productionApi.getShifts(),
    staleTime: 60_000,
    retry: 1,
  });
  const warehousesQ = useQuery({
    queryKey: ["masters", "warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 60_000,
    retry: 1,
  });

  const companiesData = (companiesQ.data ?? []) as Company[];
  const activeCompaniesData = useMemo(
    () => companiesData.filter((c: any) => c?.id && c.is_active !== false),
    [companiesData]
  );
  const millsData = (millsQ.data ?? []) as Mill[];
  const deptsData = (deptsQ.data ?? []) as Department[];
  const yarnData = (yarnQ.data ?? []) as YarnCount[];
  const custData = (custQ.data ?? []) as Customer[];
  const vehData = (vehQ.data ?? []) as MasterVehicle[];
  const routeData = (routeQ.data ?? []) as MasterRoute[];
  const shiftsData = (shiftsQ.data ?? []) as any[];
  const warehousesData = (warehousesQ.data ?? []) as any[];

  if (!user) return null;

  // SUPER_ADMIN should not land on Masters — redirect to Admin
  if (user.role === "SUPER_ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="Manage companies, mills, departments & reference data"
        onRefresh={() => qcMasters.invalidateQueries({ queryKey: ["masters"] })}
        isRefreshing={companiesQ.isFetching}
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
                  { key: "departments", label: "Departments" },
                  { key: "yarn-counts", label: "Yarn Counts" },
                  { key: "customers", label: "Customers" },
                  { key: "vehicles", label: "Vehicles" },
                  { key: "routes", label: "Routes" },
                  { key: "shifts", label: "Shifts" },
                  { key: "warehouses", label: "Warehouses" },
                ];
                const isSuperAdmin = false;
                return allTabs.filter(t =>
                  isSuperAdmin ? ["companies", "mills"].includes(t.key) : t.key !== "companies"
                ).map(t => (
                  <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
                ));
              })()}
            </TabsList>

            <TabsContent value="companies">
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
            </TabsContent>

            <TabsContent value="mills">
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
                canEdit={canEdit && user?.role !== "MILL_OWNER"}
                onAdd={user?.role !== "MILL_OWNER" ? <MillForm companies={activeCompaniesData} /> : (<></>)}
                onEdit={(item) => <MillForm item={item} companies={activeCompaniesData} />}
                headerExtra={user?.role === "MILL_OWNER" ? (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <span>Need another mill?</span>
                    <Link to="/company/billing" className="font-semibold text-amber-800 hover:text-amber-900 underline">Upgrade plan</Link>
                  </div>
                ) : undefined}
                extraActions={(item) => (
                  <Button size="sm" variant="outline" onClick={() => setSettingsMill(item as Mill)}>
                    <Settings className="size-3.5 mr-1" /> Settings
                  </Button>
                )}
              />
            </TabsContent>

            <TabsContent value="departments">
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
              />
            </TabsContent>

            <TabsContent value="yarn-counts">
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
              />
            </TabsContent>

            <TabsContent value="customers">
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
                onDeactivate={canEdit ? deactivateCustomer : undefined}
                headerExtra={canEdit ? <ImportCustomersDialog /> : undefined}
              />
            </TabsContent>

            <TabsContent value="vehicles">
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
              />
            </TabsContent>

            <TabsContent value="routes">
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
              />
            </TabsContent>

            <TabsContent value="shifts">
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
              />
            </TabsContent>

            <TabsContent value="warehouses">
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
              />
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
                  qcMasters.invalidateQueries({ queryKey: ["masters", "companies"] });
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
                  qcMasters.invalidateQueries({ queryKey: ["masters", "mills"] });
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
  extraActions?: (item: T) => React.ReactElement;
  headerExtra?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const tableId = `masters_${title.toLowerCase().replace(/\s+/g, "_")}`;

  const colDefs: ColDef<T>[] = [
    ...columns.map((col) => ({
      key: col.key,
      label: col.label,
      render: (item: T) => <span>{formatValue((item as any)[col.key])}</span>,
    } as ColDef<T>)),
    ...(!noStatus
      ? [{
          key: "_status",
          label: "Status",
          filterable: false,
          render: (item: T) => {
            const row = item as any;
            if (activeKey === "current_status")
              return (
                <Badge variant={row[activeKey] === "running" ? "default" : row[activeKey] === "idle" ? "secondary" : "outline"}>
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
        } as ColDef<T>]
      : []),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title} ({data.length})</CardTitle>
        {canEdit && (
          <Sheet open={adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
            <SheetTrigger asChild>
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4 mr-1" /> Add {singularize(title)}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader><SheetTitle>Add {singularize(title)}</SheetTitle></SheetHeader>
              <div className="mt-4">{onAdd}</div>
            </SheetContent>
          </Sheet>
        )}
        {headerExtra}
      </CardHeader>
      <CardContent>
        <DataTable
          tableId={tableId}
          columns={colDefs}
          data={data}
          loading={false}
          rowKey={(item: any) => String(item.id ?? "")}
          exportFilename={title.toLowerCase().replace(/\s+/g, "_")}
          actions={(canEdit || extraActions) ? (item: T) => {
            const row = item as any;
            const id = String(row.id ?? "");
            return (
              <div className="flex gap-1">
                {canEdit && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button size="sm" variant="outline"><Pencil className="size-3.5 mr-1" /> Edit</Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                      <SheetHeader><SheetTitle>Edit {singularize(title)}</SheetTitle></SheetHeader>
                      <div className="mt-4">{onEdit(item)}</div>
                    </SheetContent>
                  </Sheet>
                )}
                {extraActions?.(item)}
                {canEdit && onDeactivate && (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => onDeactivate(id)}>
                    Deactivate
                  </Button>
                )}
              </div>
            );
          } : undefined}
        />
      </CardContent>
    </Card>
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
      <SheetFooter>
        <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
          {updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      <SheetFooter>
        <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
          {updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "companies"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateCompany(item!.id, form),
    onSuccess: () => {
      toast.success("Company updated");
      qc.invalidateQueries({ queryKey: ["masters", "companies"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "mills"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateMill(item!.id, form),
    onSuccess: () => {
      toast.success("Mill updated");
      qc.invalidateQueries({ queryKey: ["masters", "mills"] });
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
            {companies.filter((c) => c?.id).map((c) => (
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "departments"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateDepartment(item!.id, form),
    onSuccess: () => {
      toast.success("Department updated");
      qc.invalidateQueries({ queryKey: ["masters", "departments"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "yarn-counts"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateYarnCount(item!.id, form),
    onSuccess: () => {
      toast.success("Yarn count updated");
      qc.invalidateQueries({ queryKey: ["masters", "yarn-counts"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "customers"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateCustomer(item!.id, form),
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["masters", "customers"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "vehicles"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateVehicle(item!.id, form),
    onSuccess: () => {
      toast.success("Vehicle updated");
      qc.invalidateQueries({ queryKey: ["masters", "vehicles"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "routes"] });
    },
  });
  const updateM = useMutation({
    mutationFn: () => mastersApi.updateRoute(item!.id, form),
    onSuccess: () => {
      toast.success("Route updated");
      qc.invalidateQueries({ queryKey: ["masters", "routes"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function ImportCustomersDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="size-4 mr-1" />
        Import Excel
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="masters_customers"
        endpoint="/masters/customers/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["masters", "customers"] })}
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
      qc.invalidateQueries({ queryKey: ["masters", "shifts"] });
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
          Shift Code <span className="text-destructive">*</span>
        </Label>
        <Select value={form.code} onValueChange={(v) => setForm({ ...form, code: v })}>
          <SelectTrigger className={cn(err("code") && "border-destructive")}>
            <SelectValue placeholder="Select code" />
          </SelectTrigger>
          <SelectContent>
            {["A", "B", "C"].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || !isComplete}>
          {createM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
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
      qc.invalidateQueries({ queryKey: ["masters", "warehouses"] });
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
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || !isComplete}>
          {createM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}
