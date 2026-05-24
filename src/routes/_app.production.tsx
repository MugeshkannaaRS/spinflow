import { createFileRoute } from "@tanstack/react-router";
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
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
import { useColumnConfig } from "@/hooks/useColumnConfig";
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

function buildRows(machines: any[], dept: string): GridRow[] {
  return machines
    .filter((m: any) => !dept || (m.department ?? "") === dept)
    .map((m: any) => ({
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

function ShiftGrid({ machines }: { machines: any[] }) {
  const qc = useQueryClient();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [department, setDepartment] = useState(DEPARTMENTS[4]);
  const [count, setCount] = useState("30s");
  const [rows, setRows] = useState<GridRow[]>(() => buildRows(machines, DEPARTMENTS[4]));

  useEffect(() => {
    setRows(buildRows(machines, department));
  }, [department, machines]);

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
      setRows(buildRows(machines, department));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeCount = rows.filter((r) => Number(r.producedKg) > 0).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as "A" | "B" | "C")}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="h-8 text-sm">
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Count / Yarn</Label>
              <Input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g. 30s"
                className="h-8 text-sm"
              />
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
          <div className="text-lg font-semibold mt-1 text-green-600">{summary.running} machines</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground uppercase font-medium">Idle / Breakdown</div>
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
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending || activeCount === 0}
          >
            <Save className="size-3.5 mr-1.5" />
            {bulkMutation.isPending ? "Saving…" : `Submit All (${activeCount})`}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No machines found for {department}. Add machines in the Machines tab first.
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
                            onValueChange={(v) =>
                              updateRow(idx, "machineStatus", v)
                            }
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
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "MILL_OWNER";
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

  const [machineFiltered, setMachineFiltered] = useState<any[]>([]);
  const [shiftFiltered, setShiftFiltered] = useState<any[]>([]);
  const [downFiltered, setDownFiltered] = useState<any[]>([]);

  useEffect(() => {
    setMachineFiltered((machinesQ.data?.data ?? machinesQ.data ?? []) as any[]);
  }, [machinesQ.data]);
  useEffect(() => {
    setShiftFiltered((shiftsQ.data?.data ?? shiftsQ.data ?? []) as any[]);
  }, [shiftsQ.data]);
  useEffect(() => {
    setDownFiltered((downQ.data?.data ?? downQ.data ?? []) as any[]);
  }, [downQ.data]);

  const { visibleKeys: mvk } = useColumnConfig("production", "machines");
  const { visibleKeys: svk } = useColumnConfig("production", "shifts");
  const { visibleKeys: dvk } = useColumnConfig("production", "downtime");

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

  const machineColumns = [
    { key: "code", label: "Code" },
    { key: "department", label: "Department" },
    { key: "status", label: "Status" },
  ];
  const shiftColumns = [
    { key: "date", label: "Date" },
    { key: "shift", label: "Shift" },
    { key: "machineCode", label: "Machine" },
    { key: "operator", label: "Operator" },
    { key: "department", label: "Department" },
    { key: "status", label: "Status" },
  ];
  const downColumns = [
    { key: "machineCode", label: "Machine" },
    { key: "reason", label: "Reason" },
    { key: "resolved", label: "Status" },
  ];

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
                <ShiftGrid machines={machines} />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create shift entries.
                </div>
              )}
            </TabsContent>

            <TabsContent value="machines">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Machine Status</CardTitle>
                  {isAdmin && <ColumnConfigurator module="production" tableKey="machines" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={machines}
                    onFilter={setMachineFiltered}
                    columns={machineColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {mvk.has("code") && <TableHead>Code</TableHead>}
                          {mvk.has("department") && <TableHead>Department</TableHead>}
                          {mvk.has("status") && <TableHead>Status</TableHead>}
                          {mvk.has("targetKg") && (
                            <TableHead className="text-right">Target (kg)</TableHead>
                          )}
                          {mvk.has("producedKg") && (
                            <TableHead className="text-right">Produced (kg)</TableHead>
                          )}
                          {mvk.has("efficiency") && (
                            <TableHead className="text-right">Efficiency</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {machineFiltered.map((m) => (
                          <TableRow key={m.id}>
                            {mvk.has("code") && (
                              <TableCell className="font-mono text-xs">{m.code}</TableCell>
                            )}
                            {mvk.has("department") && <TableCell>{m.department}</TableCell>}
                            {mvk.has("status") && (
                              <TableCell>
                                <Badge
                                  variant={
                                    (m.current_status ?? m.status) === "running"
                                      ? "default"
                                      : (m.current_status ?? m.status) === "breakdown"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {m.current_status ?? m.status}
                                </Badge>
                              </TableCell>
                            )}
                            {mvk.has("targetKg") && (
                              <TableCell className="text-right">
                                {(m.target_kg ?? m.targetKg)?.toLocaleString?.() ??
                                  m.target_kg ??
                                  m.targetKg}
                              </TableCell>
                            )}
                            {mvk.has("producedKg") && (
                              <TableCell className="text-right">
                                {(m.produced_kg ?? m.producedKg)?.toLocaleString?.() ??
                                  m.produced_kg ??
                                  m.producedKg}
                              </TableCell>
                            )}
                            {mvk.has("efficiency") && (
                              <TableCell className="text-right">
                                <span
                                  className={
                                    (m.efficiency ?? 0) >= 85
                                      ? "text-success font-medium"
                                      : (m.efficiency ?? 0) >= 70
                                        ? ""
                                        : "text-destructive font-medium"
                                  }
                                >
                                  {m.efficiency ?? 0}%
                                </span>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shifts">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Shift Production Entries</CardTitle>
                  {isAdmin && <ColumnConfigurator module="production" tableKey="shifts" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={shifts}
                    onFilter={setShiftFiltered}
                    columns={shiftColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {svk.has("date") && <TableHead>Date</TableHead>}
                          {svk.has("shift") && <TableHead>Shift</TableHead>}
                          {svk.has("machineCode") && <TableHead>Machine</TableHead>}
                          {svk.has("department") && <TableHead>Department</TableHead>}
                          {svk.has("operator") && <TableHead>Operator</TableHead>}
                          {svk.has("count") && <TableHead>Count</TableHead>}
                          {svk.has("producedKg") && (
                            <TableHead className="text-right">Produced</TableHead>
                          )}
                          {svk.has("wasteKg") && (
                            <TableHead className="text-right">Waste</TableHead>
                          )}
                          {svk.has("status") && <TableHead>Status</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shiftFiltered.map((s) => (
                          <TableRow key={s.id}>
                            {svk.has("date") && <TableCell className="text-sm">{s.date}</TableCell>}
                            {svk.has("shift") && (
                              <TableCell>
                                <Badge variant="outline">{s.shift}</Badge>
                              </TableCell>
                            )}
                            {svk.has("machineCode") && (
                              <TableCell className="font-mono text-xs">{s.machineCode}</TableCell>
                            )}
                            {svk.has("department") && <TableCell>{s.department}</TableCell>}
                            {svk.has("operator") && <TableCell>{s.operator}</TableCell>}
                            {svk.has("count") && <TableCell>{s.count}</TableCell>}
                            {svk.has("producedKg") && (
                              <TableCell className="text-right">{s.producedKg} kg</TableCell>
                            )}
                            {svk.has("wasteKg") && (
                              <TableCell className="text-right text-muted-foreground">
                                {s.wasteKg} kg
                              </TableCell>
                            )}
                            {svk.has("status") && (
                              <TableCell>
                                <Badge
                                  variant={
                                    s.status === "approved"
                                      ? "default"
                                      : s.status === "rejected"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {s.status === "approved" && (
                                    <CheckCircle2 className="size-3 mr-1" />
                                  )}
                                  {s.status}
                                </Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="downtime">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Downtime Logs</CardTitle>
                  {isAdmin && <ColumnConfigurator module="production" tableKey="downtime" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={downtime}
                    onFilter={setDownFiltered}
                    columns={downColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {dvk.has("machineCode") && <TableHead>Machine</TableHead>}
                          {dvk.has("reason") && <TableHead>Reason</TableHead>}
                          {dvk.has("startedAt") && <TableHead>Started</TableHead>}
                          {dvk.has("durationMin") && (
                            <TableHead className="text-right">Duration</TableHead>
                          )}
                          {dvk.has("resolved") && <TableHead>Status</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {downFiltered.map((d) => (
                          <TableRow key={d.id}>
                            {dvk.has("machineCode") && (
                              <TableCell className="font-mono text-xs">{d.machineCode}</TableCell>
                            )}
                            {dvk.has("reason") && <TableCell>{d.reason}</TableCell>}
                            {dvk.has("startedAt") && <TableCell>{d.startedAt}</TableCell>}
                            {dvk.has("durationMin") && (
                              <TableCell className="text-right">{d.durationMin} min</TableCell>
                            )}
                            {dvk.has("resolved") && (
                              <TableCell>
                                <Badge variant={d.resolved ? "default" : "destructive"}>
                                  {d.resolved ? "Resolved" : "Open"}
                                </Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}
