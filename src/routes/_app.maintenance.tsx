import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, maintenanceApi, productionApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { useState, useRef, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Upload,
  Download,
  FileSpreadsheet,
  X,
  Plus,
  Pencil,
  ArrowDown,
  Trash2,
} from "lucide-react";
import type { MaintenanceTask, MasterMachine } from "@/lib/types";
import * as XLSX from "xlsx";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useMillMasterCategory } from "@/hooks/useMillConfig";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — SpinFlow ERP" }] }),
  component: MaintenancePage,
});

// ─── Template generators ─────────────────────────────────────────────────────

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
  const taskColConfig = useColumnConfig("maintenance_tasks");
  const schedColConfig = useColumnConfig("maintenance_schedules");
  const qc = useQueryClient();
  const { millId } = useActiveMill();

  const maintQ = useQuery({
    queryKey: ["maintenance-tasks", millId],
    queryFn: maintenanceApi.getTasks,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const schedulesQ = useQuery({
    queryKey: ["maintenance-schedules", millId],
    queryFn: maintenanceApi.getSchedules,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const paramsQ = useQuery({
    queryKey: ["machine-parameters", millId],
    queryFn: maintenanceApi.getParameters,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const machinesQ = useQuery({
    queryKey: ["maintenance", "machines"],
    queryFn: () => productionApi.getMachines(),
    staleTime: 60_000,
    retry: 1,
  });
  const deptsQ = useQuery({
    queryKey: ["maintenance", "departments"],
    queryFn: () => mastersApi.getDepartments(),
    staleTime: 60_000,
    retry: 1,
  });

  const machineColConfig = useColumnConfig("maintenance_machines");

  const tasks: any[] = maintQ.data ?? [];
  const schedules: any[] = schedulesQ.data ?? [];
  const parameters: any[] = paramsQ.data ?? [];
  const machinesData = (machinesQ.data ?? []) as MasterMachine[];
  const deptsData = (deptsQ.data ?? []) as any[];

  const [paramImportOpen, setParamImportOpen] = useState(false);

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

  if (!user)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

  if (maintQ.isLoading)
    return (
      <>
        <PageHeader title="Maintenance" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (maintQ.isError)
    return (
      <>
        <PageHeader title="Maintenance" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Breakdown logging, preventive maintenance, technician tracking & MTTR/MTBF"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["maintenance-tasks"] })}
        isRefreshing={maintQ.isFetching}
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
              <TabsTrigger value="machines">
                Machines
                {machinesData.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                    {machinesData.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Tasks tab ── */}
            <TabsContent value="tasks">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Maintenance Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Maintenance Tasks">
                    <DataTable
                      tableId="maintenance_tasks"
                      columns={
                        [
                          { key: "date", label: taskColConfig.getLabel("date"), type: "date" },
                          {
                            key: "type",
                            label: taskColConfig.getLabel("type"),
                            render: (t: any) => (
                              <Badge
                                variant={
                                  t.type === "breakdown"
                                    ? "destructive"
                                    : t.type === "preventive"
                                      ? "default"
                                      : "secondary"
                                }
                              >
                                {t.type}
                              </Badge>
                            ),
                          },
                          {
                            key: "machine_code",
                            label: taskColConfig.getLabel("machine_code"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "department",
                            label: taskColConfig.getLabel("department"),
                            type: "status",
                          },
                          {
                            key: "description",
                            label: taskColConfig.getLabel("description"),
                            className: "max-w-[250px] truncate",
                          },
                          { key: "technician_name", label: taskColConfig.getLabel("technician") },
                          {
                            key: "downtime_min",
                            label: taskColConfig.getLabel("downtime_min"),
                            render: (t: any) => `${t.downtime_min ?? 0} min`,
                          },
                          {
                            key: "spare_used",
                            label: taskColConfig.getLabel("spare_used"),
                            render: (t: any) => t.spare_used || "—",
                          },
                          {
                            key: "status",
                            label: taskColConfig.getLabel("status"),
                            type: "status",
                            render: (t: any) => <StatusBadge status={t.status} size="sm" />,
                          },
                        ] satisfies ColDef[]
                      }
                      data={tasks}
                      loading={maintQ.isLoading}
                      rowKey={(t: any) => t.id}
                      exportFilename="maintenance_tasks"
                      disableExport={true}
                      toolbar={
                        <ExportDateRangeButton
                          onExportXlsx={(f, t) => exportApi.maintenanceXlsx(f, t)}
                        />
                      }
                      actions={
                        canEdit
                          ? (t: any) => (
                              <div className="flex gap-1 items-center">
                                {t.status !== "completed" && (
                                  <StatusSelect taskId={t.id} currentStatus={t.status} />
                                )}
                                {t.status !== "completed" && (
                                  <ConfirmDeleteButton
                                    onConfirm={async () => {
                                      await maintenanceApi.deleteTask(t.id);
                                      qc.invalidateQueries({ queryKey: ["maintenance-tasks"] });
                                    }}
                                    label={`Delete maintenance task for ${t.machine_code}?`}
                                    successMessage="Task deleted"
                                  />
                                )}
                              </div>
                            )
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── PM Schedules tab ── */}
            <TabsContent value="schedules">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Preventive Maintenance Schedules</CardTitle>
                  {canEdit && <ImportScheduleDialog />}
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="PM Schedules">
                    <DataTable
                      tableId="maintenance_schedules"
                      columns={
                        [
                          {
                            key: "machine_code",
                            label: schedColConfig.getLabel("machine_code"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "type",
                            label: schedColConfig.getLabel("type"),
                            render: (s: any) => <Badge variant="secondary">{s.type}</Badge>,
                          },
                          {
                            key: "frequency_days",
                            label: schedColConfig.getLabel("frequency_days"),
                          },
                          {
                            key: "last_done",
                            label: schedColConfig.getLabel("last_done"),
                            render: (s: any) => s.last_done || "—",
                          },
                          {
                            key: "next_due",
                            label: schedColConfig.getLabel("next_due"),
                            render: (s: any) => s.next_due || "—",
                          },
                          {
                            key: "description",
                            label: schedColConfig.getLabel("description"),
                            className: "max-w-[300px] truncate",
                          },
                          {
                            key: "is_active",
                            label: schedColConfig.getLabel("is_active"),
                            render: (s: any) => (
                              <Badge variant={s.is_active ? "default" : "secondary"}>
                                {s.is_active ? "Active" : "Inactive"}
                              </Badge>
                            ),
                          },
                        ] satisfies ColDef[]
                      }
                      data={schedules}
                      loading={schedulesQ.isLoading}
                      rowKey={(s: any) => s.id}
                      exportFilename="pm_schedules"
                      emptyMessage='No schedules yet. Use "Import Schedule" to upload from Excel.'
                      actions={
                        canEdit
                          ? (s: any) =>
                              s.is_active ? (
                                <ConfirmDeleteButton
                                  onConfirm={async () => {
                                    await maintenanceApi.deleteSchedule(s.id);
                                    qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
                                  }}
                                  label={`Remove PM schedule for ${s.machine_code}?`}
                                  successMessage="Schedule removed"
                                />
                              ) : null
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

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
                  <ErrorBoundary inline label="Machine Parameters">
                    <DataTable
                      tableId="maintenance_parameters"
                      columns={
                        [
                          {
                            key: "machine_code",
                            label: "Machine Code",
                            className: "font-mono text-xs",
                          },
                          {
                            key: "parameter_name",
                            label: "Parameter Name",
                            render: (p: any) => (
                              <span className="font-medium">{p.parameter_name}</span>
                            ),
                          },
                          {
                            key: "standard_value",
                            label: "Standard Value",
                            render: (p: any) => p.standard_value || "—",
                          },
                          {
                            key: "min_value",
                            label: "Min",
                            render: (p: any) => (
                              <span className="text-muted-foreground">{p.min_value || "—"}</span>
                            ),
                          },
                          {
                            key: "max_value",
                            label: "Max",
                            render: (p: any) => (
                              <span className="text-muted-foreground">{p.max_value || "—"}</span>
                            ),
                          },
                          {
                            key: "unit",
                            label: "Unit",
                            render: (p: any) => <Badge variant="outline">{p.unit || "—"}</Badge>,
                          },
                        ] satisfies ColDef[]
                      }
                      data={parameters}
                      loading={paramsQ.isLoading}
                      rowKey={(p: any) => p.id}
                      exportFilename="machine_parameters"
                      emptyMessage='No parameters yet. Use "Import Parameters" to upload from Excel.'
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Machines tab ── */}
            <TabsContent value="machines">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Machines ({machinesData.length})</CardTitle>
                  <div className="flex gap-2">
                    {canEdit && <ImportMachinesDialog />}
                    {canEdit && <MachineDialog departments={deptsData} />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Maintenance Machines">
                    <DataTable
                      tableId="maintenance_machines"
                      columns={
                        [
                          {
                            key: "code",
                            label: machineColConfig.getLabel("code"),
                            className: "font-mono text-xs",
                          },
                          { key: "name", label: machineColConfig.getLabel("name") },
                          { key: "machine_type", label: machineColConfig.getLabel("machine_type") },
                          { key: "department", label: machineColConfig.getLabel("department") },
                          { key: "target_kg", label: machineColConfig.getLabel("target_kg") },
                          {
                            key: "current_status",
                            label: "Status",
                            render: (m: any) => (
                              <Badge
                                variant={
                                  m.current_status === "running"
                                    ? "default"
                                    : m.current_status === "idle"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {m.current_status ?? "unknown"}
                              </Badge>
                            ),
                          },
                        ] satisfies ColDef[]
                      }
                      data={machinesData}
                      loading={machinesQ.isLoading}
                      rowKey={(m: any) => m.id}
                      exportFilename="machines"
                      actions={
                        canEdit
                          ? (m: any) => (
                              <MachineDialog item={m as MasterMachine} departments={deptsData} />
                            )
                          : undefined
                      }
                      emptyMessage="No machines registered yet."
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Import dialogs ── */}
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

function ImportScheduleDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-3.5 mr-1.5" />
        Import Schedule
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="maintenance_schedules"
        endpoint="/maintenance/schedules/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["maintenance-schedules"] })}
        title="Import PM Schedules"
      />
    </>
  );
}

function ImportMachinesDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDown className="size-4 mr-1" />
        Import Excel
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="maintenance_machines"
        endpoint="/masters/machines/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["maintenance", "machines"] })}
        title="Import Machines"
      />
    </>
  );
}

function MachineDialog({ item, departments }: { item?: MasterMachine; departments: any[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: machineTypes } = useMillMasterCategory("machine_type");
  const MACHINE_TYPES = (
    machineTypes?.length
      ? machineTypes
      : ["Blowroom", "Carding", "Drawing", "Simplex", "Ring Frame", "Autoconer", "Winding"]
  ) as string[];
  const requiredFields = ["code"];
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    machine_type: item?.machine_type ?? "",
    department: item?.department ?? "",
    make: item?.make ?? "",
    model: item?.model ?? "",
    spindles: item?.spindles ?? (undefined as number | undefined),
    installation_date: item?.installation_date ?? "",
    amc_expiry: item?.amc_expiry ?? "",
    target_kg: item?.target_kg ?? 0,
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
    mutationFn: () => productionApi.createMachine(form),
    onSuccess: () => {
      toast.success("Machine created");
      qc.invalidateQueries({ queryKey: ["maintenance", "machines"] });
      setOpen(false);
    },
  });
  const updateM = useMutation({
    mutationFn: () => productionApi.updateMachine(item!.id, form),
    onSuccess: () => {
      toast.success("Machine updated");
      qc.invalidateQueries({ queryKey: ["maintenance", "machines"] });
      setOpen(false);
    },
    onError: () => toast.error("Failed to update machine"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(requiredFields.map((f) => [f, true])));
    if (!isComplete) return;
    (item ? updateM : createM).mutate();
  };

  const trigger = item ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      <Pencil className="size-3.5 mr-1" /> Edit
    </Button>
  ) : (
    <Button size="sm" onClick={() => setOpen(true)}>
      <Plus className="size-4 mr-1" /> Add Machine
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Machine" : "Add Machine"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className={cn(err("code") && "text-destructive")}>
              Machine Code <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className={cn(err("code") && "border-destructive")}
            />
            {err("code") && <p className="text-xs text-destructive">{err("code")}</p>}
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
                {MACHINE_TYPES.map((t: string) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={form.department}
              onValueChange={(v) => setForm({ ...form, department: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments
                  .filter((d: any) => d?.code)
                  .map((d: any) => (
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
              <Input
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
          </div>
          {form.machine_type === "Ring Frame" && (
            <div className="space-y-1.5">
              <Label>Spindles</Label>
              <Input
                type="number"
                value={form.spindles ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    spindles: e.target.value ? parseInt(e.target.value) : undefined,
                  })
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
          <DialogFooter>
            <Button type="submit" disabled={createM.isPending || updateM.isPending || !isComplete}>
              {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
