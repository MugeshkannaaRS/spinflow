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
import { Activity, AlertTriangle, CheckCircle2, Save, LayoutGrid, Plus, Pencil, ArrowDownToLine, Trash2, Clock, Users2 } from "lucide-react";
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
      page_size: 1000,
      page: 1,
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

// ─────────────────────────────────────────────────────────────────
// WASTE ENTRY TAB
// ─────────────────────────────────────────────────────────────────

type WasteRow = { machineCode: string; machineName: string; lotNo: string; ratio: string; targetKg: string; wasteKg: string; remarks: string };

function buildWasteRows(machines: any[]): WasteRow[] {
  return (machines ?? []).map((m: any) => ({
    machineCode: m.code ?? "",
    machineName: m.name ?? m.code ?? "",
    lotNo: "", ratio: "", targetKg: "", wasteKg: "", remarks: "",
  }));
}

function WasteGrid() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const { data: millMasters } = useMillMasters();
  const deptOptions = millMasters?.department ?? [];
  const [department, setDepartment] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const first = deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions]);

  const machinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId],
    queryFn: () => productionApi.getMachines({
      ...(departmentId ? { department_id: departmentId } : { department }),
      mill_id: millId, page_size: 1000, page: 1,
    }),
    staleTime: 60_000,
    enabled: !!millId && !!(departmentId || department),
  });
  const machines = useMemo(
    () => (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[],
    [machinesQ.data],
  );
  const [rows, setRows] = useState<WasteRow[]>(() => buildWasteRows(machines));
  useEffect(() => { setRows(buildWasteRows(machines)); }, [machines]);

  const updateWasteRow = (idx: number, field: keyof WasteRow, value: string) => {
    setRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const summary = useMemo(() => ({
    totalWaste: rows.reduce((s, r) => s + (Number(r.wasteKg) || 0), 0),
    filled: rows.filter((r) => Number(r.wasteKg) > 0).length,
  }), [rows]);

  const bulkMutation = useMutation({
    mutationFn: () => {
      const active = rows.filter((r) => Number(r.wasteKg) >= 0 && r.machineCode);
      if (!date || !shift || !department) throw new Error("Date, Shift and Department are required");
      if (active.length === 0) throw new Error("No rows to submit");
      return productionApi.createWasteBulk({
        date, shift, department,
        entries: active.map((r) => ({
          machine_code: r.machineCode,
          lot_no: r.lotNo || undefined,
          ratio: r.ratio || undefined,
          target_kg: r.targetKg ? Number(r.targetKg) : undefined,
          waste_kg: Number(r.wasteKg) || 0,
          remarks: r.remarks || undefined,
        })),
      });
    },
    onSuccess: (res: any) => {
      toast.success(`${res.created} waste entries submitted`);
      if (res.errors?.length) res.errors.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["waste-entries"] });
      setRows(buildWasteRows(machines));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = "Required";
    if (!shift) errs.shift = "Required";
    if (!department) errs.dept = "Required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    bulkMutation.mutate();
  };

  // Past entries
  const entriesQ = useQuery({
    queryKey: ["waste-entries", date, shift, department, millId],
    queryFn: () => productionApi.getWasteEntries({ date, shift, department, mill_id: millId, page_size: 200 }),
    staleTime: 30_000,
    enabled: !!millId && !!date,
  });
  const pastEntries = (entriesQ.data?.data ?? []) as any[];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className={["h-8 text-sm", errors.date ? "border-destructive" : ""].filter(Boolean).join(" ")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift *</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as "A"|"B"|"C")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department *</Label>
              <Select value={department} onValueChange={(v) => {
                setDepartment(v);
                const d = deptOptions.find((x: any) => (typeof x === "string" ? x : x.name) === v);
                setDepartmentId(d && typeof d !== "string" ? (d.id || null) : null);
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {deptOptions.map((d: any) => {
                    const name = typeof d === "string" ? d : d.name;
                    return <SelectItem key={name} value={name}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Total Waste</div>
          <div className="text-lg font-semibold mt-1">{summary.totalWaste.toFixed(2)} kg</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Machines Filled</div>
          <div className="text-lg font-semibold mt-1">{summary.filled} / {rows.length}</div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Waste Entry — {department} · Shift {shift} · {date}</CardTitle>
          <Button size="sm" onClick={handleSubmit} disabled={bulkMutation.isPending || summary.filled === 0}>
            <Save className="size-3.5 mr-1.5" />
            {bulkMutation.isPending ? "Saving…" : `Submit (${summary.filled})`}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No machines in <strong>{department}</strong>. Add them in Masters → Machines.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[800px] w-full text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-24 pl-4">Machine</TableHead>
                    <TableHead className="w-36">Lot No</TableHead>
                    <TableHead className="w-28">Ratio</TableHead>
                    <TableHead className="w-28">Target (kg)</TableHead>
                    <TableHead className="w-28">Waste (kg) *</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={row.machineCode} className={Number(row.wasteKg) > 0 ? "bg-amber-50/50" : undefined}>
                      <TableCell className="pl-4 font-mono text-xs font-medium">{row.machineCode}</TableCell>
                      <TableCell>
                        <Input value={row.lotNo} onChange={(e) => updateWasteRow(idx, "lotNo", e.target.value)}
                          placeholder="e.g. L001" className="h-7 text-xs w-full" />
                      </TableCell>
                      <TableCell>
                        <Input value={row.ratio} onChange={(e) => updateWasteRow(idx, "ratio", e.target.value)}
                          placeholder="60:40" className="h-7 text-xs w-full" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} value={row.targetKg} onChange={(e) => updateWasteRow(idx, "targetKg", e.target.value)}
                          placeholder="0" className="h-7 text-xs w-full" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} step="0.01" value={row.wasteKg}
                          onChange={(e) => updateWasteRow(idx, "wasteKg", e.target.value)}
                          placeholder="0" className="h-7 text-xs w-full" />
                      </TableCell>
                      <TableCell>
                        <Input value={row.remarks} onChange={(e) => updateWasteRow(idx, "remarks", e.target.value)}
                          placeholder="Remarks…" className="h-7 text-xs w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pastEntries.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Submitted Entries — {date} · {shift}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="text-sm min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Machine</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Target kg</TableHead>
                    <TableHead>Waste kg</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastEntries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 font-mono text-xs">{e.machine_code}</TableCell>
                      <TableCell className="text-xs">{e.lot_no || "—"}</TableCell>
                      <TableCell className="text-xs">{e.target_kg ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{e.waste_kg} kg</TableCell>
                      <TableCell><StatusBadge status={e.status} size="sm" /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.entered_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STOPPAGE / DATALOG TAB
// ─────────────────────────────────────────────────────────────────

const STOP_CATEGORIES: Record<string, string> = {
  normal:                  "Normal",
  planned:                 "Planned",
  breakdown_mechanical:    "Breakdown — Mechanical",
  breakdown_electrical:    "Breakdown — Electrical",
  production_change:       "Production Change",
  quality:                 "Quality",
  utility:                 "Utility",
  misc:                    "Misc",
};

function StoppageForm() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    machine_code: "", section: "", datalog_code: "",
    stop_from: "", stop_to: "", production_loss_kg: "", remarks: "",
  });
  const setField = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  const stopCodesQ = useQuery({
    queryKey: ["stop-codes"],
    queryFn: productionApi.getStopCodes,
    staleTime: 5 * 60_000,
  });
  const stopCodes = (stopCodesQ.data ?? []) as any[];

  const filteredCodes = useMemo(() => {
    if (selectedCategory === "all") return stopCodes;
    return stopCodes.filter((c) => c.category === selectedCategory);
  }, [stopCodes, selectedCategory]);

  const machinesQ = useQuery({
    queryKey: ["machines", "all", millId],
    queryFn: () => productionApi.getMachines({ mill_id: millId, page_size: 1000, page: 1 }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machines = (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[];

  const logMutation = useMutation({
    mutationFn: () => {
      if (!form.machine_code) throw new Error("Machine is required");
      if (!form.datalog_code) throw new Error("DATALOG code is required");
      return productionApi.logDatalogDowntime({
        machine_code: form.machine_code,
        datalog_code: Number(form.datalog_code),
        stop_from: form.stop_from || undefined,
        stop_to: form.stop_to || undefined,
        date,
        shift,
        production_loss_kg: form.production_loss_kg ? Number(form.production_loss_kg) : 0,
        remarks: form.remarks || undefined,
      }, millId ?? "");
    },
    onSuccess: (res: any) => {
      toast.success(`Stoppage logged — [${res.datalog_code}] ${res.code_name} · ${res.duration_min} min`);
      setForm({ machine_code: "", section: "", datalog_code: "", stop_from: "", stop_to: "", production_loss_kg: "", remarks: "" });
      qc.invalidateQueries({ queryKey: ["downtime"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : err.message || "Failed to log stoppage");
    },
  });

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!form.machine_code) errs.machine_code = "Required";
    if (!form.datalog_code) errs.datalog_code = "Required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    logMutation.mutate();
  };

  const selectedCode = stopCodes.find((c) => String(c.code) === form.datalog_code);
  const totalMin = useMemo(() => {
    if (!form.stop_from || !form.stop_to) return null;
    const [fh, fm] = form.stop_from.split(":").map(Number);
    const [th, tm] = form.stop_to.split(":").map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    return diff > 0 ? diff : null;
  }, [form.stop_from, form.stop_to]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            Log Stoppage — DATALOG Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Header row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as "A"|"B"|"C")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Machine *</Label>
              <Select value={form.machine_code} onValueChange={(v) => setField("machine_code", v)}>
                <SelectTrigger className={["h-8 text-sm", errors.machine_code ? "border-destructive" : ""].filter(Boolean).join(" ")}>
                  <SelectValue placeholder="Select machine" />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((m: any) => (
                    <SelectItem key={m.code} value={m.code}>{m.code}{m.name ? ` — ${m.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.machine_code && <p className="text-xs text-destructive">{errors.machine_code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Section / Frame</Label>
              <Input value={form.section} onChange={(e) => setField("section", e.target.value)}
                placeholder="e.g. A1" className="h-8 text-sm" />
            </div>
          </div>

          {/* DATALOG code picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">DATALOG Stop Code *</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-7 text-xs w-52">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(STOP_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={["grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3 rounded-lg border",
              errors.datalog_code ? "border-destructive" : "bg-muted/30"].filter(Boolean).join(" ")}>
              {stopCodesQ.isLoading ? (
                <div className="col-span-4 text-xs text-muted-foreground py-2">Loading codes…</div>
              ) : filteredCodes.length === 0 ? (
                <div className="col-span-4 text-xs text-muted-foreground py-2">No codes in this category</div>
              ) : filteredCodes.map((c: any) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setField("datalog_code", String(c.code))}
                  className={[
                    "text-left px-3 py-2 rounded-md border text-xs transition-all",
                    form.datalog_code === String(c.code)
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "bg-card hover:bg-accent border-border",
                  ].join(" ")}
                >
                  <span className="font-mono font-bold mr-1">{c.code}</span>
                  <span className="block text-[11px] mt-0.5 opacity-80 truncate">{c.name}</span>
                </button>
              ))}
            </div>
            {errors.datalog_code && <p className="text-xs text-destructive">{errors.datalog_code}</p>}
            {selectedCode && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                Selected: <strong>[{selectedCode.code}] {selectedCode.name}</strong>
                {selectedCode.category && <> · <span className="text-primary">{STOP_CATEGORIES[selectedCode.category] ?? selectedCode.category}</span></>}
              </div>
            )}
          </div>

          {/* Time + loss */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From (HH:MM)</Label>
              <Input type="time" value={form.stop_from} onChange={(e) => setField("stop_from", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To (HH:MM)</Label>
              <Input type="time" value={form.stop_to} onChange={(e) => setField("stop_to", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Total Min</Label>
              <div className="h-8 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-medium">
                {totalMin !== null ? `${totalMin} min` : "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Production Loss (kg)</Label>
              <Input type="number" min={0} step="0.01" value={form.production_loss_kg}
                onChange={(e) => setField("production_loss_kg", e.target.value)}
                placeholder="0" className="h-8 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)}
              placeholder="Additional details…" className="text-sm min-h-[60px]" />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={logMutation.isPending} className="gap-2">
              <CheckCircle2 className="size-4" />
              {logMutation.isPending ? "Logging…" : "Log Stoppage"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MANPOWER TAB — RF Common Category
// ─────────────────────────────────────────────────────────────────

const RF_CATEGORIES = [
  { key: "line_man",             label: "Line Man" },
  { key: "doffer",               label: "Doffer" },
  { key: "house_keeper",         label: "House Keeper" },
  { key: "pneumafil_collection", label: "Pneumafil Collection" },
  { key: "floor_cleaner",        label: "Floor Cleaner" },
  { key: "gripperman",           label: "Gripperman" },
  { key: "cope_carrier",         label: "Cope Carrier" },
  { key: "robo_doffer",          label: "Robo Doffer" },
  { key: "roving_carrier",       label: "Roving Carrier" },
  { key: "maintenance_assi",     label: "Maintenance Assistant" },
];

type ManpowerRow = {
  category: string;
  categoryLabel: string;
  mcIdFrom: string;
  mcIdTo: string;
  totalMachines: string;
  headcount: string;
  supervisor: string;
};

function ManpowerGrid() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [rows, setRows] = useState<ManpowerRow[]>(() =>
    RF_CATEGORIES.map((c) => ({
      category: c.key, categoryLabel: c.label,
      mcIdFrom: "", mcIdTo: "", totalMachines: "", headcount: "", supervisor: "",
    }))
  );

  const updateRow = (idx: number, field: keyof ManpowerRow, value: string) => {
    setRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const totalHeadcount = useMemo(() => rows.reduce((s, r) => s + (Number(r.headcount) || 0), 0), [rows]);

  // Load existing plan on date+shift change
  const existingQ = useQuery({
    queryKey: ["rf-manpower", date, shift, millId],
    queryFn: () => productionApi.getRFManpower({ date, shift, mill_id: millId }),
    staleTime: 30_000,
    enabled: !!millId && !!date,
  });

  useEffect(() => {
    const existing = existingQ.data?.data ?? [];
    if (!existing.length) return;
    setRows((prev) => prev.map((row) => {
      const match = existing.find((e: any) => e.category === row.category);
      if (!match) return row;
      return {
        ...row,
        mcIdFrom: match.mc_id_from ?? "",
        mcIdTo: match.mc_id_to ?? "",
        totalMachines: String(match.total_machines ?? ""),
        headcount: String(match.headcount ?? ""),
        supervisor: match.supervisor ?? "",
      };
    }));
  }, [existingQ.data]);

  const bulkMutation = useMutation({
    mutationFn: () => {
      const filled = rows.filter((r) => Number(r.headcount) > 0 || r.mcIdFrom);
      if (!date || !shift) throw new Error("Date and Shift are required");
      return productionApi.upsertRFManpowerBulk({
        date, shift,
        rows: filled.map((r) => ({
          category: r.category,
          mc_id_from: r.mcIdFrom || undefined,
          mc_id_to: r.mcIdTo || undefined,
          total_machines: r.totalMachines ? Number(r.totalMachines) : 0,
          headcount: Number(r.headcount) || 0,
          supervisor: r.supervisor || undefined,
        })),
      }, millId ?? "");
    },
    onSuccess: (res: any) => {
      toast.success(`${res.upserted} manpower rows saved`);
      if (res.errors?.length) res.errors.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["rf-manpower"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = "Required";
    if (!shift) errs.shift = "Required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    bulkMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: "" })); }}
                className={["h-8 text-sm", errors.date ? "border-destructive" : ""].filter(Boolean).join(" ")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift *</Label>
              <Select value={shift} onValueChange={(v) => { setShift(v as "A"|"B"|"C"); setErrors((p) => ({ ...p, shift: "" })); }}>
                <SelectTrigger className={["h-8 text-sm", errors.shift ? "border-destructive" : ""].filter(Boolean).join(" ")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-card p-3 flex flex-col justify-center">
              <div className="text-xs text-muted-foreground">Total Headcount</div>
              <div className="text-xl font-semibold mt-0.5">{totalHeadcount} workers</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users2 className="size-4 text-muted-foreground" />
            Ring Frame — Common Category Manpower Plan
          </CardTitle>
          <Button size="sm" onClick={handleSubmit} disabled={bulkMutation.isPending}>
            <Save className="size-3.5 mr-1.5" />
            {bulkMutation.isPending ? "Saving…" : "Save Plan"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[720px] w-full text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4 w-52">Category</TableHead>
                  <TableHead className="w-28">MC From</TableHead>
                  <TableHead className="w-28">MC To</TableHead>
                  <TableHead className="w-28">Total Machines</TableHead>
                  <TableHead className="w-28">Headcount</TableHead>
                  <TableHead>Supervisor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.category} className={Number(row.headcount) > 0 ? "bg-primary/5" : undefined}>
                    <TableCell className="pl-4 font-medium text-xs">{row.categoryLabel}</TableCell>
                    <TableCell>
                      <Input value={row.mcIdFrom} onChange={(e) => updateRow(idx, "mcIdFrom", e.target.value)}
                        placeholder="RF_001" className="h-7 text-xs w-full" />
                    </TableCell>
                    <TableCell>
                      <Input value={row.mcIdTo} onChange={(e) => updateRow(idx, "mcIdTo", e.target.value)}
                        placeholder="RF_010" className="h-7 text-xs w-full" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={row.totalMachines}
                        onChange={(e) => updateRow(idx, "totalMachines", e.target.value)}
                        placeholder="0" className="h-7 text-xs w-full" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={row.headcount}
                        onChange={(e) => updateRow(idx, "headcount", e.target.value)}
                        placeholder="0" className="h-7 text-xs w-full font-medium" />
                    </TableCell>
                    <TableCell>
                      <Input value={row.supervisor} onChange={(e) => updateRow(idx, "supervisor", e.target.value)}
                        placeholder="Name" className="h-7 text-xs w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Rows auto-load if a plan already exists for this date + shift. Saving overwrites existing entries.
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
    queryFn: () => productionApi.getMachines({ mill_id: millId, page_size: 1000, page: 1 }),
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

  const todayStr = new Date().toISOString().split("T")[0];
  const totalProduced = shifts
    .filter((s: any) => s.date === todayStr && s.status === "approved")
    .reduce((acc: number, s: any) => acc + (Number(s.produced_kg) || 0), 0);
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
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="entry" className="gap-1.5">
                <LayoutGrid className="size-3.5" />
                Shift Entry
              </TabsTrigger>
              <TabsTrigger value="waste" className="gap-1.5">
                <Trash2 className="size-3.5" />
                Waste Entry
              </TabsTrigger>
              <TabsTrigger value="stoppage" className="gap-1.5">
                <Clock className="size-3.5" />
                Stoppage
              </TabsTrigger>
              <TabsTrigger value="manpower" className="gap-1.5">
                <Users2 className="size-3.5" />
                Manpower
              </TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="shifts">Entries Log</TabsTrigger>
              <TabsTrigger value="downtime">Downtime Log</TabsTrigger>
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

            <TabsContent value="waste">
              {canEdit ? (
                <WasteGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create waste entries.
                </div>
              )}
            </TabsContent>

            <TabsContent value="stoppage">
              {canEdit ? (
                <StoppageForm />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to log stoppages.
                </div>
              )}
            </TabsContent>

            <TabsContent value="manpower">
              {canEdit ? (
                <ManpowerGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to manage manpower plans.
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
                      { key: "machine_code", label: machineColConfig.getLabel('machine_code'), className: "font-mono text-xs" },
                      { key: "department", label: machineColConfig.getLabel('department'), type: "status" },
                      { key: "operator", label: machineColConfig.getLabel('operator') },
                      { key: "count", label: machineColConfig.getLabel('count') },
                      { key: "produced_kg", label: machineColConfig.getLabel('produced_kg'), render: (s: any) => `${s.produced_kg ?? 0} kg` },
                      { key: "waste_kg", label: machineColConfig.getLabel('waste_kg'), render: (s: any) => <span className="text-muted-foreground">{s.waste_kg ?? 0} kg</span> },
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
                      { key: "machine_code", label: "Machine", className: "font-mono text-xs" },
                      { key: "reason", label: "Reason" },
                      { key: "started_at", label: "Started" },
                      { key: "duration_min", label: "Duration", render: (d: any) => `${d.duration_min ?? 0} min` },
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
