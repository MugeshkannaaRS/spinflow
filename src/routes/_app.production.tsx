import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtNumber } from "@/lib/formatters";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Save, LayoutGrid, Plus, Pencil, ArrowDownToLine } from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useMillMasters, useMillMasterCategory } from "@/hooks/useMillConfig";

export const Route = createFileRoute("/_app/production")({
  head: () => ({ meta: [{ title: "Production — SpinFlow ERP" }] }),
  component: ProductionPage,
});

type GridRow = {
  machineCode: string;
  machineName: string;
  operator: string;
  producedKg: string;
  wasteKg: string;
  stoppageMins: string;
  stoppageReason: string;
  machineStatus: "running" | "breakdown" | "idle";
};

function buildRows(machines: any[]): GridRow[] {
  return (machines ?? []).map((m: any) => ({
    machineCode: m.code ?? "",
    machineName: m.name ?? m.code ?? "",
    operator: "",
    producedKg: "",
    wasteKg: "",
    stoppageMins: "",
    stoppageReason: "",
    machineStatus: (m.current_status ?? m.status ?? "running") as GridRow["machineStatus"],
  }));
}

function ShiftGrid() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const { data: millMasters } = useMillMasters();
  const deptOptions = millMasters?.department ?? [];
  const DEPARTMENTS = deptOptions.map((d: any) => typeof d === "string" ? d : d.name);
  const [department, setDepartment] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const first = deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions]);

  const [count, setCount] = useState("30s");
  const config = useColumnConfig("production_entries");

  const machinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId],
    queryFn: () => productionApi.getMachines({
      ...(departmentId ? { department_id: departmentId } : { department }),
      mill_id: millId,
    }),
    staleTime: 60_000,
    enabled: !!millId && !!(departmentId || department),
  });

  const machines = useMemo(
    () => (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[],
    [machinesQ.data],
  );
  const [rows, setRows] = useState<GridRow[]>(() => buildRows(machines));

  useEffect(() => {
    setRows(buildRows(machines));
  }, [machines]);

  const updateRow = (idx: number, field: keyof GridRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const summary = useMemo(() => {
    const active = rows.filter((r) => Number(r.producedKg) > 0);
    return {
      totalProduced: active.reduce((s, r) => s + (Number(r.producedKg) || 0), 0),
      totalWaste: active.reduce((s, r) => s + (Number(r.wasteKg) || 0), 0),
      running: rows.filter((r) => r.machineStatus === "running").length,
      idle: rows.filter((r) => r.machineStatus === "idle").length,
      breakdown: rows.filter((r) => r.machineStatus === "breakdown").length,
    };
  }, [rows]);

  const bulkMutation = useMutation({
    mutationFn: () => {
      const activeRows = rows.filter((r) => Number(r.producedKg) > 0);
      if (activeRows.length === 0) throw new Error("No entries to submit");
      return productionApi.createBulkEntries({
        date,
        shift,
        department,
        entries: activeRows.map((r) => ({
          machine_code: r.machineCode,
          operator: r.operator,
          produced_kg: Number(r.producedKg),
          waste_kg: Number(r.wasteKg) || 0,
          count,
          stoppage_mins: Number(r.stoppageMins) || 0,
          stoppage_reason: r.stoppageReason || undefined,
          machine_status: r.machineStatus,
        })),
      });
    },
    onSuccess: (res: any) => {
      toast.success(
        `${res.created} entries submitted${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}`,
      );
      if (res.errors?.length > 0) {
        res.errors.forEach((e: string) => toast.warning(e));
      }
      qc.invalidateQueries({ queryKey: ["shifts"] });
      setRows(buildRows(machines));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeCount = rows.filter((r) => Number(r.producedKg) > 0).length;

  const headerFields = ["date", "shift", "department", "count"] as const;
  const allHeaderFilled = headerFields.every((f) => {
    const vals = { date, shift, department, count };
    const v = vals[f];
    return typeof v === "string" && v.trim().length > 0;
  });
  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    const vals = { date, shift, department, count };
    headerFields.forEach((f) => {
      const v = vals[f];
      if (!v || (typeof v === "string" && !v.trim())) {
        errors[f] = "This field is required";
      }
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    bulkMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('date')}{config.isRequired('date') && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setRequiredErrors((prev) => ({ ...prev, date: "" }));
                }}
                className={["h-8 text-sm", requiredErrors.date ? "border-destructive" : ""]
                  .filter(Boolean)
                  .join(" ")}
              />
              {requiredErrors.date && (
                <p className="text-xs text-destructive">{requiredErrors.date}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('shift')}{config.isRequired('shift') && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={shift}
                onValueChange={(v) => {
                  setShift(v as "A" | "B" | "C");
                  setRequiredErrors((prev) => ({ ...prev, shift: "" }));
                }}
              >
                <SelectTrigger
                  className={["h-8 text-sm", requiredErrors.shift ? "border-destructive" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
              {requiredErrors.shift && (
                <p className="text-xs text-destructive">{requiredErrors.shift}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('department')}{config.isRequired('department') && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={department}
                onValueChange={(v) => {
                  setDepartment(v);
                  const dOpt = deptOptions.find((d: any) =>
                    (typeof d === "string" ? d : d.name) === v
                  );
                  setDepartmentId(dOpt && typeof dOpt !== "string" ? (dOpt.id || null) : null);
                  setRequiredErrors((prev) => ({ ...prev, department: "" }));
                }}
              >
                <SelectTrigger
                  className={["h-8 text-sm", requiredErrors.department ? "border-destructive" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deptOptions.length === 0 ? (
                    <SelectItem value="_empty" disabled>Import machines to see departments</SelectItem>
                  ) : deptOptions.map((d: any) => {
                    const name = typeof d === "string" ? d : d.name;
                    return <SelectItem key={name} value={name}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {requiredErrors.department && (
                <p className="text-xs text-destructive">{requiredErrors.department}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('count')}{config.isRequired('count') && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  setRequiredErrors((prev) => ({ ...prev, count: "" }));
                }}
                placeholder="e.g. 30s"
                className={["h-8 text-sm", requiredErrors.count ? "border-destructive" : ""]
                  .filter(Boolean)
                  .join(" ")}
              />
              {requiredErrors.count && (
                <p className="text-xs text-destructive">{requiredErrors.count}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Total Produced</div>
          <div className="text-lg font-semibold mt-1">{summary.totalProduced.toFixed(1)} kg</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Total Waste</div>
          <div className="text-lg font-semibold mt-1">{summary.totalWaste.toFixed(1)} kg</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Running</div>
          <div className="text-lg font-semibold mt-1 text-green-600">
            {summary.running} machines
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">
            Idle / Breakdown
          </div>
          <div className="text-lg font-semibold mt-1 text-amber-600">
            {summary.idle + summary.breakdown} machines
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">
            Machine Grid — {department} · Shift {shift} · {date}
          </CardTitle>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={bulkMutation.isPending || activeCount === 0 || !allHeaderFilled}
          >
            <Save className="size-3.5 mr-1.5" />
            {bulkMutation.isPending ? "Saving…" : `Submit All (${activeCount})`}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center space-y-2">
              <p>
                No machines in <strong>{department}</strong>. Add them in Masters → Machines.
              </p>
              <Link to="/masters" className="text-primary underline text-xs inline-block">
                Go to Masters
              </Link>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px] w-full text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-24 pl-4">{config.getLabel('machine_code')}</TableHead>
                    <TableHead className="w-36">{(() => { const l = config.getLabel('machine_name'); return l === 'machine_name' ? 'name' : l; })()}</TableHead>
                    <TableHead className="w-32">{config.getLabel('operator')}</TableHead>
                    <TableHead className="w-20">{config.getLabel('count')}</TableHead>
                    <TableHead className="w-28">{config.getLabel('produced_kg')}</TableHead>
                    <TableHead className="w-24">{config.getLabel('waste_kg')}</TableHead>
                    <TableHead className="w-28">{config.getLabel('stoppage_mins')}</TableHead>
                    <TableHead className="w-40">{config.getLabel('stoppage_reason')}</TableHead>
                    <TableHead className="w-32">{config.getLabel('machine_status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((row, idx) => {
                    const hasData = Number(row.producedKg) > 0;
                    return (
                      <TableRow
                        key={row.machineCode}
                        className={hasData ? "bg-primary/5" : undefined}
                      >
                        <TableCell className="pl-4 font-mono text-xs font-medium">
                          {row.machineCode}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.machineName}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.operator}
                            onChange={(e) => updateRow(idx, "operator", e.target.value)}
                            placeholder="Name"
                            className="h-7 text-xs w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{count || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={row.producedKg}
                            onChange={(e) => updateRow(idx, "producedKg", e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={row.wasteKg}
                            onChange={(e) => updateRow(idx, "wasteKg", e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={row.stoppageMins}
                            onChange={(e) => updateRow(idx, "stoppageMins", e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.stoppageReason}
                            onChange={(e) => updateRow(idx, "stoppageReason", e.target.value)}
                            placeholder="Reason…"
                            className="h-7 text-xs w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.machineStatus}
                            onValueChange={(v) => updateRow(idx, "machineStatus", v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="running">Running</SelectItem>
                              <SelectItem value="breakdown">Breakdown</SelectItem>
                              <SelectItem value="idle">Idle</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Only rows with Produced kg &gt; 0 will be submitted. Empty rows are ignored.
      </p>
    </div>
  );
}

function ImportShiftEntriesDialog() {
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
        tableName="production_entries"
        endpoint="/production/entries/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["shifts"] })}
        title="Import Production Entries"
      />
    </>
  );
}

function ProductionPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "production");
  const { millId } = useActiveMill();
  const machinesQ = useQuery({
    queryKey: ["machines", millId],
    queryFn: () => productionApi.getMachines({ mill_id: millId }),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const shiftsQ = useQuery({
    queryKey: ["shifts", millId],
    queryFn: productionApi.getEntries,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const downQ = useQuery({
    queryKey: ["downtime", millId],
    queryFn: productionApi.getDowntime,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const { data: machineTypes } = useMillMasterCategory("machine_type");
  const MACHINE_TYPES = (machineTypes?.length ? machineTypes : ["Blowroom", "Carding", "Drawing", "Simplex", "Ring Frame", "Autoconer", "Winding"]);

  const qc = useQueryClient();

  // Shift entry approve/reject
  const approveEntryMutation = useMutation({
    mutationFn: (id: string) => productionApi.approveEntry(id),
    onSuccess: () => {
      toast.success("Entry approved");
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const rejectEntryMutation = useMutation({
    mutationFn: (id: string) => productionApi.rejectEntry(id),
    onSuccess: () => {
      toast.success("Entry rejected");
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Downtime form
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [dtForm, setDtForm] = useState({
    machine_id: "",
    start_time: "",
    end_time: "",
    reason: "",
    category: "",
    notes: "",
  });
  const [dtErrors, setDtErrors] = useState<Record<string, string>>({});
  const createDowntimeMutation = useMutation({
    mutationFn: (data: any) => productionApi.createDowntime(data),
    onSuccess: () => {
      toast.success("Downtime logged");
      setDowntimeOpen(false);
      setDtForm({ machine_id: "", start_time: "", end_time: "", reason: "", category: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["downtime"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((e: any) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ") : detail || err.message || "Failed to log downtime";
      toast.error(msg);
    },
  });
  const handleLogDowntime = () => {
    const errs: Record<string, string> = {};
    if (!dtForm.machine_id) errs.machine_id = "Machine is required";
    if (!dtForm.start_time) errs.start_time = "Start Time is required";
    if (!dtForm.reason) errs.reason = "Reason is required";
    setDtErrors(errs);
    if (Object.keys(errs).length > 0) return;
    createDowntimeMutation.mutate({
      machine_code: dtForm.machine_id,
      reason: dtForm.reason,
      started_at: dtForm.start_time,
      reported_by: user?.name ?? "",
    });
  };

  // Machine edit
  const [machineEditOpen, setMachineEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    code: "", name: "", type: "", make: "", model: "", capacity: "", status: "",
  });
  const [editMachineId, setEditMachineId] = useState<string | null>(null);
  const updateMachineMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      productionApi.updateMachineStatus(id, data),
    onSuccess: () => {
      toast.success("Machine updated");
      setMachineEditOpen(false);
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Machine deactivate
  const deactivateMachineMutation = useMutation({
    mutationFn: (id: string) => productionApi.updateMachineStatus(id, { status: "idle" }),
    onSuccess: () => {
      toast.success("Machine deactivated");
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeactivateMachine = (m: any) => {
    if (window.confirm(`Deactivate machine ${m.code}?`)) {
      deactivateMachineMutation.mutate(m.id);
    }
  };

  const machines = (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[];
  const shifts = (Array.isArray(shiftsQ.data) ? shiftsQ.data : (shiftsQ.data?.data ?? [])) as any[];
  const downtime = (Array.isArray(downQ.data) ? downQ.data : (downQ.data?.data ?? [])) as any[];
  const machineColConfig = useColumnConfig("production_entries");
  const downColConfig = useColumnConfig("production_downtime");

  const totalProduced = machines.reduce(
    (s: number, m: any) => s + (m.produced_kg ?? m.producedKg ?? 0),
    0,
  );
  const totalTarget = machines.reduce(
    (s: number, m: any) => s + (m.target_kg ?? m.targetKg ?? 0),
    0,
  );
  const running = machines.filter((m: any) => (m.current_status ?? m.status) === "running").length;
  const breakdown = machines.filter(
    (m: any) => (m.current_status ?? m.status) === "breakdown",
  ).length;

  const anyError = machinesQ.isError || shiftsQ.isError || downQ.isError;

  if (!user) return null;

  if (machinesQ.isLoading || shiftsQ.isLoading)
    return (
      <>
        <PageHeader title="Production" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (anyError)
    return (
      <>
        <PageHeader title="Production" subtitle="Error" />
        <div className="p-6 text-sm text-destructive space-y-2">
          <p>Failed to load production data.</p>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Shift entries, machine efficiency, downtime & waste tracking"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["machines"] })}
        isRefreshing={machinesQ.isFetching}
      />
      <AccessGuard module="production">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Produced Today
                </div>
                <div className="text-2xl font-semibold mt-2">
                  {fmtNumber(totalProduced)} kg
                </div>
                <Progress
                  value={totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0}
                  className="h-1.5 mt-3"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  of {fmtNumber(totalTarget)} kg target
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Running Machines
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Activity className="size-5 text-success" />
                  {running} / {machines.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Active Breakdowns
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  {breakdown}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Avg Efficiency
                </div>
                <div className="text-2xl font-semibold mt-2">
                  {(totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="entry">
            <TabsList>
              <TabsTrigger value="entry" className="gap-1.5">
                <LayoutGrid className="size-3.5" />
                New Shift Entry
              </TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="shifts">Shift Entries</TabsTrigger>
              <TabsTrigger value="downtime">Downtime</TabsTrigger>
            </TabsList>

            <TabsContent value="entry">
              {canEdit ? (
                <ShiftGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create shift entries.
                </div>
              )}
            </TabsContent>

            <TabsContent value="machines">
              <Card>
                <CardHeader><CardTitle className="text-base">Machine Status</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="production_machines"
                    columns={[
                      { key: "code", label: machineColConfig.getLabel('code'), className: "font-mono text-xs" },
                      { key: "department", label: machineColConfig.getLabel('department'), type: "status" },
                      { key: "target_kg", label: "Target (kg)", render: (m: any) => fmtNumber(m.target_kg ?? m.targetKg) },
                      { key: "produced_kg", label: "Produced (kg)", render: (m: any) => fmtNumber(m.produced_kg ?? m.producedKg) },
                      { key: "efficiency", label: "Efficiency", render: (m: any) => <span className={(m.efficiency ?? 0) >= 85 ? "text-green-600 font-medium" : (m.efficiency ?? 0) >= 70 ? "" : "text-destructive font-medium"}>{m.efficiency ?? 0}%</span> },
                      { key: "current_status", label: machineColConfig.getLabel('machine_status'), type: "status", render: (m: any) => <StatusBadge status={m.current_status ?? m.status ?? "idle"} size="sm" /> },
                    ] satisfies ColDef[]}
                    data={machines}
                    loading={machinesQ.isLoading}
                    rowKey={(m: any) => m.id}
                    exportFilename="machines"
                    actions={(m: any) => (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditForm({
                              code: m.code ?? "",
                              name: m.name ?? "",
                              type: m.type ?? "",
                              make: m.make ?? "",
                              model: m.model ?? "",
                              capacity: m.capacity ?? "",
                              status: m.current_status ?? m.status ?? "",
                            });
                            setEditMachineId(m.id);
                            setMachineEditOpen(true);
                          }}
                        >
                          <Pencil className="size-3 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeactivateMachine(m)}
                        >
                          Deactivate
                        </Button>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
              <Sheet open={machineEditOpen} onOpenChange={setMachineEditOpen}>
                <SheetContent side="right" className="w-96">
                  <SheetHeader>
                    <SheetTitle>Edit Machine</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Code</Label>
                      <Input
                        value={editForm.code}
                        onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={editForm.type}
                        onValueChange={(v) => setEditForm((p) => ({ ...p, type: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {MACHINE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Make</Label>
                      <Input
                        value={editForm.make}
                        onChange={(e) => setEditForm((p) => ({ ...p, make: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input
                        value={editForm.model}
                        onChange={(e) => setEditForm((p) => ({ ...p, model: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Capacity</Label>
                      <Input
                        value={editForm.capacity}
                        onChange={(e) => setEditForm((p) => ({ ...p, capacity: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="running">Active</SelectItem>
                          <SelectItem value="idle">Idle</SelectItem>
                          <SelectItem value="breakdown">Breakdown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <SheetFooter>
                    <Button
                      onClick={() =>
                        editMachineId &&
                        updateMachineMutation.mutate({ id: editMachineId, data: editForm })
                      }
                      disabled={updateMachineMutation.isPending}
                    >
                      {updateMachineMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </TabsContent>

            <TabsContent value="shifts">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Shift Production Entries</CardTitle>
                  {canEdit && <ImportShiftEntriesDialog />}
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="production_shifts"
                    columns={[
                      { key: "date", label: machineColConfig.getLabel('date'), type: "date" },
                      { key: "shift", label: machineColConfig.getLabel('shift'), render: (s: any) => <Badge variant="outline">{s.shift}</Badge> },
                      { key: "machineCode", label: machineColConfig.getLabel('machine_code'), className: "font-mono text-xs" },
                      { key: "department", label: machineColConfig.getLabel('department'), type: "status" },
                      { key: "operator", label: machineColConfig.getLabel('operator') },
                      { key: "count", label: machineColConfig.getLabel('count') },
                      { key: "producedKg", label: machineColConfig.getLabel('produced_kg'), render: (s: any) => `${s.producedKg} kg` },
                      { key: "wasteKg", label: machineColConfig.getLabel('waste_kg'), render: (s: any) => <span className="text-muted-foreground">{s.wasteKg} kg</span> },
                      { key: "status", label: machineColConfig.getLabel('status'), type: "status", render: (s: any) => <StatusBadge status={s.status} size="sm" /> },
                    ] satisfies ColDef[]}
                    data={shifts}
                    loading={shiftsQ.isLoading}
                    rowKey={(s: any) => s.id}
                    exportFilename="shift_entries"
                    actions={(s: any) =>
                      s.status === "pending" ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveEntryMutation.mutate(s.id)}
                            disabled={approveEntryMutation.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectEntryMutation.mutate(s.id)}
                            disabled={rejectEntryMutation.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="downtime">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Downtime Logs</CardTitle>
                  <Button size="sm" onClick={() => setDowntimeOpen(true)}>
                    <Plus className="size-3.5 mr-1" /> Log Downtime
                  </Button>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="production_downtime"
                    columns={[
                      { key: "machineCode", label: "Machine", className: "font-mono text-xs" },
                      { key: "reason", label: "Reason" },
                      { key: "startedAt", label: "Started" },
                      { key: "durationMin", label: "Duration", render: (d: any) => `${d.durationMin} min` },
                      { key: "resolved", label: "Status", type: "status", render: (d: any) => <StatusBadge status={d.resolved ? "active" : "down"} label={d.resolved ? "Resolved" : "Open"} size="sm" /> },
                    ] satisfies ColDef[]}
                    data={downtime}
                    loading={downQ.isLoading}
                    rowKey={(d: any) => d.id}
                    exportFilename="downtime_logs"
                  />
                </CardContent>
              </Card>
              <Sheet open={downtimeOpen} onOpenChange={setDowntimeOpen}>
                <SheetContent side="right" className="w-96">
                  <SheetHeader>
                    <SheetTitle>Log Downtime</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Machine</Label>
                      <Select
                        value={dtForm.machine_id}
                        onValueChange={(v) => { setDtForm((p) => ({ ...p, machine_id: v })); setDtErrors((p) => ({ ...p, machine_id: "" })); }}
                      >
                        <SelectTrigger className={dtErrors.machine_id ? "border-destructive" : ""}><SelectValue placeholder="Select machine" /></SelectTrigger>
                        <SelectContent>
                          {machines.filter((m: any) => m?.id).map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.code} — {m.name ?? ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {dtErrors.machine_id && <p className="text-xs text-destructive">{dtErrors.machine_id}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="datetime-local"
                        value={dtForm.start_time}
                        onChange={(e) => { setDtForm((p) => ({ ...p, start_time: e.target.value })); setDtErrors((p) => ({ ...p, start_time: "" })); }}
                        className={dtErrors.start_time ? "border-destructive" : ""}
                      />
                      {dtErrors.start_time && <p className="text-xs text-destructive">{dtErrors.start_time}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="datetime-local"
                        value={dtForm.end_time}
                        onChange={(e) => setDtForm((p) => ({ ...p, end_time: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Input
                        value={dtForm.reason}
                        onChange={(e) => { setDtForm((p) => ({ ...p, reason: e.target.value })); setDtErrors((p) => ({ ...p, reason: "" })); }}
                        placeholder="Reason for downtime"
                        className={dtErrors.reason ? "border-destructive" : ""}
                      />
                      {dtErrors.reason && <p className="text-xs text-destructive">{dtErrors.reason}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={dtForm.category}
                        onValueChange={(v) => setDtForm((p) => ({ ...p, category: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mechanical">Mechanical</SelectItem>
                          <SelectItem value="Electrical">Electrical</SelectItem>
                          <SelectItem value="Power">Power</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={dtForm.notes}
                        onChange={(e) => setDtForm((p) => ({ ...p, notes: e.target.value }))}
                        placeholder="Additional notes…"
                      />
                    </div>
                  </div>
                  <SheetFooter>
                    <Button
                      onClick={handleLogDowntime}
                      disabled={createDowntimeMutation.isPending}
                    >
                      {createDowntimeMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}
