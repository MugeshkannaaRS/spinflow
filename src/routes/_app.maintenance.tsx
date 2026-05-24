import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maintenanceApi } from "@/lib/api-service";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { useState, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Upload,
  Download,
  FileSpreadsheet,
  X,
} from "lucide-react";
import type { MaintenanceTask } from "@/lib/types";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — SpinFlow ERP" }] }),
  component: MaintenancePage,
});

// ─── Template generators ─────────────────────────────────────────────────────

function downloadScheduleTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "Machine Code",
      "Task Description",
      "Frequency (daily/weekly/monthly)",
      "Last Done Date (DD/MM/YYYY)",
      "Next Due Date (DD/MM/YYYY)",
      "Assigned Technician Name",
    ],
    ["RI-001", "Lubrication check", "weekly", "01/05/2026", "08/05/2026", "Ravi Kumar"],
    ["BL-002", "Belt tension check", "monthly", "01/04/2026", "01/05/2026", "Suresh P"],
  ]);
  ws["!cols"] = [20, 30, 30, 22, 22, 25].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PM Schedules");
  XLSX.writeFile(wb, "pm_schedule_template.xlsx");
}

function downloadParameterTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "Machine Code",
      "Parameter Name",
      "Standard Value",
      "Min Value",
      "Max Value",
      "Unit (RPM/kg/mm etc)",
    ],
    ["RI-001", "Spindle Speed", "18000", "16000", "20000", "RPM"],
    ["RI-001", "Ring Traveller Count", "30", "28", "32", "count"],
    ["BL-002", "Lap Weight", "400", "380", "420", "g/m"],
  ]);
  ws["!cols"] = [20, 25, 18, 12, 12, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Machine Parameters");
  XLSX.writeFile(wb, "machine_parameters_template.xlsx");
}

// ─── Generic Excel import dialog ──────────────────────────────────────────────

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: string[];
  parseRow: (row: any[]) => Record<string, string> | null;
  onConfirm: (rows: Record<string, string>[]) => Promise<void>;
  onDownloadTemplate: () => void;
  isSubmitting: boolean;
};

