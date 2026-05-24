import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api-service";
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
import { Progress } from "@/components/ui/progress";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Save, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_app/production")({
  head: () => ({ meta: [{ title: "Production — SpinFlow ERP" }] }),
  component: ProductionPage,
});

const DEPARTMENTS = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Winding",
  "Quality",
];

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
  return machines.map((m: any) => ({
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
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [department, setDepartment] = useState(DEPARTMENTS[4]);
  const [count, setCount] = useState("30s");

  const machinesQ = useQuery({
    queryKey: ["machines", department],
    queryFn: () => productionApi.getMachines({ department }),
    staleTime: 60_000,
  });

  const machines = (machinesQ.data ?? []) as any[];
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
                Date <span className="text-destructive">*</span>
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
                Shift <span className="text-destructive">*</span>
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
                Department <span className="text-destructive">*</span>
              </Label>
              <Select
                value={department}
                onValueChange={(v) => {
                  setDepartment(v);
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
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {requiredErrors.department && (
                <p className="text-xs text-destructive">{requiredErrors.department}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Count / Yarn <span className="text-destructive">*</span>
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
                    <TableHead className="w-24 pl-4">Code</TableHead>
                    <TableHead className="w-36">Name</TableHead>
                    <TableHead className="w-32">Operator</TableHead>
                    <TableHead className="w-20">Count</TableHead>
                    <TableHead className="w-28">Produced kg</TableHead>
                    <TableHead className="w-24">Waste kg</TableHead>
                    <TableHead className="w-28">Stoppage min</TableHead>
                    <TableHead className="w-40">Stoppage Reason</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
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

function ProductionPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "production");
  const machinesQ = useQuery({
    queryKey: ["machines"],
    queryFn: productionApi.getMachines,
    staleTime: 60_000,
    retry: 1,
  });
  const shiftsQ = useQuery({
    queryKey: ["shifts"],
    queryFn: productionApi.getEntries,
    staleTime: 60_000,
    retry: 1,
  });
  const downQ = useQuery({
    queryKey: ["downtime"],
    queryFn: productionApi.getDowntime,
    staleTime: 60_000,
    retry: 1,
  });

  const machines = (machinesQ.data?.data ?? machinesQ.data ?? []) as any[];
  const shifts = (shiftsQ.data?.data ?? shiftsQ.data ?? []) as any[];
  const downtime = (downQ.data?.data ?? downQ.data ?? []) as any[];

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

  if (!user) return null;

  if (machinesQ.isLoading)
    return (
      <>
        <Topbar title="Production" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (machinesQ.isError)
    return (
      <>
        <Topbar title="Production" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Production"
        subtitle="Shift entries, machine efficiency, downtime & waste tracking"
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
                  {totalProduced.toLocaleString()} kg
                </div>
                <Progress
                  value={totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0}
                  className="h-1.5 mt-3"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  of {totalTarget.toLocaleString()} kg target
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
                      { key: "code", label: "Code", className: "font-mono text-xs" },
                      { key: "department", label: "Department", type: "status" },
                      { key: "target_kg", label: "Target (kg)", render: (m: any) => ((m.target_kg ?? m.targetKg) ?? 0).toLocaleString() },
                      { key: "produced_kg", label: "Produced (kg)", render: (m: any) => ((m.produced_kg ?? m.producedKg) ?? 0).toLocaleString() },
                      { key: "efficiency", label: "Efficiency", render: (m: any) => <span className={(m.efficiency ?? 0) >= 85 ? "text-green-600 font-medium" : (m.efficiency ?? 0) >= 70 ? "" : "text-destructive font-medium"}>{m.efficiency ?? 0}%</span> },
                      { key: "current_status", label: "Status", type: "status", render: (m: any) => <Badge variant={(m.current_status ?? m.status) === "running" ? "default" : (m.current_status ?? m.status) === "breakdown" ? "destructive" : "secondary"}>{m.current_status ?? m.status}</Badge> },
                    ] satisfies ColDef[]}
                    data={machines}
                    loading={machinesQ.isLoading}
                    rowKey={(m: any) => m.id}
                    exportFilename="machines"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shifts">
              <Card>
                <CardHeader><CardTitle className="text-base">Shift Production Entries</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="production_shifts"
                    columns={[
                      { key: "date", label: "Date", type: "date" },
                      { key: "shift", label: "Shift", render: (s: any) => <Badge variant="outline">{s.shift}</Badge> },
                      { key: "machineCode", label: "Machine", className: "font-mono text-xs" },
                      { key: "department", label: "Department", type: "status" },
                      { key: "operator", label: "Operator" },
                      { key: "count", label: "Count" },
                      { key: "producedKg", label: "Produced", render: (s: any) => `${s.producedKg} kg` },
                      { key: "wasteKg", label: "Waste", render: (s: any) => <span className="text-muted-foreground">{s.wasteKg} kg</span> },
                      { key: "status", label: "Status", type: "status", render: (s: any) => <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>{s.status === "approved" && <CheckCircle2 className="size-3 mr-1 inline" />}{s.status}</Badge> },
                    ] satisfies ColDef[]}
                    data={shifts}
                    loading={shiftsQ.isLoading}
                    rowKey={(s: any) => s.id}
                    exportFilename="shift_entries"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="downtime">
              <Card>
                <CardHeader><CardTitle className="text-base">Downtime Logs</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="production_downtime"
                    columns={[
                      { key: "machineCode", label: "Machine", className: "font-mono text-xs" },
                      { key: "reason", label: "Reason" },
                      { key: "startedAt", label: "Started" },
                      { key: "durationMin", label: "Duration", render: (d: any) => `${d.durationMin} min` },
                      { key: "resolved", label: "Status", type: "status", render: (d: any) => <Badge variant={d.resolved ? "default" : "destructive"}>{d.resolved ? "Resolved" : "Open"}</Badge> },
                    ] satisfies ColDef[]}
                    data={downtime}
                    loading={downQ.isLoading}
                    rowKey={(d: any) => d.id}
                    exportFilename="downtime_logs"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}
