import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, maintenanceApi, productionApi, exportApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportToExcel, exportToPdf, loadJsPDF, loadAutoTable } from "@/lib/export-utils";
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
  Users,
  Clock,
  TrendingUp,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { MaintenanceTask, MasterMachine } from "@/lib/types";
import * as XLSX from "xlsx";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useMillMasterCategory } from "@/hooks/useMillConfig";
import { DirectImportModal } from "@/components/ui/DirectImportModal";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MillCalendarManager } from "@/components/maintenance/MillCalendarManager";

export const Route = createFileRoute("/_app/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — SpinFlow ERP" }] }),
  component: MaintenancePage,
});

// ─── Machine sections (physical mill sections, not HR departments) ────────────
const MACHINE_SECTIONS = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Autoconer / Winding",
  "A/C Plant",
  "Buffing Room",
  "Civil / General",
];

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
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!millId,
  });
  const schedulesQ = useQuery({
    queryKey: ["maintenance-schedules", millId],
    queryFn: maintenanceApi.getSchedules,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!millId,
  });
  const paramsQ = useQuery({
    queryKey: ["machine-parameters", millId],
    queryFn: maintenanceApi.getParameters,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!millId,
  });

  const machinesQ = useQuery({
    queryKey: ["maintenance", "machines"],
    queryFn: () => productionApi.getMachines({ page_size: 500 }),
    staleTime: 60_000,
    retry: 1,
  });
  const deptsQ = useQuery({
    queryKey: ["maintenance", "departments"],
    queryFn: () => mastersApi.getDepartments(),
    staleTime: 60_000,
    retry: 1,
  });
  const manpowerQ = useQuery({
    queryKey: ["maintenance", "manpower-summary"],
    queryFn: maintenanceApi.getManpowerSummary,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!millId,
  });

  // Refetch everything in the maintenance module at once (used by the page Refresh).
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["maintenance-tasks"] });
    qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
    qc.invalidateQueries({ queryKey: ["machine-parameters"] });
    qc.invalidateQueries({ queryKey: ["maintenance"] });
    qc.invalidateQueries({ queryKey: ["mill-calendar"] });
  };

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
        onRefresh={refreshAll}
        isRefreshing={maintQ.isFetching || schedulesQ.isFetching || manpowerQ.isFetching}
      />
      <AccessGuard module="maintenance">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {[
              { label: "Open Tasks", value: openTasks, icon: <AlertTriangle className="size-5" />, accent: "text-rose-600", ring: "bg-rose-100 dark:bg-rose-950/40", bar: "bg-rose-500" },
              { label: "In Progress", value: inProgress, icon: <Activity className="size-5" />, accent: "text-amber-600", ring: "bg-amber-100 dark:bg-amber-950/40", bar: "bg-amber-500" },
              { label: "Completed Today", value: completedToday, icon: <CheckCircle2 className="size-5" />, accent: "text-emerald-600", ring: "bg-emerald-100 dark:bg-emerald-950/40", bar: "bg-emerald-500" },
              { label: "PM Schedules", value: schedules.length, icon: <CalendarCheck className="size-5" />, accent: "text-blue-600", ring: "bg-blue-100 dark:bg-blue-950/40", bar: "bg-blue-500", sub: `${totalDownTime} min downtime` },
            ].map((k) => (
              <Card key={k.label} className="relative overflow-hidden">
                <div className={cn("absolute left-0 top-0 h-full w-1", k.bar)} />
                <CardContent className="p-5 pl-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">{k.label}</div>
                      <div className="text-3xl font-bold mt-1.5 leading-none">{k.value}</div>
                      {k.sub && <div className="text-[11px] text-muted-foreground mt-1.5">{k.sub}</div>}
                    </div>
                    <div className={cn("rounded-lg p-2", k.ring, k.accent)}>{k.icon}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="tasks">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="tasks">Maintenance Tasks</TabsTrigger>
              <TabsTrigger value="calendar">
                PM Calendar
                {dueThisMonth > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">
                    {dueThisMonth}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="entry">
                <Wrench className="size-3.5 mr-1.5" />
                PM Entry
              </TabsTrigger>
              <TabsTrigger value="dayplan">
                <CalendarCheck className="size-3.5 mr-1.5" />
                Day Plan
              </TabsTrigger>
              <TabsTrigger value="manpower">
                <Users className="size-3.5 mr-1.5" />
                Manpower Plan
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
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── PM Entry tab ── */}
            <TabsContent value="entry">
              <PMEntryView canEdit={canEdit} />
            </TabsContent>

            {/* ── Day Plan tab ── */}
            <TabsContent value="dayplan">
              <DayPlanView />
            </TabsContent>

            {/* ── Manpower Plan tab ── */}
            <TabsContent value="manpower">
              <ManpowerPlanView
                summary={manpowerQ.data}
                schedulesByDept={schedulesByDept}
                loading={manpowerQ.isLoading}
              />
            </TabsContent>

            {/* ── PM Schedules tab ── */}
            <TabsContent value="schedules">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Preventive Maintenance Schedules</CardTitle>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <AddScheduleDialog />
                      <ImportScheduleDialog />
                    </div>
                  )}
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
                    {canEdit && <MachineDialog />}
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
                          { key: "department", label: "Section" },
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
                              <MachineDialog item={m as MasterMachine} />
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
  canEdit,
}: {
  schedulesByDept: Record<string, any[]>;
  loading: boolean;
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
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
                              <th className="text-left px-3 py-1.5 font-medium">Last Done</th>
                              <th className="text-left px-3 py-1.5 font-medium">Next Due</th>
                              {canEdit && <th className="px-3 py-1.5 font-medium w-24"></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {byFreq[freq].map((s, i) => (
                              <tr key={s.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                <td className="px-3 py-1.5 text-muted-foreground">{s.sl_no ?? i + 1}</td>
                                <td className="px-3 py-1.5 font-mono">{s.machine_code}</td>
                                <td className="px-3 py-1.5 max-w-[280px]">{s.description}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{s.lubricant_name || "—"}</td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground">{s.lubricant_quantity || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{s.last_done || "—"}</td>
                                <td className="px-3 py-1.5">{dueBadge(s.next_due)}</td>
                                {canEdit && (
                                  <td className="px-3 py-1.5">
                                    <MarkDoneButton scheduleId={s.id} onDone={() => qc.invalidateQueries({ queryKey: ["maintenance-schedules"] })} />
                                  </td>
                                )}
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

// ─── Mark Done Button ─────────────────────────────────────────────────────────

function MarkDoneButton({ scheduleId, onDone }: { scheduleId: string; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: () => maintenanceApi.markScheduleDone(scheduleId),
    onSuccess: () => { toast.success("Marked done — next due date advanced"); onDone(); },
    onError: () => toast.error("Failed to mark done"),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 text-[10px] px-2 text-green-700 border-green-300 hover:bg-green-50"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      <CalendarCheck className="size-3 mr-1" />
      {mut.isPending ? "..." : "Done"}
    </Button>
  );
}

// ─── Manpower Plan View ───────────────────────────────────────────────────────

const DEPT_COLORS_UTIL: Record<string, { bg: string; border: string; bar: string }> = {
  Blowroom: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", bar: "bg-blue-500" },
  Carding:  { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", bar: "bg-green-500" },
  DSC:      { bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-800", bar: "bg-yellow-500" },
  Finishing: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", bar: "bg-rose-500" },
  General:  { bg: "bg-muted", border: "border-muted-foreground/20", bar: "bg-gray-400" },
};

function utilisationColor(pct: number): string {
  if (pct >= 80) return "text-red-600 font-bold";
  if (pct >= 50) return "text-orange-500 font-semibold";
  if (pct >= 20) return "text-yellow-600";
  return "text-green-600";
}

function DayWisePlanTable({ dept, schedules }: { dept: string; schedules: any[] }) {
  // Build day-wise plan: tasks grouped by frequency → spread across calendar days
  const SHIFT_MIN = 450;
  const TASK_EST: Record<number, number> = { 30:20,60:25,90:30,120:35,180:45,365:90,730:180,912:240,1095:300,1460:360,1825:480 };
  const manpower = schedules[0]?.manpower_count ?? 1;
  const machineCount = schedules[0]?.machine_count ?? 1;
  const machPerPerson = Math.ceil(machineCount / manpower);

  // Monthly tasks only (freq=30) are the ones that happen every month
  const monthlyTasks = schedules.filter(s => (s.frequency_days ?? 30) === 30);
  const sixMonthlyTasks = schedules.filter(s => (s.frequency_days ?? 30) === 180);
  const yearlyTasks = schedules.filter(s => (s.frequency_days ?? 30) === 365);

  const dayPlan: Array<{ day: number; person: string; machines: string; tasks: string; estMin: number; taskType: string }> = [];

  if (monthlyTasks.length > 0) {
    const minPerPerson = monthlyTasks.reduce((s, t) => s + (TASK_EST[30] ?? 20), 0);
    const daysNeeded = Math.ceil((minPerPerson * machineCount / manpower) / (SHIFT_MIN * 0.85));
    for (let d = 1; d <= daysNeeded; d++) {
      const startMc = (d - 1) * machPerPerson * manpower + 1;
      const endMc = Math.min(d * machPerPerson * manpower, machineCount);
      dayPlan.push({
        day: d,
        person: `All ${manpower} persons`,
        machines: `Mc ${startMc}–${endMc}`,
        tasks: `Monthly PM (${monthlyTasks.length} tasks/mc)`,
        estMin: Math.min(minPerPerson * machPerPerson, SHIFT_MIN * 0.85),
        taskType: "monthly",
      });
    }
  }

  return (
    <div className="mt-3 rounded-md border overflow-hidden text-xs">
      <table className="w-full">
        <thead className="bg-muted/60">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Day</th>
            <th className="text-left px-3 py-2 font-medium">Who</th>
            <th className="text-left px-3 py-2 font-medium">Machines</th>
            <th className="text-left px-3 py-2 font-medium">Tasks</th>
            <th className="text-left px-3 py-2 font-medium">Est. Time</th>
            <th className="text-left px-3 py-2 font-medium">Shift Util</th>
          </tr>
        </thead>
        <tbody>
          {dayPlan.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No monthly tasks scheduled</td></tr>
          ) : (
            dayPlan.map((row, i) => {
              const util = Math.round((row.estMin / SHIFT_MIN) * 100);
              return (
                <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-3 py-2 font-semibold">Day {row.day}</td>
                  <td className="px-3 py-2">{row.person}</td>
                  <td className="px-3 py-2 font-mono">{row.machines}</td>
                  <td className="px-3 py-2">{row.tasks}</td>
                  <td className="px-3 py-2">{Math.round(row.estMin)} min ({(row.estMin/60).toFixed(1)}h)</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.min(util, 100)}%` }} />
                      </div>
                      <span className={utilisationColor(util)}>{util}%</span>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {sixMonthlyTasks.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <span className="font-medium">6-Monthly block:</span> {sixMonthlyTasks.length} tasks — schedule on Day 1 of months 1, 7
        </div>
      )}
      {yearlyTasks.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <span className="font-medium">Yearly block:</span> {yearlyTasks.length} tasks — schedule in January or as per OEM
        </div>
      )}
    </div>
  );
}

// ─── PM Entry View ────────────────────────────────────────────────────────────
// Fully dynamic — machines from API grouped by section, activities from DB config

// Entry type derived from section name — no hardcoding
function getSectionEntryType(section: string): "activity" | "cot_grinding" | "ac_plant" {
  const s = section.toLowerCase();
  if (s.includes("a/c") || s.includes("ac plant") || s.includes("air")) return "ac_plant";
  if (s.includes("draw") || s.includes("simplex") || s.includes("ring")) return "cot_grinding";
  return "activity";
}

function PMEntryView({ canEdit }: { canEdit: boolean }) {
  const today = new Date().toISOString().split("T")[0];
  const qc = useQueryClient();

  // Load all machines grouped by section
  const machinesQ = useQuery({
    queryKey: ["pm-entry-machines"],
    queryFn: () => productionApi.getMachines({ page_size: 500 }),
    staleTime: 5 * 60_000,
  });

  // Load activity config from DB
  const configQ = useQuery({
    queryKey: ["pm-activity-config"],
    queryFn: () => maintenanceApi.getActivityConfig(),
    staleTime: 60_000,
  });

  const allMachines: any[] = machinesQ.data ?? [];

  // Build section list from distinct machine sections + fallback to config sections
  const machineSections: string[] = Array.from(
    new Set([
      ...allMachines.map((m: any) => m.section).filter(Boolean),
      ...(configQ.data ?? []).map((c: any) => c.section),
    ])
  ).sort();

  const [activeSection, setActiveSection] = useState<string>("");

  // Auto-select first section when data loads
  const effectiveSection = activeSection || machineSections[0] || "";

  const sectionMachines = allMachines.filter((m: any) => m.section === effectiveSection);
  const entryType = getSectionEntryType(effectiveSection);

  // Config for this section
  const sectionConfig = (configQ.data ?? []).find((c: any) => c.section === effectiveSection);
  const activities: string[] = sectionConfig?.activities ?? [];
  const acUnits: string[] = sectionConfig?.ac_units ?? [];

  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + "-01");
  const [dateTo, setDateTo] = useState(today);

  const entriesQ = useQuery({
    queryKey: ["pm-entries", effectiveSection, dateFrom, dateTo],
    queryFn: () => maintenanceApi.getEntries({ section: effectiveSection, date_from: dateFrom, date_to: dateTo, page_size: 200 }),
    enabled: !!effectiveSection,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteEntry(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["pm-entries"] }); },
  });

  const entries: any[] = entriesQ.data?.data ?? [];
  const isLoading = machinesQ.isLoading || configQ.isLoading;

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading sections…</div>;

  if (machineSections.length === 0) return (
    <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
      No machines registered yet. Add machines in the Machines tab first.
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      {/* Section tabs from actual machine data */}
      <div className="flex flex-wrap gap-2">
        {machineSections.map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              effectiveSection === s
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground border-border hover:bg-muted"
            )}>
            {s}
            {sectionMachines.length > 0 && effectiveSection === s &&
              <span className="ml-1.5 opacity-60">({sectionMachines.length})</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Entry form */}
        {canEdit && effectiveSection && (
          <PMSectionEntryForm
            key={effectiveSection}
            section={effectiveSection}
            entryType={entryType}
            machines={sectionMachines}
            activities={activities}
            acUnits={acUnits}
            sectionConfig={sectionConfig}
            canEditConfig={canEdit}
            onSaved={() => qc.invalidateQueries({ queryKey: ["pm-entries"] })}
            onConfigSaved={() => qc.invalidateQueries({ queryKey: ["pm-activity-config"] })}
          />
        )}

        {/* Recent entries log */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold">
                Recent Entries — {effectiveSection}
              </CardTitle>
              <div className="flex gap-2 items-center">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 text-xs w-36" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-7 text-xs w-36" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {entriesQ.isLoading ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : entries.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No entries for this period.</div>
            ) : (
              <div className="divide-y max-h-[520px] overflow-y-auto">
                {entries.map((e: any) => (
                  <div key={e.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30">
                    <div className="flex-shrink-0 text-center min-w-[50px]">
                      <div className="text-xs font-mono font-semibold">{e.entry_date}</div>
                      <div className={cn("text-[10px] px-1 rounded mt-0.5 text-center",
                        e.entry_type === "cot_grinding" ? "bg-amber-100 text-amber-700" :
                        e.entry_type === "ac_plant" ? "bg-cyan-100 text-cyan-700" :
                        "bg-green-100 text-green-700"
                      )}>
                        {e.entry_type === "cot_grinding" ? "Grinding" : e.entry_type === "ac_plant" ? "A/C" : "Activity"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {e.machine_code || e.machine_line_code || e.section}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {e.activity || (e.data && e.data.task) || "—"}
                      </div>
                      {e.done_by && <div className="text-[10px] text-muted-foreground">By: {e.done_by}</div>}
                      {e.remarks && <div className="text-[10px] text-orange-700 italic">{e.remarks}</div>}
                      {e.entry_type === "cot_grinding" && e.data && (
                        <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                          {e.data.dia_lhs != null && <span>LHS: <b>{e.data.dia_lhs}</b>mm</span>}
                          {e.data.dia_rhs != null && <span>RHS: <b>{e.data.dia_rhs}</b>mm</span>}
                          {e.data.shore_hardness && <span>Shore: <b>{e.data.shore_hardness}</b></span>}
                          {e.data.no_of_grindings && <span>Count: <b>{e.data.no_of_grindings}</b></span>}
                          {e.data.next_due && <span className="text-blue-600">Next: {e.data.next_due}</span>}
                        </div>
                      )}
                      {e.entry_type === "ac_plant" && e.data && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {e.data.unit && <span>Unit {e.data.unit} · </span>}{e.data.task}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button onClick={() => deleteMut.mutate(e.id)}
                        className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Unified section entry form — switches based on entry_type ─────────────────
function PMSectionEntryForm({
  section, entryType, machines, activities, acUnits, sectionConfig,
  canEditConfig, onSaved, onConfigSaved,
}: {
  section: string;
  entryType: "activity" | "cot_grinding" | "ac_plant";
  machines: any[];
  activities: string[];
  acUnits: string[];
  sectionConfig: any;
  canEditConfig: boolean;
  onSaved: () => void;
  onConfigSaved: () => void;
}) {
  const [editingConfig, setEditingConfig] = useState(false);

  return (
    <div className="space-y-3">
      {entryType === "activity" && (
        <ActivityEntryForm
          section={section}
          machines={machines}
          activities={activities}
          onSaved={onSaved}
        />
      )}
      {entryType === "cot_grinding" && (
        <CotGrindingEntryForm
          section={section}
          machines={machines}
          onSaved={onSaved}
        />
      )}
      {entryType === "ac_plant" && (
        <ACPlantEntryForm
          section={section}
          acUnits={acUnits}
          activities={activities}
          onSaved={onSaved}
        />
      )}

      {/* Edit activity list config */}
      {canEditConfig && entryType !== "cot_grinding" && (
        <ActivityConfigEditor
          section={section}
          entryType={entryType}
          currentActivities={activities}
          currentAcUnits={acUnits}
          open={editingConfig}
          onOpenChange={setEditingConfig}
          onSaved={onConfigSaved}
        />
      )}
    </div>
  );
}

// ── Activity config editor — edit the activity list for a section ─────────────
function ActivityConfigEditor({
  section, entryType, currentActivities, currentAcUnits, open, onOpenChange, onSaved,
}: {
  section: string; entryType: string;
  currentActivities: string[]; currentAcUnits: string[];
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [acts, setActs] = useState(currentActivities.join("\n"));
  const [units, setUnits] = useState(currentAcUnits.join("\n"));

  const mut = useMutation({
    mutationFn: () => maintenanceApi.upsertActivityConfig(section, {
      entry_type: entryType,
      activities: acts.split("\n").map(s => s.trim()).filter(Boolean),
      ac_units: units.split("\n").map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { toast.success("Config saved"); onOpenChange(false); onSaved(); },
    onError: () => toast.error("Failed to save config"),
  });

  return (
    <>
      <button onClick={() => onOpenChange(true)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1">
        <Wrench className="size-3" /> Edit activity list for {section}
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Activities — {section}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Activities (one per line)</Label>
              <textarea
                value={acts}
                onChange={e => setActs(e.target.value)}
                rows={10}
                className="w-full text-xs border rounded-md p-2 font-mono resize-y bg-background"
                placeholder="General Cleaning&#10;Belt inspection&#10;..."
              />
            </div>
            {entryType === "ac_plant" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">A/C Units (one per line)</Label>
                <textarea
                  value={units}
                  onChange={e => setUnits(e.target.value)}
                  rows={5}
                  className="w-full text-xs border rounded-md p-2 font-mono resize-y bg-background"
                  placeholder="Unit 1&#10;Unit 1A&#10;..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Activity Entry Form ───────────────────────────────────────────────────────
function ActivityEntryForm({ section, machines, activities, onSaved }: {
  section: string; machines: any[]; activities: string[]; onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    entry_date: today,
    machine_code: machines[0]?.code ?? "",
    activity: activities[0] ?? "",
    custom_activity: "",
    done_by: "",
    remarks: "",
    status: "done",
  });

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createEntries([{
      entry_date: form.entry_date,
      section,
      entry_type: "activity",
      machine_code: form.machine_code,
      activity: form.activity === "__custom__" ? form.custom_activity : form.activity,
      done_by: form.done_by,
      remarks: form.remarks,
      status: form.status,
    }]),
    onSuccess: () => { toast.success("Entry saved"); onSaved(); },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Record Activity — {section}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.entry_date}
              onChange={e => setForm({ ...form, entry_date: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="done">Done ✓</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {machines.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Machine</Label>
            <Select value={form.machine_code} onValueChange={v => setForm({ ...form, machine_code: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select machine" /></SelectTrigger>
              <SelectContent className="max-h-52">
                {machines.map((m: any) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.code}{m.name ? ` — ${m.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Activity</Label>
          {activities.length > 0 ? (
            <Select value={form.activity} onValueChange={v => setForm({ ...form, activity: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select activity" /></SelectTrigger>
              <SelectContent className="max-h-52">
                {activities.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                <SelectItem value="__custom__">Other…</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
              placeholder="Describe activity performed…" className="h-8 text-xs" />
          )}
          {form.activity === "__custom__" && (
            <Input value={form.custom_activity}
              onChange={e => setForm({ ...form, custom_activity: e.target.value })}
              placeholder="Describe activity…" className="h-8 text-xs mt-1" />
          )}
          {activities.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              No activities configured — type above or use "Edit activity list" to add defaults.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Done By</Label>
          <Input value={form.done_by} onChange={e => setForm({ ...form, done_by: e.target.value })}
            placeholder="Technician name" className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Remarks</Label>
          <Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })}
            placeholder="Optional notes" className="h-8 text-xs" />
        </div>
        <Button size="sm" className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Cot Grinding Entry Form ───────────────────────────────────────────────────
function CotGrindingEntryForm({ section, machines, onSaved }: {
  section: string; machines: any[]; onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];

  // Derive grinding frequency from section name
  const freqDays = section.toLowerCase().includes("simplex") ? 90
    : section.toLowerCase().includes("draw") ? 20
    : 45; // Ring Frame default

  const [form, setForm] = useState({
    entry_date: today,
    machine_code: machines[0]?.code ?? "",
    dia_lhs: "",
    dia_rhs: "",
    shore_hardness: "",
    no_of_grindings: "",
    done_by: "",
    remarks: "",
  });

  const nextDue = form.entry_date
    ? new Date(new Date(form.entry_date).getTime() + freqDays * 86400000).toISOString().split("T")[0]
    : "";

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createEntries([{
      entry_date: form.entry_date,
      section,
      entry_type: "cot_grinding",
      machine_code: form.machine_code,
      done_by: form.done_by,
      remarks: form.remarks,
      status: "done",
      data: {
        dia_lhs: form.dia_lhs ? parseFloat(form.dia_lhs) : null,
        dia_rhs: form.dia_rhs ? parseFloat(form.dia_rhs) : null,
        shore_hardness: form.shore_hardness || null,
        no_of_grindings: form.no_of_grindings ? parseInt(form.no_of_grindings) : null,
        next_due: nextDue,
        freq_days: freqDays,
      },
    }]),
    onSuccess: () => {
      toast.success("Grinding entry saved");
      onSaved();
      setForm(f => ({ ...f, dia_lhs: "", dia_rhs: "", shore_hardness: "", no_of_grindings: "", remarks: "" }));
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Cot Grinding Record — {section}</CardTitle>
        <p className="text-[11px] text-muted-foreground">Frequency: every {freqDays} days</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Grinding Date</Label>
            <Input type="date" value={form.entry_date}
              onChange={e => setForm({ ...form, entry_date: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Machine</Label>
            <Select value={form.machine_code} onValueChange={v => setForm({ ...form, machine_code: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select machine" /></SelectTrigger>
              <SelectContent className="max-h-52">
                {machines.map((m: any) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.code}{m.name ? ` — ${m.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Dia After Grinding LHS (mm)</Label>
            <Input type="number" step="0.1" value={form.dia_lhs}
              onChange={e => setForm({ ...form, dia_lhs: e.target.value })}
              placeholder="e.g. 36.9" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Dia After Grinding RHS (mm)</Label>
            <Input type="number" step="0.1" value={form.dia_rhs}
              onChange={e => setForm({ ...form, dia_rhs: e.target.value })}
              placeholder="e.g. 36.9" className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Shore Hardness</Label>
            <Input value={form.shore_hardness}
              onChange={e => setForm({ ...form, shore_hardness: e.target.value })}
              placeholder="e.g. 83" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">No. of Grindings</Label>
            <Input type="number" value={form.no_of_grindings}
              onChange={e => setForm({ ...form, no_of_grindings: e.target.value })}
              placeholder="e.g. 3" className="h-8 text-xs" />
          </div>
        </div>

        {nextDue && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 font-medium">
            📅 Next Grinding Due: <span className="font-bold">{nextDue}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Done By</Label>
          <Input value={form.done_by} onChange={e => setForm({ ...form, done_by: e.target.value })}
            placeholder="Technician name" className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Remarks</Label>
          <Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })}
            placeholder="Condition notes…" className="h-8 text-xs" />
        </div>
        <Button size="sm" className="w-full" onClick={() => mut.mutate()}
          disabled={mut.isPending || !form.machine_code}>
          {mut.isPending ? "Saving…" : "Save Grinding Record"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── A/C Plant Entry Form ──────────────────────────────────────────────────────
function ACPlantEntryForm({ section, acUnits, activities, onSaved }: {
  section: string; acUnits: string[]; activities: string[]; onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [rows, setRows] = useState<Array<{ unit: string; task: string; done: boolean }>>([
    { unit: acUnits[0] ?? "", task: activities[0] ?? "", done: true },
  ]);
  const [form, setForm] = useState({ entry_date: today, done_by: "", remarks: "" });

  const addRow = () => setRows(r => [...r, { unit: acUnits[0] ?? "", task: activities[0] ?? "", done: true }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, val: string | boolean) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const validRows = rows.filter(r => r.unit && r.task);

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createEntries(
      validRows.map(r => ({
        entry_date: form.entry_date,
        section,
        entry_type: "ac_plant",
        machine_code: `AC-${r.unit}`,
        activity: r.task,
        done_by: form.done_by,
        remarks: form.remarks,
        status: r.done ? "done" : "pending",
        data: { unit: r.unit, task: r.task },
      }))
    ),
    onSuccess: (res: any) => {
      toast.success(`${res.created} entries saved`);
      onSaved();
      setRows([{ unit: acUnits[0] ?? "", task: activities[0] ?? "", done: true }]);
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Daily Service Log — {section}</CardTitle>
        <p className="text-[11px] text-muted-foreground">Record tasks per unit</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.entry_date}
              onChange={e => setForm({ ...form, entry_date: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Done By</Label>
            <Input value={form.done_by} onChange={e => setForm({ ...form, done_by: e.target.value })}
              placeholder="Technician name" className="h-8 text-xs" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_36px_24px] gap-2 text-[10px] font-semibold text-muted-foreground px-1">
            <span>Unit</span><span>Task</span><span>Done</span><span></span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px_24px] gap-2 items-center">
              <Select value={row.unit} onValueChange={v => updateRow(i, "unit", v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {acUnits.length > 0
                    ? acUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)
                    : <SelectItem value={row.unit || "Unit 1"}>Unit 1</SelectItem>
                  }
                </SelectContent>
              </Select>
              <Select value={row.task} onValueChange={v => updateRow(i, "task", v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Task" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {activities.length > 0
                    ? activities.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)
                    : <SelectItem value={row.task || "General service"}>General service</SelectItem>
                  }
                </SelectContent>
              </Select>
              <input type="checkbox" checked={row.done}
                onChange={e => updateRow(i, "done", e.target.checked)} className="size-4 mx-auto" />
              <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow} className="w-full h-7 text-xs">
            <Plus className="size-3 mr-1" /> Add Row
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Remarks</Label>
          <Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })}
            placeholder="General notes" className="h-8 text-xs" />
        </div>
        <Button size="sm" className="w-full" onClick={() => mut.mutate()}
          disabled={mut.isPending || validRows.length === 0}>
          {mut.isPending ? "Saving…" : `Save ${validRows.length} Entry${validRows.length !== 1 ? "s" : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Day Plan View ────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  "Blowroom":             { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-800" },
  "Carding":              { bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-800" },
  "Drawing":              { bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-800" },
  "Simplex":              { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-800" },
  "Ring Frame":           { bg: "bg-rose-50",   border: "border-rose-200",   badge: "bg-rose-100 text-rose-800" },
  "Autoconer / Winding":  { bg: "bg-cyan-50",   border: "border-cyan-200",   badge: "bg-cyan-100 text-cyan-800" },
  "A/C Plant":            { bg: "bg-lime-50",   border: "border-lime-200",   badge: "bg-lime-100 text-lime-800" },
  "Buffing Room":         { bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-800" },
  "General":              { bg: "bg-slate-50",  border: "border-slate-200",  badge: "bg-slate-100 text-slate-700" },
};

function secColor(sec: string) {
  return SECTION_COLORS[sec] ?? SECTION_COLORS.General;
}

function loadColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  if (pct >= 40) return "bg-blue-500";
  return "bg-green-400";
}

// Holiday / half-day / leave calendar manager for the mill.
function HolidaysDialog({ onChanged }: { year?: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        <CalendarDays className="size-3.5 mr-1" /> Holidays
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mill Calendar — Holidays, Half-days & Leave</DialogTitle>
          </DialogHeader>
          <MillCalendarManager onChanged={onChanged} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DayPlanView() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear]   = useState(today.getFullYear());
  const [section, setSection] = useState("all");
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const planQ = useQuery({
    queryKey: ["maintenance", "day-plan", year, month, section],
    queryFn: () => maintenanceApi.getDayPlan(month, year, section === "all" ? undefined : section),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const plan = planQ.data;
  const days: any[] = plan?.days ?? [];
  const sectionSummary: any[] = plan?.section_summary ?? [];
  const allSections = Array.from(new Set(days.flatMap((d: any) => d.tasks.map((t: any) => t.section)))).sort();

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const toggleDay = (day: number) =>
    setExpandedDays(p => ({ ...p, [day]: !p[day] }));

  const todayDay = today.getMonth() + 1 === month && today.getFullYear() === year
    ? today.getDate() : -1;

  const monthLabel = `${monthNames[month - 1]}_${year}`;

  // Flatten the plan into one row per (day, task) for the full-plan export.
  function flatRows() {
    const out: any[] = [];
    for (const d of days) {
      for (const t of d.tasks ?? []) {
        out.push({
          date: d.date,
          weekday: d.weekday,
          day_status: d.day_type === "holiday" ? "Holiday" : d.day_type === "half_day" ? "Half-day" : "Working",
          section: t.section,
          machine_code: t.machine_code,
          machine_line_code: t.machine_line_code ?? "",
          machine_count: t.machine_count ?? 1,
          description: t.description,
          frequency: t.frequency_label,
          manpower_needed: t.manpower_needed,
          est_min: t.est_min,
          overdue: t.is_overdue ? "Yes" : "",
        });
      }
    }
    return out;
  }

  const planColumns = [
    { key: "date", label: "Date" },
    { key: "weekday", label: "Day" },
    { key: "day_status", label: "Status" },
    { key: "section", label: "Section" },
    { key: "machine_code", label: "Machine" },
    { key: "machine_line_code", label: "Line" },
    { key: "machine_count", label: "Mc Count" },
    { key: "description", label: "Work Description" },
    { key: "frequency", label: "Frequency" },
    { key: "manpower_needed", label: "Persons" },
    { key: "est_min", label: "Est. Min" },
    { key: "overdue", label: "Overdue" },
  ];

  async function exportPlan(fmt: "excel" | "pdf") {
    const rows = flatRows();
    if (rows.length === 0) { toast.error("No tasks to export"); return; }
    const opts = {
      filename: `PM_Day_Plan_${monthLabel}`,
      title: `PM Day Plan — ${monthNames[month - 1]} ${year}`,
      subtitle: section === "all" ? "All sections" : `Section: ${section}`,
      columns: planColumns,
      rows,
    };
    try {
      if (fmt === "excel") await exportToExcel(opts);
      else await exportToPdf(opts);
    } catch (e) { toast.error("Export failed"); }
  }

  // Per-day printable cards: one block per day with its tasks.
  async function exportDayCards(fmt: "excel" | "pdf") {
    const activeDays = days.filter((d: any) => d.total_tasks > 0);
    if (activeDays.length === 0) { toast.error("No tasks to export"); return; }
    if (fmt === "excel") {
      // One sheet-friendly flat layout with day separators
      const rows: any[] = [];
      for (const d of activeDays) {
        rows.push({ date: `${d.date} (${d.weekday})`, machine_code: `— ${d.total_tasks} tasks, ${d.total_manpower_needed} persons, ${d.day_type !== "working" ? d.day_type : "working"} —`, description: "", section: "", manpower_needed: "", est_min: "" });
        for (const t of d.tasks) rows.push({ date: "", section: t.section, machine_code: t.machine_code + (t.machine_line_code ? ` / ${t.machine_line_code}` : ""), description: t.description, manpower_needed: t.manpower_needed, est_min: t.est_min });
      }
      await exportToExcel({
        filename: `PM_DayCards_${monthLabel}`,
        columns: [
          { key: "date", label: "Date" },
          { key: "section", label: "Section" },
          { key: "machine_code", label: "Machine" },
          { key: "description", label: "Work Description" },
          { key: "manpower_needed", label: "Persons" },
          { key: "est_min", label: "Est. Min" },
        ],
        rows,
      });
      return;
    }
    // PDF: a page per day using the same CDN-loaded jsPDF as the rest of the app.
    try {
      const jspdf = await loadJsPDF();
      await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      activeDays.forEach((d: any, idx: number) => {
        if (idx > 0) doc.addPage();
        doc.setFontSize(14);
        doc.text(`PM Job Card — ${d.date} (${d.weekday})`, 14, 18);
        doc.setFontSize(10);
        const status = d.day_type === "holiday" ? "HOLIDAY" : d.day_type === "half_day" ? "HALF-DAY" : "Working day";
        doc.text(`${status}  |  ${d.total_tasks} tasks  |  ${d.total_manpower_needed} persons needed  |  ${Math.round(d.total_est_min / 60 * 10) / 10}h est.${(d.persons_on_leave ?? 0) > 0 ? `  |  ${d.persons_on_leave} on leave` : ""}`, 14, 25);
        (doc as any).autoTable({
          startY: 30,
          head: [["Section", "Machine", "Line", "Work Description", "Persons", "Min"]],
          body: d.tasks.map((t: any) => [t.section, t.machine_code, t.machine_line_code ?? "", t.description, String(t.manpower_needed), String(t.est_min)]),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [37, 99, 235] },
        });
      });
      doc.save(`PM_DayCards_${monthLabel}.pdf`);
    } catch (e) {
      console.error("Per-day PDF export error:", e);
      toast.error("PDF export failed");
    }
  }

  // Export a single day's job card (defaults to today) as a one-page PDF.
  async function exportSingleDay(day: number) {
    const d = days.find((x: any) => x.day === day);
    if (!d || d.total_tasks === 0) { toast.error("No tasks for that day"); return; }
    try {
      const jspdf = await loadJsPDF();
      await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(15);
      doc.text(`PM Job Card — ${d.date} (${d.weekday})`, 14, 18);
      doc.setFontSize(10);
      const status = d.day_type === "holiday" ? "HOLIDAY" : d.day_type === "half_day" ? "HALF-DAY" : "Working day";
      doc.text(`${status}  |  ${d.total_tasks} tasks  |  ${d.total_manpower_needed} persons needed  |  ${Math.round(d.total_est_min / 60 * 10) / 10}h est.${(d.persons_on_leave ?? 0) > 0 ? `  |  ${d.persons_on_leave} on leave` : ""}`, 14, 25);
      (doc as any).autoTable({
        startY: 30,
        head: [["Section", "Machine", "Line", "Work Description", "Persons", "Min"]],
        body: d.tasks.map((t: any) => [t.section, t.machine_code, t.machine_line_code ?? "", t.description, String(t.manpower_needed), String(t.est_min)]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [37, 99, 235] },
      });
      doc.save(`PM_Card_${d.date}.pdf`);
    } catch (e) {
      console.error("Single-day PDF error:", e);
      toast.error("PDF export failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Month navigator */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={prevMonth}>‹</Button>
              <span className="font-semibold text-sm w-28 text-center">
                {monthNames[month - 1]} {year}
              </span>
              <Button variant="outline" size="sm" onClick={nextMonth}>›</Button>
            </div>

            {/* Section filter */}
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {allSections.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-1 ml-auto items-center">
              {/* Holidays manager */}
              <HolidaysDialog year={year} onChanged={() => planQ.refetch()} />

              {/* Export menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs">
                    <Download className="size-3.5 mr-1" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportPlan("excel")}>Full plan — Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportPlan("pdf")}>Full plan — PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportDayCards("pdf")}>Per-day cards — PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportDayCards("excel")}>Per-day cards — Excel</DropdownMenuItem>
                  {todayDay > 0 && (
                    <DropdownMenuItem onClick={() => exportSingleDay(todayDay)}>Today's card — PDF</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View toggle */}
              <Button
                size="sm" variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")} className="h-8 px-3 text-xs"
              >List</Button>
              <Button
                size="sm" variant={viewMode === "grid" ? "default" : "outline"}
                onClick={() => setViewMode("grid")} className="h-8 px-3 text-xs"
              >Grid</Button>
            </div>

            {planQ.isFetching && (
              <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section summary pills */}
      {sectionSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sectionSummary.map((s: any) => {
            const col = secColor(s.section);
            return (
              <div
                key={s.section}
                className={`rounded-lg px-3 py-1.5 border text-xs font-medium ${col.bg} ${col.border} cursor-pointer`}
                onClick={() => setSection(section === s.section ? "all" : s.section)}
              >
                <span className="font-semibold">{s.section}</span>
                <span className="ml-2 text-muted-foreground">{s.total_tasks} tasks · {s.total_manpower_days} MP-days</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Today's Tasks — surfaced at the top when viewing the current month */}
      {!planQ.isLoading && todayDay > 0 && (() => {
        const td = days.find((d: any) => d.day === todayDay);
        const tasks = td?.tasks ?? [];
        const bySection: Record<string, number> = {};
        for (const t of tasks) bySection[t.section] = (bySection[t.section] || 0) + 1;
        return (
          <Card className="border-blue-400 bg-blue-50/40 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="size-4 text-blue-600" />
                <span className="font-semibold text-sm">Today — {monthNames[month - 1]} {todayDay}, {year}</span>
                {tasks.length === 0 ? (
                  <Badge variant="outline" className="ml-auto text-xs">No PM tasks due today</Badge>
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tasks.length} tasks · {td?.total_manpower_needed ?? 0} persons · {Math.round((td?.total_est_min ?? 0) / 60 * 10) / 10}h est.
                  </span>
                )}
              </div>
              {tasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(bySection).sort().map(([sec, n]) => {
                    const col = secColor(sec);
                    return (
                      <span key={sec} className={`rounded-md px-2 py-1 text-xs font-medium border ${col.bg} ${col.border}`}>
                        {sec} ({n})
                      </span>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs ml-1"
                    onClick={() => {
                      setViewMode("list");
                      setExpandedDays((p) => ({ ...p, [todayDay]: true }));
                    }}
                  >
                    View today's tasks
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Loading skeleton */}
      {planQ.isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Grid view — calendar-style */}
      {!planQ.isLoading && viewMode === "grid" && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {days.length > 0 && [...Array(new Date(year, month - 1, 1).getDay())].map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {days.map((d: any) => {
                const isToday = d.day === todayDay;
                const hasTasks = d.total_tasks > 0;
                const overdue = d.tasks.some((t: any) => t.is_overdue);
                return (
                  <div
                    key={d.day}
                    onClick={() => { if (hasTasks) { setViewMode("list"); setExpandedDays(p => ({...p, [d.day]: true})); } }}
                    className={cn(
                      "rounded-md p-1.5 text-center cursor-pointer border min-h-[60px] transition-all",
                      isToday ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400" : "border-transparent hover:border-slate-200",
                      hasTasks ? "hover:bg-slate-50" : "opacity-60",
                    )}
                  >
                    <div className={cn("text-xs font-semibold", isToday ? "text-blue-700" : "text-slate-700")}>{d.day}</div>
                    <div className="text-[10px] text-muted-foreground">{d.weekday}</div>
                    {hasTasks && (
                      <div className={cn(
                        "mt-1 rounded px-1 text-[10px] font-medium",
                        overdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {d.total_tasks}
                      </div>
                    )}
                    {hasTasks && (
                      <div className="mt-1 h-1 rounded-full overflow-hidden bg-slate-200">
                        <div className={cn("h-full rounded-full", loadColor(d.load_pct))}
                          style={{ width: `${Math.min(d.load_pct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>Low load</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/>Medium</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Critical</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List view — day-by-day expandable */}
      {!planQ.isLoading && viewMode === "list" && (
        <div className="space-y-2">
          {days.filter((d: any) => d.total_tasks > 0 || d.day_type === "holiday").map((d: any) => {
            const isToday = d.day === todayDay;
            const isExpanded = expandedDays[d.day] ?? (d.day === todayDay);
            const overdue = d.tasks.some((t: any) => t.is_overdue);

            // Group tasks by section
            const bySection: Record<string, any[]> = {};
            for (const t of d.tasks) {
              (bySection[t.section] = bySection[t.section] || []).push(t);
            }

            return (
              <Card
                key={d.day}
                id={`day-${d.day}`}
                className={cn(
                  "border transition-all scroll-mt-24",
                  isToday ? "border-blue-400 shadow-sm ring-1 ring-blue-300" : "border-border",
                  overdue && !isToday ? "border-red-200" : "",
                )}
              >
                {/* Day header — always visible */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => toggleDay(d.day)}
                >
                  {/* Date */}
                  <div className={cn(
                    "flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center border text-center",
                    isToday ? "bg-blue-600 border-blue-600 text-white" : "bg-muted border-border text-foreground"
                  )}>
                    <span className="text-lg font-bold leading-none">{d.day}</span>
                    <span className="text-[10px] font-medium">{d.weekday}</span>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{d.total_tasks} tasks</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{d.total_manpower_needed} persons needed</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{Math.round(d.total_est_min / 60 * 10) / 10}h est.</span>
                      {d.day_type === "holiday" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-rose-600 hover:bg-rose-600">
                          Holiday{d.holiday_note ? ` · ${d.holiday_note}` : ""}
                        </Badge>
                      )}
                      {d.day_type === "half_day" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500">Half-day</Badge>
                      )}
                      {(d.persons_on_leave ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.persons_on_leave} on leave</Badge>
                      )}
                      {d.overloaded && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Over capacity</Badge>
                      )}
                      {overdue && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue</Badge>
                      )}
                    </div>
                    {(d.day_type !== "working" || (d.persons_on_leave ?? 0) > 0) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {d.available_persons} of capacity available
                        {d.available_min != null && ` · ${Math.round(d.available_min / 60 * 10) / 10}h capacity`}
                      </div>
                    )}
                    {/* Section chips */}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {Object.entries(bySection).map(([sec, tasks]) => {
                        const col = secColor(sec);
                        return (
                          <span key={sec} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${col.badge}`}>
                            {sec} ({tasks.length})
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Load bar */}
                  <div className="flex-shrink-0 w-20 hidden sm:block">
                    <div className="text-[10px] text-muted-foreground text-right mb-1">{d.load_pct}% load</div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", loadColor(d.load_pct))}
                        style={{ width: `${Math.min(d.load_pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  <ChevronRight className={cn("size-4 text-muted-foreground flex-shrink-0 transition-transform", isExpanded && "rotate-90")} />
                </button>

                {/* Expanded: tasks grouped by section */}
                {isExpanded && (
                  <div className="border-t">
                    {Object.entries(bySection).map(([sec, tasks]) => {
                      const col = secColor(sec);
                      const machineList = Array.from(new Set((tasks as any[]).map((t: any) => t.machine_code).filter(Boolean)));
                      return (
                        <div key={sec} className={`${col.bg} border-b last:border-b-0`}>
                          <div className={`px-4 py-1.5 border-b ${col.border} flex items-center gap-2 flex-wrap`}>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${col.badge}`}>{sec}</span>
                            <span className="text-xs text-muted-foreground">{tasks.length} tasks · {tasks.reduce((a: number, t: any) => a + t.manpower_needed, 0)} persons</span>
                            {machineList.length > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1 flex-wrap">
                                <Wrench className="size-3" />
                                {machineList.slice(0, 6).map((mc) => (
                                  <span key={mc as string} className="font-mono bg-white/60 dark:bg-black/20 border border-border/50 rounded px-1">{mc as string}</span>
                                ))}
                                {machineList.length > 6 && <span>+{machineList.length - 6}</span>}
                              </span>
                            )}
                          </div>
                          <div className="divide-y divide-border/50">
                            {tasks.map((t: any) => (
                              <div key={t.id} className="px-4 py-2.5 flex items-start gap-3">
                                {/* Machine / Line / count */}
                                <div className="flex-shrink-0 min-w-[110px]">
                                  <div className="text-xs font-mono font-semibold text-foreground inline-flex items-center gap-1 bg-muted/60 border border-border/50 rounded px-1.5 py-0.5">
                                    <Wrench className="size-3 text-muted-foreground" />
                                    {t.machine_code || "—"}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {t.machine_line_code && (
                                      <span className="text-[10px] text-muted-foreground font-mono">{t.machine_line_code}</span>
                                    )}
                                    {t.machine_count > 1 && (
                                      <span className="text-[10px] text-blue-600">×{t.machine_count}</span>
                                    )}
                                  </div>
                                </div>
                                {/* Task description */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-foreground leading-snug">{t.description}</div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">{t.frequency_label}</span>
                                    {t.shifted && t.original_due && (
                                      <span className="text-[10px] text-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 rounded inline-flex items-center gap-0.5">
                                        ↪ moved from {new Date(t.original_due + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} (off day)
                                      </span>
                                    )}
                                    {t.lubricant_name && (
                                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 rounded">
                                        🛢 {t.lubricant_name} {t.lubricant_quantity}
                                      </span>
                                    )}
                                    {t.is_overdue && (
                                      <span className="text-[10px] text-red-600 font-semibold">⚠ Overdue</span>
                                    )}
                                  </div>
                                </div>
                                {/* Right: manpower + est time */}
                                <div className="flex-shrink-0 text-right">
                                  <div className="text-xs font-semibold text-foreground">{t.manpower_needed} person{t.manpower_needed !== 1 ? "s" : ""}</div>
                                  <div className="text-[10px] text-muted-foreground">{t.est_min} min est.</div>
                                  {t.machine_count > 1 && (
                                    <div className="text-[10px] text-muted-foreground">{t.machine_count} machines</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-end px-4 py-2 border-t bg-muted/10">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportSingleDay(d.day)}>
                        <Download className="size-3.5 mr-1" /> Export this day (PDF)
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          {days.filter((d: any) => d.total_tasks > 0).length === 0 && !planQ.isLoading && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No PM tasks scheduled for {monthNames[month - 1]} {year}.
                {section !== "all" && " Try removing the section filter."}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ManpowerPlanView({
  summary,
  schedulesByDept,
  loading,
}: {
  summary: any;
  schedulesByDept: Record<string, any[]>;
  loading: boolean;
}) {
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }

  const depts: any[] = summary?.departments ?? [];

  if (depts.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Users className="size-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No manpower data yet — import PM schedules first.</p>
        </CardContent>
      </Card>
    );
  }

  const totalPersons = depts.reduce((s, d) => s + (d.manpower ?? 0), 0);
  const totalTasks = summary?.total_schedules ?? 0;
  const overdueTotal = depts.reduce((s, d) => s + (d.overdue_count ?? 0), 0);
  const dueWeekTotal = depts.reduce((s, d) => s + (d.due_this_week ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Manpower", value: totalPersons, icon: <Users className="size-4 text-blue-500" />, sub: "across all depts" },
          { label: "PM Tasks", value: totalTasks, icon: <Wrench className="size-4 text-green-500" />, sub: "active schedules" },
          { label: "Overdue", value: overdueTotal, icon: <AlertTriangle className="size-4 text-red-500" />, sub: "need attention", highlight: overdueTotal > 0 },
          { label: "Due This Week", value: dueWeekTotal, icon: <Clock className="size-4 text-orange-500" />, sub: "coming up" },
        ].map(kpi => (
          <Card key={kpi.label} className={kpi.highlight ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{kpi.icon} {kpi.label}</div>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Combined per-department summary — everything at a glance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Department Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Department</th>
                  <th className="text-right font-medium px-3 py-2">Persons</th>
                  <th className="text-right font-medium px-3 py-2">Machines</th>
                  <th className="text-right font-medium px-3 py-2">PM Tasks</th>
                  <th className="text-right font-medium px-3 py-2">Mc/Person</th>
                  <th className="text-right font-medium px-3 py-2">Utilisation</th>
                  <th className="text-right font-medium px-3 py-2">Overdue</th>
                  <th className="text-right font-medium px-4 py-2">Due/Week</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...depts].sort((a, b) => (b.utilisation_pct ?? 0) - (a.utilisation_pct ?? 0)).map((d: any) => {
                  const util = d.utilisation_pct ?? 0;
                  const utilColor = util >= 100 ? "text-red-600" : util >= 75 ? "text-amber-600" : "text-green-600";
                  return (
                    <tr key={d.department} className="hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{d.department}</td>
                      <td className="px-3 py-2 text-right">{d.manpower ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{d.machine_count ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{d.task_count ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{d.machines_per_person ?? "—"}</td>
                      <td className={cn("px-3 py-2 text-right font-semibold", utilColor)}>{util}%</td>
                      <td className={cn("px-3 py-2 text-right", (d.overdue_count ?? 0) > 0 && "text-red-600 font-medium")}>{d.overdue_count ?? 0}</td>
                      <td className="px-4 py-2 text-right">{d.due_this_week ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 text-xs font-semibold border-t">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{totalPersons}</td>
                  <td className="px-3 py-2 text-right">{depts.reduce((s, d) => s + (d.machine_count ?? 0), 0)}</td>
                  <td className="px-3 py-2 text-right">{depts.reduce((s, d) => s + (d.task_count ?? 0), 0)}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">{overdueTotal}</td>
                  <td className="px-4 py-2 text-right">{dueWeekTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-department cards */}
      {depts.map((dept: any) => {
        const colors = DEPT_COLORS_UTIL[dept.department] ?? DEPT_COLORS_UTIL.General;
        const isExpanded = expandedDepts[dept.department] !== false;
        const util = dept.utilisation_pct ?? 0;
        const deptSchedules = schedulesByDept[dept.department] ?? [];

        return (
          <Card key={dept.department} className={`border ${colors.border} ${colors.bg}`}>
            <CardHeader
              className="p-4 cursor-pointer select-none"
              onClick={() => setExpandedDepts(p => ({ ...p, [dept.department]: !isExpanded }))}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded
                    ? <ChevronDown className="size-4 text-muted-foreground" />
                    : <ChevronRight className="size-4 text-muted-foreground" />}
                  <div>
                    <CardTitle className="text-sm font-semibold">{dept.department}</CardTitle>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-4">
                      <span><Users className="size-3 inline mr-0.5" />{dept.manpower} persons</span>
                      <span>⚙️ {dept.machine_count} machines</span>
                      <span><TrendingUp className="size-3 inline mr-0.5" />{dept.machines_per_person} mc/person</span>
                      <span>{dept.task_count} PM tasks</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {dept.overdue_count > 0 && (
                    <Badge variant="destructive" className="text-xs">{dept.overdue_count} overdue</Badge>
                  )}
                  {dept.due_this_week > 0 && (
                    <Badge className="bg-orange-500 text-white text-xs border-0">{dept.due_this_week} this week</Badge>
                  )}
                  <div className="text-right min-w-[80px]">
                    <div className={`text-lg font-bold ${utilisationColor(util)}`}>{util}%</div>
                    <div className="text-[10px] text-muted-foreground">utilisation</div>
                  </div>
                  {/* Utilisation bar */}
                  <div className="w-24 h-3 bg-muted rounded-full overflow-hidden hidden sm:block">
                    <div
                      className={`h-3 rounded-full transition-all ${colors.bar}`}
                      style={{ width: `${Math.min(util * 5, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="px-4 pb-4 pt-0">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg bg-background/70 p-3 text-center border">
                    <div className="text-xs text-muted-foreground">Shift Capacity</div>
                    <div className="font-semibold">{dept.capacity_min} min</div>
                    <div className="text-[10px] text-muted-foreground">{dept.shift_hrs}h × {dept.manpower} persons</div>
                  </div>
                  <div className="rounded-lg bg-background/70 p-3 text-center border">
                    <div className="text-xs text-muted-foreground">Daily PM Load (avg)</div>
                    <div className="font-semibold">{Math.round(dept.daily_workload_min)} min</div>
                    <div className="text-[10px] text-muted-foreground">spread across all tasks</div>
                  </div>
                  <div className="rounded-lg bg-background/70 p-3 text-center border">
                    <div className="text-xs text-muted-foreground">Remaining capacity</div>
                    <div className={`font-semibold ${util > 80 ? "text-red-600" : "text-green-600"}`}>
                      {Math.round(dept.capacity_min - dept.daily_workload_min)} min/day
                    </div>
                    <div className="text-[10px] text-muted-foreground">available for breakdown</div>
                  </div>
                </div>

                {/* Day-wise plan table */}
                {deptSchedules.length > 0 && (
                  <DayWisePlanTable dept={dept.department} schedules={deptSchedules} />
                )}

                {/* Note about low utilisation */}
                {util < 15 && (
                  <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                    ℹ️ Low daily utilisation is expected — manpower is sized for 6-monthly/yearly overhaul bursts and breakdown response.
                  </div>
                )}
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
      <DirectImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="maintenance_schedules"
        endpoint="/maintenance/schedules/bulk"
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
          qc.invalidateQueries({ queryKey: ["maintenance", "manpower-summary"] });
          qc.invalidateQueries({ queryKey: ["maintenance", "day-plan"] });
        }}
        title="Import PM Schedules"
      />
    </>
  );
}

// Manual single-schedule entry — posts one item to the bulk endpoint so it
// shares the same fields / mill scoping as the Excel import.
function AddScheduleDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();
  const millId = user?.millId ?? "";
  const [form, setForm] = useState({
    machine_code: "",
    department: "",
    task_description: "",
    frequency: "",
    frequency_days: "",
    manpower_count: "",
    machine_count: "",
    last_done_date: "",
    next_due_date: "",
  });

  const mut = useMutation({
    mutationFn: (item: any) =>
      api
        .post(`/maintenance/schedules/bulk?mill_id=${millId}`, { items: [item], mill_id: millId })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      const created = data?.created ?? 0;
      if (created > 0) {
        toast.success("Schedule added");
        qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
        qc.invalidateQueries({ queryKey: ["maintenance", "manpower-summary"] });
        setOpen(false);
        setForm({
          machine_code: "",
          department: "",
          task_description: "",
          frequency: "",
          frequency_days: "",
          manpower_count: "",
          machine_count: "",
          last_done_date: "",
          next_due_date: "",
        });
      } else {
        toast.error(data?.errors?.[0] ?? "Could not add schedule");
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to add schedule"),
  });

  const submit = () => {
    if (!form.machine_code.trim() || !form.task_description.trim()) {
      toast.error("Machine and Work Description are required");
      return;
    }
    mut.mutate({
      machine_code: form.machine_code.trim(),
      department: form.department.trim() || null,
      task_description: form.task_description.trim(),
      frequency: form.frequency.trim() || null,
      frequency_days: form.frequency_days ? Number(form.frequency_days) : null,
      manpower_count: form.manpower_count ? Number(form.manpower_count) : null,
      machine_count: form.machine_count ? Number(form.machine_count) : null,
      last_done_date: form.last_done_date || null,
      next_due_date: form.next_due_date || null,
    });
  };

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5 mr-1.5" />
        Add Schedule
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add PM Schedule</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Machine Code *</Label>
              <Input value={form.machine_code} onChange={(e) => set("machine_code", e.target.value)} placeholder="e.g. Bale_Opener" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Blowroom" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Work Description *</Label>
              <Input value={form.task_description} onChange={(e) => set("task_description", e.target.value)} placeholder="e.g. General Cleaning" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frequency (label)</Label>
              <Input value={form.frequency} onChange={(e) => set("frequency", e.target.value)} placeholder="e.g. 1 Month" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frequency (days)</Label>
              <Input type="number" value={form.frequency_days} onChange={(e) => set("frequency_days", e.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Manpower Count</Label>
              <Input type="number" value={form.manpower_count} onChange={(e) => set("manpower_count", e.target.value)} placeholder="2" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Machine Count</Label>
              <Input type="number" value={form.machine_count} onChange={(e) => set("machine_count", e.target.value)} placeholder="6" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Done</Label>
              <Input type="date" value={form.last_done_date} onChange={(e) => set("last_done_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Next Due</Label>
              <Input type="date" value={form.next_due_date} onChange={(e) => set("next_due_date", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={mut.isPending}>
              {mut.isPending ? "Adding…" : "Add Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <DirectImportModal
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

function MachineDialog({ item }: { item?: MasterMachine }) {
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
            <Label>Section</Label>
            <Select
              value={form.department}
              onValueChange={(v) => setForm({ ...form, department: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {MACHINE_SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
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
