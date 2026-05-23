import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionApi, uploadApi } from "@/lib/api-service";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/production")({
  head: () => ({ meta: [{ title: "Production — SpinFlow ERP" }] }),
  component: ProductionPage,
});

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
                  {(() => {
                    const avgEfficiency = totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0;
                    return avgEfficiency.toFixed(1) + "%";
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="machines">
            <TabsList>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="shifts">Shift Entries</TabsTrigger>
              <TabsTrigger value="downtime">Downtime</TabsTrigger>
            </TabsList>

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
                  <div className="flex gap-1">
                    {isAdmin && <ColumnConfigurator module="production" tableKey="shifts" />}
                    {canEdit && <NewShiftDialog />}
                  </div>
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

const DEPARTMENTS = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Winding",
  "Quality",
];

function NewShiftDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  const [form, setForm] = useState({
    date: localDate,
    shift: "A" as "A" | "B" | "C",
    machineCode: "RI-005",
    department: "Ring Frame",
    operator: "",
    producedKg: 0,
    wasteKg: 0,
    count: "30s",
  });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await productionApi.createEntry(form);
      if (files.length > 0) {
        await Promise.all(files.map((f) => uploadApi.upload("production", entry.id, f.file)));
      }
      return entry;
    },
  });

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Shift entry submitted for approval");
        qc.invalidateQueries({ queryKey: ["shifts"] });
        setFiles([]);
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New shift entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateEntry} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shift</Label>
              <Select
                value={form.shift}
                onValueChange={(v) => setForm({ ...form, shift: v as "A" | "B" | "C" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Machine code</Label>
              <Input
                value={form.machineCode}
                onChange={(e) => setForm({ ...form, machineCode: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Count</Label>
              <Input
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Operator</Label>
              <Input
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.department}
                onValueChange={(v) => setForm({ ...form, department: v })}
              >
                <SelectTrigger>
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
              <Label>Produced (kg)</Label>
              <Input
                type="number"
                value={form.producedKg}
                onChange={(e) => setForm({ ...form, producedKg: +e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Waste (kg)</Label>
              <Input
                type="number"
                value={form.wasteKg}
                onChange={(e) => setForm({ ...form, wasteKg: +e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Attachments (PDF, Excel, images)</Label>
            <FileUpload files={files} onFilesChange={setFiles} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