function ImportDialog({
  open,
  onClose,
  title,
  columns,
  parseRow,
  onConfirm,
  onDownloadTemplate,
  isSubmitting,
}: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const reset = () => {
    setPreview([]);
    setParseErrors([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const dataRows = raw.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
        const errs: string[] = [];
        const parsed: Record<string, string>[] = [];
        dataRows.forEach((row, i) => {
          const result = parseRow(row);
          if (!result) {
            errs.push(`Row ${i + 2}: missing required fields`);
          } else {
            parsed.push(result);
          }
        });
        setPreview(parsed);
        setParseErrors(errs);
      } catch {
        toast.error("Failed to read Excel file. Make sure it's a valid .xlsx or .xls file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onDownloadTemplate}>
              <Download className="size-3.5 mr-1.5" />
              Download Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5 mr-1.5" />
              {fileName ? "Change file" : "Choose Excel file"}
            </Button>
            {fileName && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <FileSpreadsheet className="size-3.5 text-green-600" />
                {fileName}
                <button onClick={reset} className="ml-1 hover:text-destructive">
                  <X className="size-3" />
                </button>
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 space-y-1">
              <p className="text-xs font-medium text-destructive">
                {parseErrors.length} row(s) skipped:
              </p>
              {parseErrors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">
                  {e}
                </p>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Preview — {preview.length} row(s) ready to import
              </p>
              <div className="w-full overflow-x-auto rounded border">
                <Table className="text-xs min-w-max">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      {columns.map((c) => (
                        <TableHead key={c} className="py-2 whitespace-nowrap">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 50).map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((v, j) => (
                          <TableCell
                            key={j}
                            className="py-1.5 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {String(v)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.length > 50 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing first 50 of {preview.length} rows.
                </p>
              )}
            </div>
          )}

          {preview.length === 0 && !fileName && (
            <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
              Download the template, fill it in, then upload your file to preview before importing.
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t mt-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={preview.length === 0 || isSubmitting}
            onClick={() => onConfirm(preview)}
          >
            {isSubmitting ? "Importing…" : `Import ${preview.length} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row parsers ──────────────────────────────────────────────────────────────

function parseScheduleRow(row: any[]): Record<string, string> | null {
  const machineCode = String(row[0] ?? "").trim();
  const taskDescription = String(row[1] ?? "").trim();
  if (!machineCode || !taskDescription) return null;
  return {
    machine_code: machineCode,
    task_description: taskDescription,
    frequency: String(row[2] ?? "monthly")
      .trim()
      .toLowerCase(),
    last_done_date: String(row[3] ?? "").trim() || "",
    next_due_date: String(row[4] ?? "").trim() || "",
    technician_name: String(row[5] ?? "").trim(),
  };
}

function parseParameterRow(row: any[]): Record<string, string> | null {
  const machineCode = String(row[0] ?? "").trim();
  const parameterName = String(row[1] ?? "").trim();
  if (!machineCode || !parameterName) return null;
  return {
    machine_code: machineCode,
    parameter_name: parameterName,
    standard_value: String(row[2] ?? "").trim(),
    min_value: String(row[3] ?? "").trim(),
    max_value: String(row[4] ?? "").trim(),
    unit: String(row[5] ?? "").trim(),
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

function MaintenancePage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "maintenance");
  const qc = useQueryClient();

  const maintQ = useQuery({
    queryKey: ["maintenance-tasks"],
    queryFn: maintenanceApi.getTasks,
    staleTime: 60_000,
    retry: 1,
  });
  const schedulesQ = useQuery({
    queryKey: ["maintenance-schedules"],
    queryFn: maintenanceApi.getSchedules,
    staleTime: 60_000,
    retry: 1,
  });
  const paramsQ = useQuery({
    queryKey: ["machine-parameters"],
    queryFn: maintenanceApi.getParameters,
    staleTime: 60_000,
    retry: 1,
  });

  const tasks: any[] = maintQ.data ?? [];
  const schedules: any[] = schedulesQ.data ?? [];
  const parameters: any[] = paramsQ.data ?? [];

  const [scheduleImportOpen, setScheduleImportOpen] = useState(false);
  const [paramImportOpen, setParamImportOpen] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) =>
      maintenanceApi.bulkCreateSchedules({ items: rows }),
    onSuccess: (res: any) => {
      toast.success(
        `${res.created} schedules imported${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}`,
      );
      res.errors?.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
      setScheduleImportOpen(false);
    },
    onError: () => toast.error("Import failed"),
  });

  const paramMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) =>
      maintenanceApi.bulkCreateParameters({ items: rows }),
    onSuccess: (res: any) => {
      toast.success(
        `${res.created} parameters imported${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}`,
      );
      res.errors?.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["machine-parameters"] });
      setParamImportOpen(false);
    },
    onError: () => toast.error("Import failed"),
  });

  const openTasks = tasks.filter((t) => t.status === "open").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const completedToday = tasks.filter(
    (t) => t.status === "completed" && t.date === new Date().toISOString().slice(0, 10),
  ).length;
  const totalDownTime = tasks.reduce((s, t) => s + (t.downtimeMin ?? 0), 0);

  if (!user) return null;

  if (maintQ.isLoading)
    return (
      <>
        <Topbar title="Maintenance" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (maintQ.isError)
    return (
      <>
        <Topbar title="Maintenance" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Maintenance"
        subtitle="Breakdown logging, preventive maintenance, technician tracking & MTTR/MTBF"
      />
      <AccessGuard module="maintenance">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Open Tasks
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  {openTasks}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  In Progress
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Activity className="size-5 text-warning" />
                  {inProgress}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Completed Today
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-success" />
                  {completedToday}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Downtime
                </div>
                <div className="text-2xl font-semibold mt-2">{totalDownTime} min</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Maintenance Tasks</TabsTrigger>
              <TabsTrigger value="schedules">
                PM Schedules
                {schedules.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                    {schedules.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="parameters">
                Machine Parameters
                {parameters.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                    {parameters.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Tasks tab ── */}
            <TabsContent value="tasks">
              <Card>
                <CardHeader><CardTitle className="text-base">Maintenance Tasks</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="maintenance_tasks"
                    columns={[
                      { key: "date", label: "Date", type: "date" },
                      { key: "type", label: "Type", render: (t: any) => <Badge variant={t.type === "breakdown" ? "destructive" : t.type === "preventive" ? "default" : "secondary"}>{t.type}</Badge> },
                      { key: "machineCode", label: "Machine", className: "font-mono text-xs" },
                      { key: "department", label: "Department", type: "status" },
                      { key: "description", label: "Description", className: "max-w-[250px] truncate" },
                      { key: "technician", label: "Technician" },
                      { key: "downtimeMin", label: "Downtime", render: (t: any) => `${t.downtimeMin} min` },
                      { key: "spareUsed", label: "Spare", render: (t: any) => t.spareUsed || "—" },
                      { key: "status", label: "Status", type: "status", render: (t: any) => <Badge variant={t.status === "completed" ? "default" : t.status === "in-progress" ? "secondary" : "destructive"}>{t.status}</Badge> },
                    ] satisfies ColDef[]}
                    data={tasks}
                    loading={maintQ.isLoading}
                    rowKey={(t: any) => t.id}
                    exportFilename="maintenance_tasks"
                    actions={canEdit ? (t: any) => t.status !== "completed" ? <StatusSelect taskId={t.id} currentStatus={t.status} /> : null : undefined}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── PM Schedules tab ── */}
            <TabsContent value="schedules">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Preventive Maintenance Schedules</CardTitle>
                  {canEdit && (
                    <Button size="sm" onClick={() => setScheduleImportOpen(true)}>
                      <Upload className="size-3.5 mr-1.5" />
                      Import Schedule
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="maintenance_schedules"
                    columns={[
                      { key: "machine_code", label: "Machine Code", className: "font-mono text-xs" },
                      { key: "type", label: "Type", render: (s: any) => <Badge variant="secondary">{s.type}</Badge> },
                      { key: "frequency_days", label: "Frequency (days)" },
                      { key: "last_done", label: "Last Done", render: (s: any) => s.last_done || "—" },
                      { key: "next_due", label: "Next Due", render: (s: any) => s.next_due || "—" },
                      { key: "description", label: "Description", className: "max-w-[300px] truncate" },
                      { key: "is_active", label: "Active", render: (s: any) => <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge> },
                    ] satisfies ColDef[]}
                    data={schedules}
                    loading={schedulesQ.isLoading}
                    rowKey={(s: any) => s.id}
                    exportFilename="pm_schedules"
                    emptyMessage='No schedules yet. Use "Import Schedule" to upload from Excel.'
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Machine Parameters tab ── */}
            <TabsContent value="parameters">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Machine Parameter Details</CardTitle>
                  {canEdit && (
                    <Button size="sm" onClick={() => setParamImportOpen(true)}>
                      <Upload className="size-3.5 mr-1.5" />
                      Import Parameters
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="maintenance_parameters"
                    columns={[
                      { key: "machine_code", label: "Machine Code", className: "font-mono text-xs" },
                      { key: "parameter_name", label: "Parameter Name", render: (p: any) => <span className="font-medium">{p.parameter_name}</span> },
                      { key: "standard_value", label: "Standard Value", render: (p: any) => p.standard_value || "—" },
                      { key: "min_value", label: "Min", render: (p: any) => <span className="text-muted-foreground">{p.min_value || "—"}</span> },
                      { key: "max_value", label: "Max", render: (p: any) => <span className="text-muted-foreground">{p.max_value || "—"}</span> },
                      { key: "unit", label: "Unit", render: (p: any) => <Badge variant="outline">{p.unit || "—"}</Badge> },
                    ] satisfies ColDef[]}
                    data={parameters}
                    loading={paramsQ.isLoading}
                    rowKey={(p: any) => p.id}
                    exportFilename="machine_parameters"
                    emptyMessage='No parameters yet. Use "Import Parameters" to upload from Excel.'
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Import dialogs ── */}
        <ImportDialog
          open={scheduleImportOpen}
          onClose={() => setScheduleImportOpen(false)}
          title="Import PM Schedules from Excel"
          columns={[
            "Machine Code",
            "Task Description",
            "Frequency",
            "Last Done",
            "Next Due",
            "Technician",
          ]}
          parseRow={parseScheduleRow}
          onConfirm={(rows) => scheduleMutation.mutateAsync(rows)}
          onDownloadTemplate={downloadScheduleTemplate}
          isSubmitting={scheduleMutation.isPending}
        />
        <ImportDialog
          open={paramImportOpen}
          onClose={() => setParamImportOpen(false)}
          title="Import Machine Parameters from Excel"
          columns={[
            "Machine Code",
            "Parameter Name",
            "Standard Value",
            "Min Value",
            "Max Value",
            "Unit",
          ]}
          parseRow={parseParameterRow}
          onConfirm={(rows) => paramMutation.mutateAsync(rows)}
          onDownloadTemplate={downloadParameterTemplate}
          isSubmitting={paramMutation.isPending}
        />
      </AccessGuard>
    </>
  );
}

function StatusSelect({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: MaintenanceTask["status"];
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (newStatus: MaintenanceTask["status"]) =>
      maintenanceApi.updateStatus(taskId, { status: newStatus }),
  });

  const nextStatus = currentStatus === "open" ? ("in-progress" as const) : ("completed" as const);

  const handleUpdateStatus = () => {
    m.mutate(nextStatus, {
      onSuccess: () => {
        toast.success("Task status updated");
        qc.invalidateQueries({ queryKey: ["maintenance-tasks"] });
      },
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={handleUpdateStatus} disabled={m.isPending}>
      {currentStatus === "open" ? "Start" : "Complete"}
    </Button>
  );
}
