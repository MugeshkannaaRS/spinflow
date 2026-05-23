import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, productionApi, inventoryApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  Company,
  Mill,
  Department,
  YarnCount,
  Customer,
  MasterVehicle,
  Route as MasterRoute,
  MasterMachine,
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

const MACHINE_TYPES = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Autoconer",
  "Winding",
] as const;

export const Route = createFileRoute("/_app/masters")({
  head: () => ({ meta: [{ title: "Masters — SpinFlow ERP" }] }),
  component: MastersPage,
});

function MastersPage() {
  const user = useAuth((s) => s.user)!;
  const canEdit = canWrite(user.role, "masters");
  const [tab, setTab] = useState("companies");
  const [search, setSearch] = useState("");
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

  const machinesQ = useQuery({
    queryKey: ["masters", "machines"],
    queryFn: () => productionApi.getMachines(),
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

  const companiesData = (companiesQ.data as ListResponse<Company>)?.data ?? [];
  const millsData = (millsQ.data as ListResponse<Mill>)?.data ?? [];
  const deptsData = (deptsQ.data as ListResponse<Department>)?.data ?? [];
  const yarnData = (yarnQ.data as ListResponse<YarnCount>)?.data ?? [];
  const custData = (custQ.data as ListResponse<Customer>)?.data ?? [];
  const vehData = (vehQ.data as ListResponse<MasterVehicle>)?.data ?? [];
  const routeData = (routeQ.data as ListResponse<MasterRoute>)?.data ?? [];
  const machinesData =
    (machinesQ.data as ListResponse<MasterMachine>)?.data ??
    (Array.isArray(machinesQ.data) ? machinesQ.data : []);
  const shiftsData = Array.isArray(shiftsQ.data) ? shiftsQ.data : [];
  const warehousesData = Array.isArray(warehousesQ.data) ? warehousesQ.data : [];

  return (
    <>
      <Topbar title="Masters" subtitle="Manage companies, mills, departments & reference data" />
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
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="mills">Mills</TabsTrigger>
              <TabsTrigger value="departments">Departments</TabsTrigger>
              <TabsTrigger value="yarn-counts">Yarn Counts</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="routes">Routes</TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="shifts">Shifts</TabsTrigger>
              <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
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
                canEdit={canEdit}
                onAdd={<MillForm companies={companiesData} />}
                onEdit={(item) => <MillForm item={item} companies={companiesData} />}
              />
            </TabsContent>

            <TabsContent value="departments">
              <MasterTable
                title="Departments"
                data={deptsData.filter((x) => matchesSearch(x, search))}
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "department_type", label: "Type" },
                  { key: "mill_id", label: "Mill ID" },
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
                  { key: "count", label: "Count" },
                  { key: "count_value", label: "Value" },
                  { key: "blend", label: "Blend" },
                  { key: "standard_csp", label: "Std CSP" },
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
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "city", label: "City" },
                  { key: "phone", label: "Phone" },
                  { key: "credit_limit", label: "Credit Limit" },
                ]}
                activeKey="is_active"
                canEdit={canEdit}
                onAdd={<CustomerForm mills={millsData} />}
                onEdit={(item) => <CustomerForm item={item} mills={millsData} />}
                onDeactivate={canEdit ? deactivateCustomer : undefined}
              />
            </TabsContent>

            <TabsContent value="vehicles">
              <MasterTable
                title="Vehicles"
                data={vehData.filter((x) => matchesSearch(x, search))}
                columns={[
                  { key: "vehicle_no", label: "Vehicle No" },
                  { key: "vehicle_type", label: "Type" },
                  { key: "capacity_kg", label: "Capacity (kg)" },
                  { key: "driver_name", label: "Driver" },
                  { key: "driver_phone", label: "Driver Phone" },
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

            <TabsContent value="machines">
              <MasterTable
                title="Machines"
                data={machinesData.filter((x) => matchesSearch(x, search))}
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "machine_type", label: "Type" },
                  { key: "department", label: "Department" },
                  { key: "target_kg", label: "Target (kg)" },
                ]}
                activeKey="current_status"
                canEdit={canEdit}
                onAdd={<MachineForm departments={deptsData} />}
                onEdit={(item) => <MachineForm item={item} departments={deptsData} />}
              />
            </TabsContent>

            <TabsContent value="shifts">
              <MasterTable
                title="Shifts"
                data={shiftsData.filter((x) => matchesSearch(x, search))}
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "start_time", label: "Start Time" },
                  { key: "end_time", label: "End Time" },
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
}) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<T | null>(null);
  const [adding, setAdding] = useState(false);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const paged = data.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          {title} ({data.length})
        </CardTitle>
        {canEdit && (
          <Sheet
            open={adding && true}
            onOpenChange={(o) => {
              if (!o) setAdding(false);
            }}
          >
            <SheetTrigger asChild>
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4 mr-1" /> Add {title.slice(0, -1)}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add {title.slice(0, -1)}</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{onAdd}</div>
            </SheetContent>
          </Sheet>
        )}
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[640px] w-full">
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((item) => {
                const row = item as any;
                const id = String(row.id ?? "");
                return (
                  <TableRow key={id}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>{formatValue(row[col.key])}</TableCell>
                    ))}
                    <TableCell>
                      {noStatus ? (
                        <span className="text-muted-foreground">-</span>
                      ) : activeKey === "current_status" ? (
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
                      ) : activeKey ? (
                        <Badge variant={row[activeKey] ? "default" : "secondary"}>
                          {row[activeKey] ? "Active" : "Inactive"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Sheet>
                            <SheetTrigger asChild>
                              <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                                Edit
                              </Button>
                            </SheetTrigger>
                            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                              <SheetHeader>
                                <SheetTitle>Edit {title.slice(0, -1)}</SheetTitle>
                              </SheetHeader>
                              <div className="mt-4">{onEdit(item)}</div>
                            </SheetContent>
                          </Sheet>
                          {onDeactivate && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => onDeactivate(id)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 2}
                    className="text-center text-muted-foreground py-8"
                  >
                    No entries found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="size-4" /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
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

// ── Form Components ──────────────────────────────────────

function CompanyForm({ item }: { item?: Company }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    gstin: item?.gstin ?? "",
    address: item?.address ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
  });

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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function MillForm({ item, companies }: { item?: Mill; companies: Company[] }) {
  const qc = useQueryClient();
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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Company *</Label>
        <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function DepartmentForm({ item, mills }: { item?: Department; mills: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? "",
    code: item?.code ?? "",
    name: item?.name ?? "",
    department_type: item?.department_type ?? "ring_frame",
  });

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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Mill *</Label>
        <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select mill" />
          </SelectTrigger>
          <SelectContent>
            {mills.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Department Type *</Label>
        <Select
          value={form.department_type}
          onValueChange={(v) => setForm({ ...form, department_type: v })}
        >
          <SelectTrigger>
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
      </div>
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function YarnCountForm({ item, mills }: { item?: YarnCount; mills: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? "",
    count: item?.count ?? "",
    count_value: item?.count_value ?? 0,
    blend: item?.blend ?? "",
    twist_per_meter: item?.twist_per_meter ?? undefined,
    standard_csp: item?.standard_csp ?? undefined,
    standard_u_percent: item?.standard_u_percent ?? undefined,
  });

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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Mill *</Label>
        <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select mill" />
          </SelectTrigger>
          <SelectContent>
            {mills.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Count * (e.g. 40s)</Label>
        <Input
          value={form.count}
          onChange={(e) => setForm({ ...form, count: e.target.value })}
          required
          placeholder="40s"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Count Value *</Label>
        <Input
          type="number"
          step="any"
          value={form.count_value}
          onChange={(e) => setForm({ ...form, count_value: parseFloat(e.target.value) })}
          required
        />
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function CustomerForm({ item, mills }: { item?: Customer; mills: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? "",
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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Mill *</Label>
        <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select mill" />
          </SelectTrigger>
          <SelectContent>
            {mills.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function VehicleForm({ item, mills }: { item?: MasterVehicle; mills: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? "",
    vehicle_no: item?.vehicle_no ?? "",
    vehicle_type: item?.vehicle_type ?? "truck",
    make: item?.make ?? "",
    model: item?.model ?? "",
    capacity_kg: item?.capacity_kg ?? undefined,
    driver_name: item?.driver_name ?? "",
    driver_phone: item?.driver_phone ?? "",
    driver_license: item?.driver_license ?? "",
  });

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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Mill *</Label>
        <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select mill" />
          </SelectTrigger>
          <SelectContent>
            {mills.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Vehicle No *</Label>
        <Input
          value={form.vehicle_no}
          onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })}
          required
          placeholder="TN 11 AB 1234"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Vehicle Type *</Label>
        <Select
          value={form.vehicle_type}
          onValueChange={(v) => setForm({ ...form, vehicle_type: v })}
        >
          <SelectTrigger>
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function RouteForm({ item, mills }: { item?: MasterRoute; mills: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mill_id: item?.mill_id ?? "",
    code: item?.code ?? "",
    name: item?.name ?? "",
    origin: item?.origin ?? "",
    destination: item?.destination ?? "",
    distance_km: item?.distance_km ?? undefined,
    estimated_hours: item?.estimated_hours ?? undefined,
  });

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
    (item ? updateM : createM).mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Mill *</Label>
        <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select mill" />
          </SelectTrigger>
          <SelectContent>
            {mills.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Origin *</Label>
          <Input
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Destination *</Label>
          <Input
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            required
          />
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
        <Button type="submit" disabled={createM.isPending || updateM.isPending}>
          {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function MachineForm({ item, departments }: { item?: MasterMachine; departments: Department[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    machine_type: item?.machine_type ?? "",
    department: item?.department ?? "",
    make: item?.make ?? "",
    model: item?.model ?? "",
    spindles: item?.spindles ?? undefined,
    installation_date: item?.installation_date ?? "",
    amc_expiry: item?.amc_expiry ?? "",
    target_kg: item?.target_kg ?? 0,
  });

  const createM = useMutation({
    mutationFn: () => productionApi.createMachine(form),
    onSuccess: () => {
      toast.success("Machine created");
      qc.invalidateQueries({ queryKey: ["masters", "machines"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createM.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Machine Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Machine Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Machine Type</Label>
        <Select
          value={form.machine_type}
          onValueChange={(v) => setForm({ ...form, machine_type: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {MACHINE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Department</Label>
        <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.code}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      {form.machine_type === "Ring Frame" && (
        <div className="space-y-1.5">
          <Label>Spindles</Label>
          <Input
            type="number"
            value={form.spindles ?? ""}
            onChange={(e) =>
              setForm({ ...form, spindles: e.target.value ? parseInt(e.target.value) : undefined })
            }
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Target (kg)</Label>
        <Input
          type="number"
          step="any"
          value={form.target_kg}
          onChange={(e) => setForm({ ...form, target_kg: parseFloat(e.target.value) })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Installation Date</Label>
          <Input
            type="date"
            value={form.installation_date}
            onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>AMC Expiry</Label>
          <Input
            type="date"
            value={form.amc_expiry}
            onChange={(e) => setForm({ ...form, amc_expiry: e.target.value })}
          />
        </div>
      </div>
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending}>
          {createM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function ShiftForm({ item, mills }: { item?: Shift; mills?: Mill[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    start_time: item?.start_time ?? "",
    end_time: item?.end_time ?? "",
  });

  const createM = useMutation({
    mutationFn: () => productionApi.createShift(form),
    onSuccess: () => {
      toast.success("Shift created");
      qc.invalidateQueries({ queryKey: ["masters", "shifts"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createM.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Shift Code *</Label>
        <Select value={form.code} onValueChange={(v) => setForm({ ...form, code: v })}>
          <SelectTrigger>
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
      </div>
      <div className="space-y-1.5">
        <Label>Shift Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Time *</Label>
          <Input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>End Time *</Label>
          <Input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            required
          />
        </div>
      </div>
      <SheetFooter>
        <Button type="submit" disabled={createM.isPending}>
          {createM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function WarehouseForm({ item }: { item?: Warehouse }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    location: item?.location ?? "",
    capacity_bags: item?.capacity_bags ?? undefined,
  });

  const createM = useMutation({
    mutationFn: () => inventoryApi.createWarehouse(form),
    onSuccess: () => {
      toast.success("Warehouse created");
      qc.invalidateQueries({ queryKey: ["masters", "warehouses"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createM.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Code *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
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
        <Button type="submit" disabled={createM.isPending}>
          {createM.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}
