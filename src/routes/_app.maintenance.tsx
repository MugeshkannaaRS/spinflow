import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, maintenanceApi, productionApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRBAC } from "@/hooks/useRBAC";
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
  const { canAccess } = useRBAC();
  const canEdit = canAccess("maintenance", true);
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

  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const dueThisMonth = schedules.filter((s) => {
    if (!s.next_due) return false;
    const d = new Date(s.next_due);
    return d >= today && d <= endOfMonth;
  }).length;

  // Group schedules by department for PM Calendar
  const schedulesByDept = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of schedules) {
      const dept = s.department || "General";
      if (!map[dept]) map[dept] = [];
      map[dept].push(s);
    }
    return map;
  }, [schedules]);

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
              <TabsTrigger value="calendar">
                PM Calendar
                {dueThisMonth > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">
                    {dueThisMonth}
                  </Badge>
                )}
              </TabsTrigger>
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
                          onFetchData={(f, t) => exportApi.maintenanceJson(f, t)}
                          exportTitle="Maintenance Logs"
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

            {/* ── PM Calendar tab ── */}
            <TabsContent value="calendar">
              <PMCalendarView
                schedulesByDept={schedulesByDept}
                loading={schedulesQ.isLoading}
              />
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
                            key: "sl_no",
                            label: "SL",
                            className: "w-10 text-center text-xs text-muted-foreground",
                            render: (s: any) => s.sl_no ?? "—",
                          },
                          {
                            key: "department",
                            label: "Department",
                            render: (s: any) => s.department ? (
                              <Badge variant="outline" className="text-xs">{s.department}</Badge>
                            ) : "—",
                          },
                          {
                            key: "machine_code",
                            label: schedColConfig.getLabel("machine_code"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "description",
                            label: "Work Description",
                            className: "max-w-[280px]",
                            render: (s: any) => (
                              <span className="text-xs leading-snug">{s.description || "—"}</span>
                            ),
                          },
                          {
                            key: "frequency_days",
                            label: "Freq (Days)",
                            render: (s: any) => (
                              <Badge variant="secondary" className="text-xs">
                                {s.frequency_days}d
                              </Badge>
                            ),
                          },
                          {
                            key: "lubricant_name",
                            label: "Lubricant",
                            render: (s: any) => s.lubricant_name ? (
                              <span className="text-xs">{s.lubricant_name}</span>
                            ) : "—",
                          },
                          {
                            key: "lubricant_quantity",
                            label: "Qty",
                            render: (s: any) => s.lubricant_quantity ? (
                              <span className="text-xs font-mono">{s.lubricant_quantity}</span>
                            ) : "—",
                          },
                          {
                            key: "manpower_count",
                            label: "Manpower",
                            render: (s: any) => s.manpower_count != null ? (
                              <span className="text-xs">{s.manpower_count} persons</span>
                            ) : "—",
                          },
                          {
                            key: "last_done",
                            label: schedColConfig.getLabel("last_done"),
                            render: (s: any) => s.last_done || "—",
                          },
                          {
                            key: "next_due",
                            label: "Next Due",
                            render: (s: any) => {
                              if (!s.next_due) return "—";
                              const d = new Date(s.next_due);
                              const now = new Date();
                              const overdue = d < now;
                              return (
                                <span className={overdue ? "text-destructive font-semibold text-xs" : "text-xs"}>
                                  {s.next_due}
                                </span>
                              );
                            },
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

// ─── PM Calendar View ────────────────────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  Blowroom: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  Carding: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
  DSC: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
  Finishing: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  General: "bg-muted border-muted-foreground/20",
};

const FREQ_LABEL: Record<number, string> = {
  30: "Monthly",
  60: "2-Monthly",
  90: "3-Monthly",
  120: "4-Monthly",
  180: "6-Monthly",
  365: "Yearly",
  730: "2-Yearly",
  912: "2.5-Yearly",
  1095: "3-Yearly",
  1460: "4-Yearly",
  1825: "5-Yearly",
};

function freqLabel(days: number) {
  return FREQ_LABEL[days] ?? `${days}d`;
}

function dueBadge(nextDue: string | null) {
  if (!nextDue) return <Badge variant="secondary">No Due Date</Badge>;
  const d = new Date(nextDue);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return <Badge variant="destructive">Overdue {Math.abs(diff)}d</Badge>;
  if (diff <= 7) return <Badge className="bg-orange-500 text-white border-0">Due in {diff}d</Badge>;
  if (diff <= 30) return <Badge className="bg-yellow-500 text-white border-0">Due in {diff}d</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{nextDue}</Badge>;
}

function PMCalendarView({
  schedulesByDept,
  loading,
}: {
  schedulesByDept: Record<string, any[]>;
  loading: boolean;
}) {
  const [filterFreq, setFilterFreq] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  const depts = Object.keys(schedulesByDept);

  if (depts.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Wrench className="size-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No PM schedules loaded yet.</p>
          <p className="text-xs mt-1">Switch to the PM Schedules tab and use "Import Schedule" to upload AACSL_PM_Schedule_Seed.xlsx</p>
        </CardContent>
      </Card>
    );
  }

  const freqOptions = Array.from(
    new Set(
      Object.values(schedulesByDept)
        .flat()
        .map((s) => s.frequency_days)
        .filter(Boolean)
    )
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4" />
            Filters:
          </div>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFreq} onValueChange={setFilterFreq}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frequencies</SelectItem>
              {freqOptions.map((f) => (
                <SelectItem key={f} value={String(f)}>{freqLabel(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => { setFilterDept("all"); setFilterFreq("all"); }}>
            <X className="size-3 mr-1" /> Clear
          </Button>
        </CardContent>
      </Card>

      {/* Department cards */}
      {depts
        .filter((d) => filterDept === "all" || d === filterDept)
        .map((dept) => {
          const deptSchedules = schedulesByDept[dept].filter(
            (s) => filterFreq === "all" || String(s.frequency_days) === filterFreq
          );
          if (deptSchedules.length === 0) return null;

          const sample = deptSchedules[0];
          const manpower = sample?.manpower_count;
          const machineCount = sample?.machine_count;
          const isExpanded = expandedDepts[dept] !== false; // default open
          const colorClass = DEPT_COLORS[dept] ?? DEPT_COLORS.General;

          // Group by frequency within dept
          const byFreq: Record<number, any[]> = {};
          for (const s of deptSchedules) {
            const f = s.frequency_days ?? 30;
            if (!byFreq[f]) byFreq[f] = [];
            byFreq[f].push(s);
          }
          const sortedFreqs = Object.keys(byFreq).map(Number).sort((a, b) => a - b);

          return (
            <Card key={dept} className={`border ${colorClass}`}>
              <CardHeader
                className="p-4 cursor-pointer select-none"
                onClick={() => setExpandedDepts((p) => ({ ...p, [dept]: !isExpanded }))}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wrench className="size-4 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-sm font-semibold">{dept}</CardTitle>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                        {manpower != null && <span>👷 {manpower} persons</span>}
                        {machineCount != null && <span>⚙️ {machineCount} machines</span>}
                        <span>{deptSchedules.length} PM tasks</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {sortedFreqs.slice(0, 4).map((f) => (
                      <Badge key={f} variant="secondary" className="text-[10px]">
                        {freqLabel(f)} × {byFreq[f].length}
                      </Badge>
                    ))}
                    <Button variant="ghost" size="icon" className="size-6">
                      {isExpanded ? <ArrowDown className="size-3" /> : <Plus className="size-3" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0 pb-2">
                  {sortedFreqs.map((freq) => (
                    <div key={freq} className="px-4 pb-3">
                      <div className="flex items-center gap-2 mb-2 mt-1">
                        <Badge variant="outline" className="text-xs font-semibold">{freqLabel(freq)}</Badge>
                        <span className="text-xs text-muted-foreground">{byFreq[freq].length} task{byFreq[freq].length > 1 ? "s" : ""}</span>
                      </div>
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium w-8">#</th>
                              <th className="text-left px-3 py-1.5 font-medium">Machine</th>
                              <th className="text-left px-3 py-1.5 font-medium">Work Description</th>
                              <th className="text-left px-3 py-1.5 font-medium">Lubricant</th>
                              <th className="text-left px-3 py-1.5 font-medium">Qty</th>
                              <th className="text-left px-3 py-1.5 font-medium">Next Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {byFreq[freq].map((s, i) => (
                              <tr key={s.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                <td className="px-3 py-1.5 text-muted-foreground">{s.sl_no ?? i + 1}</td>
                                <td className="px-3 py-1.5 font-mono">{s.machine_code}</td>
                                <td className="px-3 py-1.5 max-w-[300px]">{s.description}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{s.lubricant_name || "—"}</td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground">{s.lubricant_quantity || "—"}</td>
                                <td className="px-3 py-1.5">{dueBadge(s.next_due)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
