import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionApi, exportApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import type { MachineGroup } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
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
import { Checkbox } from "@/components/ui/checkbox";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { useState, useMemo, useEffect } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Save, LayoutGrid, Plus, Pencil, ArrowDown, ArrowUp, Trash2, Clock, Users2, UserCircle, Layers, PowerOff, FileText, Settings2, X } from "lucide-react";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useMillMasters, useMillMasterCategory } from "@/hooks/useMillConfig";
import { Skeleton } from "@/components/ui/skeleton";

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
  targetKg: number;
};

type CardingRow = {
  machineCode: string;
  machineName: string;
  lot: string;
  status: "running" | "stopped";
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
    targetKg: m.target_kg ?? 0,
  }));
}

function buildCardingRows(machines: any[]): CardingRow[] {
  return (machines ?? []).map((m: any) => ({
    machineCode: m.code ?? "",
    machineName: m.name ?? m.code ?? "",
    lot: "",
    status: "running" as const,
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

  // Operator identification — free text, persisted per session
  const [operatorName, setOperatorName] = useState<string>(() => {
    try { return sessionStorage.getItem("sf_operator") ?? ""; } catch { return ""; }
  });

  // Machine Groups — selected group IDs (supports multi-group mixing)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("sf_machine_groups");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  // Load all machine groups for this mill
  const machineGroupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machineGroups = (machineGroupsQ.data ?? []) as MachineGroup[];
  const hasMachineGroups = machineGroups.length > 0;

  // Helpers for multi-group selection
  function addGroup(id: string) {
    if (!id || selectedGroupIds.includes(id)) return;
    const next = [...selectedGroupIds, id];
    setSelectedGroupIds(next);
    try { sessionStorage.setItem("sf_machine_groups", JSON.stringify(next)); } catch {}
  }
  function removeGroup(id: string) {
    const next = selectedGroupIds.filter((x) => x !== id);
    setSelectedGroupIds(next);
    try { sessionStorage.setItem("sf_machine_groups", JSON.stringify(next)); } catch {}
  }
  function clearGroups() {
    setSelectedGroupIds([]);
    try { sessionStorage.removeItem("sf_machine_groups"); } catch {}
  }

  // Machine section / line filter
  const [selectedSection, setSelectedSection] = useState<string>("all");

  // Section filter only applies when no machine group selected (dept-based flow)
  const sectionsQ = useQuery({
    queryKey: ["machine-sections", departmentId || department, millId],
    queryFn: () => productionApi.getMachineSections({
      ...(departmentId ? { department_id: departmentId } : { department }),
      mill_id: millId,
    }),
    staleTime: 60_000,
    enabled: !!millId && !!(departmentId || department) && selectedGroupIds.length === 0,
  });
  const sections: string[] = sectionsQ.data?.sections ?? [];

  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const first = deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions, department]);

  // Reset section filter when dept changes
  useEffect(() => { setSelectedSection("all"); }, [department]);

  // Clear entered production values when date or shift changes so previous entry data doesn't bleed in
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        producedKg: "",
        wasteKg: "",
        stoppageMins: "",
        stoppageReason: "",
      })),
    );
  }, [date, shift]);

  const [count, setCount] = useState("30s");
  const config = useColumnConfig("production_entries");

  const machinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId, selectedSection, selectedGroupIds],
    queryFn: () => productionApi.getMachines({
      // Machine groups take priority over department filter
      ...(selectedGroupIds.length > 0
        ? { machine_group_ids: selectedGroupIds.join(",") }
        : {
            ...(departmentId ? { department_id: departmentId } : { department }),
            ...(selectedSection && selectedSection !== "all" ? { section: selectedSection } : {}),
          }),
      mill_id: millId,
      page_size: 1000,
      page: 1,
    }),
    staleTime: 60_000,
    enabled: !!millId && (!!(departmentId || department) || selectedGroupIds.length > 0),
  });

  const machines = useMemo(
    () => (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[],
    [machinesQ.data],
  );
  const [rows, setRows] = useState<GridRow[]>(() => buildRows(machines));

  useEffect(() => {
    setRows(buildRows(machines).map((r) => ({ ...r, operator: operatorName })));
  }, [machinesQ.data]);

  // When operator name changes, pre-fill all existing rows
  useEffect(() => {
    setRows((prev) => prev.map((r) => ({ ...r, operator: operatorName })));
    try { sessionStorage.setItem("sf_operator", operatorName); } catch {}
  }, [operatorName]);

  // ── Carding section (visible only when Blowroom is selected) ──────────────
  const isBlowroom = department.toLowerCase().includes("blowroom");

  const cardingMachinesQ = useQuery({
    queryKey: ["machines-carding", millId],
    queryFn: () => productionApi.getMachines({ department: "Carding", mill_id: millId, page_size: 200, page: 1 }),
    staleTime: 60_000,
    enabled: !!millId && isBlowroom,
  });

  const cardingMachines = useMemo(
    () => (Array.isArray(cardingMachinesQ.data) ? cardingMachinesQ.data : (cardingMachinesQ.data?.data ?? [])) as any[],
    [cardingMachinesQ.data],
  );

  const [cardingRows, setCardingRows] = useState<CardingRow[]>([]);

  useEffect(() => {
    if (isBlowroom) setCardingRows(buildCardingRows(cardingMachines));
  }, [cardingMachines, isBlowroom]);

  // Reset carding rows when switching away from Blowroom
  useEffect(() => {
    if (!isBlowroom) setCardingRows([]);
  }, [isBlowroom]);

  const updateCardingRow = (idx: number, field: keyof CardingRow, value: string) => {
    setCardingRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const updateRow = (idx: number, field: keyof GridRow, value: string | number) => {
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
    mutationFn: async () => {
      const activeRows = rows.filter((r) => Number(r.producedKg) > 0);
      if (activeRows.length === 0) throw new Error("No entries to submit");

      // Submit entries (department derived from machines when using machine groups)
      const res = await productionApi.createBulkEntries({
        date,
        shift,
        department: effectiveDepartment,
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

      // Submit linked Carding entries when Blowroom is selected
      if (isBlowroom && cardingRows.length > 0) {
        const cardingEntries = cardingRows.map((r) => ({
          machine_code: r.machineCode,
          produced_kg: 0,
          waste_kg: 0,
          count,
          stoppage_mins: r.status === "stopped" ? 480 : 0, // full shift if stopped
          stoppage_reason: r.status === "stopped" ? "Blowroom linked stoppage" : undefined,
          machine_status: r.status === "running" ? "running" : "breakdown",
          lot_number: r.lot || undefined,
        }));
        await productionApi.createBulkEntries({
          date,
          shift,
          department: "Carding",
          entries: cardingEntries,
        }).catch(() => { /* carding submit failure non-fatal */ });
      }

      return res;
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
      if (isBlowroom) setCardingRows(buildCardingRows(cardingMachines));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeCount = rows.filter((r) => Number(r.producedKg) > 0).length;

  // When machine groups are selected, department is optional (derived from machines)
  const usingGroups = selectedGroupIds.length > 0;
  const effectiveDepartment = usingGroups
    ? (machines[0]?.department || "Mixed")
    : department;

  const requiredBaseFields = ["date", "shift", "count"] as const;
  const allHeaderFilled =
    requiredBaseFields.every((f) => {
      const vals: Record<string, string> = { date, shift, count };
      return typeof vals[f] === "string" && vals[f].trim().length > 0;
    }) && (usingGroups || !!department.trim());

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!date.trim()) errors.date = "This field is required";
    if (!shift.trim()) errors.shift = "This field is required";
    if (!count.trim()) errors.count = "This field is required";
    if (!usingGroups && !department.trim()) errors.department = "This field is required";
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    bulkMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Row 1: Date / Shift / Count (always visible) */}
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
                  .filter(Boolean).join(" ")}
              />
              {requiredErrors.date && <p className="text-xs text-destructive">{requiredErrors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('shift')}{config.isRequired('shift') && <span className="text-destructive"> *</span>}
              </Label>
              <Select value={shift} onValueChange={(v) => { setShift(v as "A" | "B" | "C"); setRequiredErrors((prev) => ({ ...prev, shift: "" })); }}>
                <SelectTrigger className={["h-8 text-sm", requiredErrors.shift ? "border-destructive" : ""].filter(Boolean).join(" ")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
              {requiredErrors.shift && <p className="text-xs text-destructive">{requiredErrors.shift}</p>}
            </div>
            {/* Department — only shown when no machine groups selected */}
            {!usingGroups && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {config.getLabel('department')}<span className="text-destructive"> *</span>
                </Label>
                <Select
                  value={department}
                  onValueChange={(v) => {
                    setDepartment(v);
                    const dOpt = deptOptions.find((d: any) => (typeof d === "string" ? d : d.name) === v);
                    setDepartmentId(dOpt && typeof dOpt !== "string" ? (dOpt.id || null) : null);
                    setRequiredErrors((prev) => ({ ...prev, department: "" }));
                  }}
                >
                  <SelectTrigger className={["h-8 text-sm", requiredErrors.department ? "border-destructive" : ""].filter(Boolean).join(" ")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deptOptions.length === 0
                      ? <SelectItem value="_empty" disabled>Import machines to see departments</SelectItem>
                      : deptOptions.map((d: any) => {
                          const name = typeof d === "string" ? d : d.name;
                          return <SelectItem key={name} value={name}>{name}</SelectItem>;
                        })
                    }
                  </SelectContent>
                </Select>
                {requiredErrors.department && <p className="text-xs text-destructive">{requiredErrors.department}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">
                {config.getLabel('count')}{config.isRequired('count') && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                value={count}
                onChange={(e) => { setCount(e.target.value); setRequiredErrors((prev) => ({ ...prev, count: "" })); }}
                placeholder="e.g. 30s"
                className={["h-8 text-sm", requiredErrors.count ? "border-destructive" : ""].filter(Boolean).join(" ")}
              />
              {requiredErrors.count && <p className="text-xs text-destructive">{requiredErrors.count}</p>}
            </div>
          </div>

          {/* Row 2: Machine Group selector + Entering As */}
          <div className="flex flex-wrap gap-3 items-end pt-1 border-t border-dashed">
            {/* Machine Group primary selector */}
            <div className="flex items-start gap-2 min-w-[280px] flex-1">
              <Layers className="w-4 h-4 text-muted-foreground shrink-0 mt-5" />
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Machine Group
                  {hasMachineGroups && selectedGroupIds.length === 0 && (
                    <span className="ml-1 text-amber-600">(select to filter machines)</span>
                  )}
                </Label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {/* Selected group chips */}
                  {selectedGroupIds.map((gid) => {
                    const g = machineGroups.find((x) => x.id === gid);
                    return g ? (
                      <span key={gid} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full border border-blue-200">
                        {g.name}
                        <button
                          type="button"
                          onClick={() => removeGroup(gid)}
                          className="hover:text-red-600 ml-0.5"
                          aria-label={`Remove ${g.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ) : null;
                  })}
                  {/* Dropdown to add a group */}
                  {hasMachineGroups && (
                    <select
                      className="h-7 text-xs border border-input rounded-md bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-[180px]"
                      value=""
                      onChange={(e) => {
                        const gid = e.target.value;
                        if (gid) addGroup(gid);
                        e.target.value = "";
                      }}
                    >
                      <option value="">{selectedGroupIds.length === 0 ? "— Select machine group —" : "+ Mix another group"}</option>
                      {machineGroups
                        .filter((g) => !selectedGroupIds.includes(g.id))
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({(g.machine_codes ?? []).length} machines)
                          </option>
                        ))}
                    </select>
                  )}
                  {!hasMachineGroups && (
                    <span className="text-xs text-muted-foreground italic">
                      No machine groups — <a href="/masters" className="underline text-primary">create them in Masters</a>
                    </span>
                  )}
                  {selectedGroupIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearGroups}
                      className="text-xs text-muted-foreground underline hover:text-destructive ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Entering As — prominent required field */}
            <div className="flex items-center gap-2 min-w-[220px]">
              <UserCircle className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-semibold text-foreground">
                  Entering as <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Operator name or Emp ID"
                  className="h-8 text-sm font-medium border-primary/40 focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Section chips (only in dept mode) */}
          {!usingGroups && sections.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-dashed">
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Layers className="w-3.5 h-3.5" />
                <span>Line:</span>
              </div>
              <button
                onClick={() => setSelectedSection("all")}
                className={["px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  selectedSection === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-white border-gray-200 text-muted-foreground hover:border-gray-400"].join(" ")}
              >
                All Lines
              </button>
              {sections.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSection(s === selectedSection ? "all" : s)}
                  className={["px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    selectedSection === s ? "bg-blue-600 text-white border-blue-600" : "bg-white border-blue-200 text-blue-700 hover:border-blue-400"].join(" ")}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Carding Machines section (Blowroom only) ───────────────────── */}
      {isBlowroom && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm text-blue-800">
                🧵 Carding Machines — Shift {shift}
              </CardTitle>
              <p className="text-xs text-blue-600 mt-0.5">
                Mark lot & status for each Carding machine linked to this Blowroom shift.
              </p>
            </div>
            {cardingMachinesQ.isFetching && (
              <span className="text-xs text-blue-500 animate-pulse">Loading…</span>
            )}
          </CardHeader>
          <CardContent className="p-0 pb-3">
            {cardingRows.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">
                No Carding machines found. Add them in Masters → Machines with department "Carding".
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-blue-200 bg-blue-100/60 text-xs text-blue-700">
                      <th className="text-left pl-4 py-2 font-medium w-20">MC Code</th>
                      <th className="text-left py-2 font-medium w-32">Name</th>
                      <th className="text-left py-2 font-medium w-36">Lot No.</th>
                      <th className="text-left py-2 font-medium w-36">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardingRows.map((row, idx) => (
                      <tr key={row.machineCode} className="border-b border-blue-100 last:border-0">
                        <td className="pl-4 py-2 font-mono text-xs font-medium text-blue-900">
                          {row.machineCode}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground pr-2">
                          {row.machineName}
                        </td>
                        <td className="py-1.5 pr-3">
                          <Input
                            value={row.lot}
                            onChange={(e) => updateCardingRow(idx, "lot", e.target.value)}
                            placeholder="Lot / Batch no."
                            className="h-7 text-xs w-full border-blue-200 focus:border-blue-400"
                          />
                        </td>
                        <td className="py-1.5 pr-4">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => updateCardingRow(idx, "status", "running")}
                              className={[
                                "flex-1 h-7 rounded-md text-xs font-medium transition-colors",
                                row.status === "running"
                                  ? "bg-green-500 text-white shadow-sm"
                                  : "bg-white border border-green-300 text-green-700 hover:bg-green-50",
                              ].join(" ")}
                            >
                              ✓ Running
                            </button>
                            <button
                              type="button"
                              onClick={() => updateCardingRow(idx, "status", "stopped")}
                              className={[
                                "flex-1 h-7 rounded-md text-xs font-medium transition-colors",
                                row.status === "stopped"
                                  ? "bg-red-500 text-white shadow-sm"
                                  : "bg-white border border-red-300 text-red-700 hover:bg-red-50",
                              ].join(" ")}
                            >
                              ✕ Stopped
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 pt-2 flex gap-4 text-xs text-blue-700">
                  <span className="font-medium">
                    ✓ Running: {cardingRows.filter(r => r.status === "running").length}
                  </span>
                  <span className="font-medium text-red-600">
                    ✕ Stopped: {cardingRows.filter(r => r.status === "stopped").length}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            Machine Grid —{" "}
            {usingGroups
              ? selectedGroupIds.map((gid) => machineGroups.find((x) => x.id === gid)?.name ?? gid).join(" + ")
              : department
            }
            {" "}· Shift {shift} · {date}
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
              {usingGroups ? (
                <>
                  <p>No machines found in the selected group(s). Check Masters → Machine Groups.</p>
                  <Link to="/masters" className="text-primary underline text-xs inline-block">Go to Masters</Link>
                </>
              ) : !department ? (
                hasMachineGroups
                  ? <p>Select a <strong>Machine Group</strong> above to load machines.</p>
                  : <p>Select a <strong>Department</strong> or create Machine Groups in Masters.</p>
              ) : (
                <>
                  <p>No machines in <strong>{department}</strong>. Add them in Masters → Machines.</p>
                  <Link to="/masters" className="text-primary underline text-xs inline-block">Go to Masters</Link>
                </>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[1050px] w-full text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-24 pl-4">{config.getLabel('machine_code')}</TableHead>
                    <TableHead className="w-36">{(() => { const l = config.getLabel('machine_name'); return l === 'machine_name' ? 'name' : l; })()}</TableHead>
                    <TableHead className="w-32">{config.getLabel('operator')}</TableHead>
                    <TableHead className="w-20">{config.getLabel('count')}</TableHead>
                    <TableHead className="w-24">Target (kg)</TableHead>
                    <TableHead className="w-28">{config.getLabel('produced_kg')}</TableHead>
                    <TableHead className="w-20">Efficiency</TableHead>
                    <TableHead className="w-24">{config.getLabel('waste_kg')}</TableHead>
                    <TableHead className="w-32">{config.getLabel('machine_status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((row, idx) => {
                    const hasData = Number(row.producedKg) > 0;
                    const produced = Number(row.producedKg) || 0;
                    const target = row.targetKg || 0;
                    const effPct = target > 0 ? Math.round((produced / target) * 100) : null;
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
                            value={row.targetKg || ""}
                            onChange={(e) => updateRow(idx, "targetKg", Number(e.target.value) || 0)}
                            placeholder="0"
                            className="h-7 text-xs w-full"
                          />
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
                        <TableCell className="text-xs font-semibold">
                          {effPct !== null ? (
                            <span className={effPct >= 90 ? "text-green-600" : effPct >= 75 ? "text-amber-600" : "text-destructive"}>
                              {effPct}%
                            </span>
                          ) : <span className="text-muted-foreground font-normal">—</span>}
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

type WasteRow = { machineCode: string; machineName: string; wasteType: string; lotNo: string; ratio: string; wasteKg: string; remarks: string };

function buildWasteRows(machines: any[]): WasteRow[] {
  return (machines ?? []).map((m: any) => ({
    machineCode: m.code ?? "",
    machineName: m.name ?? m.code ?? "",
    wasteType: "", lotNo: "", ratio: "", wasteKg: "", remarks: "",
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
  // Entry mode: "individual" (per-machine table) or "group" (single form → all machines)
  const [wasteMode, setWasteMode] = useState<"individual" | "group">("individual");
  // Group mode single-form state
  const [groupWasteType, setGroupWasteType] = useState("");
  const [groupLotNo, setGroupLotNo] = useState("");
  const [groupRatio, setGroupRatio] = useState("");
  const [groupWasteKg, setGroupWasteKg] = useState("");
  const [groupRemarks, setGroupRemarks] = useState("");
  // Waste type autocomplete history
  const wasteTypesQ = useQuery({
    queryKey: ["waste-types", millId, department],
    queryFn: () =>
      productionApi.getWasteTypes({ mill_id: millId, department: department || undefined }),
    staleTime: 60_000,
    enabled: !!millId,
  });

  // Machine Group filter
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const machineGroupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machineGroups = (machineGroupsQ.data ?? []) as MachineGroup[];

  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const first = deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions, department]);

  const machinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId, selectedGroupId],
    queryFn: () => productionApi.getMachines(
      selectedGroupId
        ? { machine_group_ids: selectedGroupId, mill_id: millId, page_size: 1000, page: 1 }
        : { ...(departmentId ? { department_id: departmentId } : { department }), mill_id: millId, page_size: 1000, page: 1 }
    ),
    staleTime: 60_000,
    enabled: !!millId && !!(selectedGroupId || departmentId || department),
  });
  const machines = useMemo(
    () => (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[],
    [machinesQ.data],
  );
  const [rows, setRows] = useState<WasteRow[]>(() => buildWasteRows(machines));
  useEffect(() => { setRows(buildWasteRows(machines)); }, [machinesQ.data]);

  const updateWasteRow = (idx: number, field: keyof WasteRow, value: string) => {
    setRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const summary = useMemo(() => ({
    totalWaste: rows.reduce((s, r) => s + (Number(r.wasteKg) || 0), 0),
    filled: rows.filter((r) => Number(r.wasteKg) > 0).length,
  }), [rows]);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!date || !shift || !department) throw new Error("Date, Shift and Department are required");
      if (wasteMode === "group") {
        // Group mode: single form entry → log for every machine in selected group
        if (!selectedGroupId) throw new Error("Select a machine group");
        if (!groupWasteKg || Number(groupWasteKg) <= 0) throw new Error("Enter waste (kg)");
        const groupMachines = machines;
        if (groupMachines.length === 0) throw new Error("No machines found in selected group");
        const machineCodes = groupMachines.map((m: any) => m.code).filter(Boolean);
        const calls = machineCodes.map((mc: string) =>
          productionApi.createWasteBulk({
            date, shift, department,
            entries: [{
              machine_code: mc,
              waste_type: groupWasteType || undefined,
              lot_no: groupLotNo || undefined,
              ratio: groupRatio || undefined,
              waste_kg: Number(groupWasteKg),
              remarks: groupRemarks || undefined,
            }],
          })
        );
        const results = await Promise.allSettled(calls);
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected");
        if (succeeded > 0) {
          toast.success(`Waste logged for ${succeeded} of ${machineCodes.length} machines`);
        }
        failed.forEach((r) => {
          if (r.status === "rejected") toast.warning(`Error: ${r.reason?.message ?? "unknown"}`);
        });
        if (succeeded === 0) throw new Error("All submissions failed");
        return { created: succeeded };
      } else {
        // Individual mode: per-machine table
        const active = rows.filter((r) => Number(r.wasteKg) > 0 && r.machineCode);
        if (active.length === 0) throw new Error("Fill at least one machine's waste (kg)");
        return productionApi.createWasteBulk({
          date, shift, department,
          entries: active.map((r) => ({
            machine_code: r.machineCode,
            waste_type: r.wasteType || undefined,
            lot_no: r.lotNo || undefined,
            ratio: r.ratio || undefined,
            waste_kg: Number(r.wasteKg),
            remarks: r.remarks || undefined,
          })),
        });
      }
    },
    onSuccess: (res: any) => {
      if (wasteMode === "individual") {
        toast.success(`${res.created} waste entries submitted`);
        if (res.errors?.length) res.errors.forEach((e: string) => toast.warning(e));
        setRows(buildWasteRows(machines));
      } else {
        // Reset group form
        setGroupWasteType(""); setGroupLotNo(""); setGroupRatio(""); setGroupWasteKg(""); setGroupRemarks("");
      }
      qc.invalidateQueries({ queryKey: ["waste-entries"] });
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
        <CardContent className="p-4 space-y-3">
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
                setSelectedGroupId("");
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
          {machineGroups.length > 0 && (
            <div className="flex items-start gap-3 flex-wrap">
              <Layers className="size-4 text-muted-foreground shrink-0 mt-2" />
              <div className="flex-1 space-y-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground">
                  Entry Mode
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setWasteMode("individual"); setSelectedGroupId(""); }}
                    className={[
                      "text-xs px-3 py-1.5 rounded border transition-colors",
                      wasteMode === "individual"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary"
                    ].join(" ")}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setWasteMode("group")}
                    className={[
                      "text-xs px-3 py-1.5 rounded border transition-colors",
                      wasteMode === "group"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-muted border-border text-muted-foreground hover:border-amber-400"
                    ].join(" ")}
                  >
                    Group Entry
                  </button>
                </div>
              </div>
              {wasteMode === "group" && (
                <div className="flex-1 space-y-1 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground">
                    Machine Group <span className="text-destructive">*</span>
                    <span className="text-[10px] ml-1">(waste logged for all machines in group)</span>
                  </Label>
                  <Select
                    value={selectedGroupId || ""}
                    onValueChange={(v) => setSelectedGroupId(v)}
                  >
                    <SelectTrigger className="h-8 text-sm w-64 border-amber-400 font-medium">
                      <SelectValue placeholder="Select machine group…" />
                    </SelectTrigger>
                    <SelectContent>
                      {machineGroups.length === 0
                        ? <SelectItem value="_none" disabled>No groups configured</SelectItem>
                        : machineGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  {selectedGroupId && machines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-xs text-muted-foreground">Will log for:</span>
                      {machines.slice(0, 12).map((m: any) => (
                        <span key={m.code} className="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-mono">{m.code}</span>
                      ))}
                      {machines.length > 12 && (
                        <span className="text-xs text-muted-foreground">+{machines.length - 12} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {wasteMode === "individual" && (
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
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Waste Entry — {department} · Shift {shift} · {date}</CardTitle>
          {wasteMode === "individual" ? (
            <Button size="sm" onClick={handleSubmit} disabled={bulkMutation.isPending || summary.filled === 0}>
              <Save className="size-3.5 mr-1.5" />
              {bulkMutation.isPending ? "Saving…" : `Submit (${summary.filled})`}
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit}
              disabled={bulkMutation.isPending || !selectedGroupId || !groupWasteKg}
              className="bg-amber-500 hover:bg-amber-600 text-white">
              <Save className="size-3.5 mr-1.5" />
              {bulkMutation.isPending ? "Saving…" : `Log for ${machines.length} machines`}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {wasteMode === "group" ? (
            /* ── Group mode: single form ── */
            selectedGroupId && machines.length > 0 ? (
              <div className="p-4 space-y-3">
                <div className="text-xs text-muted-foreground mb-1">
                  Fill in one set of values — they will be logged for all {machines.length} machines in the selected group.
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Waste Type</Label>
                    <Input value={groupWasteType} onChange={(e) => setGroupWasteType(e.target.value)}
                      placeholder="e.g. Fly waste" className="h-8 text-sm"
                      list="waste-type-suggestions-group" autoComplete="off" />
                    <datalist id="waste-type-suggestions-group">
                      {(wasteTypesQ.data?.types ?? []).map((t: string) => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lot No</Label>
                    <Input value={groupLotNo} onChange={(e) => setGroupLotNo(e.target.value)}
                      placeholder="e.g. L001" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ratio</Label>
                    <Input value={groupRatio} onChange={(e) => setGroupRatio(e.target.value)}
                      placeholder="60:40" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Waste (kg) <span className="text-destructive">*</span></Label>
                    <Input type="number" min={0} step="0.01" value={groupWasteKg}
                      onChange={(e) => setGroupWasteKg(e.target.value)}
                      placeholder="0" className="h-8 text-sm font-medium" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input value={groupRemarks} onChange={(e) => setGroupRemarks(e.target.value)}
                      placeholder="Remarks…" className="h-8 text-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground text-center">
                {!selectedGroupId
                  ? "Select a machine group above to log waste for all machines at once."
                  : "No machines found in selected group."}
              </div>
            )
          ) : (
            /* ── Individual mode: per-machine table ── */
            rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No machines in <strong>{department}</strong>. Add them in Masters → Machines.
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[800px] w-full text-sm">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-24 pl-4">Machine</TableHead>
                      <TableHead className="w-36">Waste Type</TableHead>
                      <TableHead className="w-32">Lot No</TableHead>
                      <TableHead className="w-24">Ratio</TableHead>
                      <TableHead className="w-28">Waste (kg) *</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={row.machineCode} className={Number(row.wasteKg) > 0 ? "bg-amber-50/50" : undefined}>
                        <TableCell className="pl-4 font-mono text-xs font-medium">{row.machineCode}</TableCell>
                        <TableCell className="relative">
                          <Input
                            value={row.wasteType}
                            onChange={(e) => updateWasteRow(idx, "wasteType", e.target.value)}
                            placeholder="e.g. Fly waste"
                            className="h-7 text-xs w-full"
                            list={`wt-suggestions-${idx}`}
                            autoComplete="off"
                          />
                          <datalist id={`wt-suggestions-${idx}`}>
                            {(wasteTypesQ.data?.types ?? []).map((t: string) => <option key={t} value={t} />)}
                          </datalist>
                        </TableCell>
                        <TableCell>
                          <Input value={row.lotNo} onChange={(e) => updateWasteRow(idx, "lotNo", e.target.value)}
                            placeholder="e.g. L001" className="h-7 text-xs w-full" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.ratio} onChange={(e) => updateWasteRow(idx, "ratio", e.target.value)}
                            placeholder="60:40" className="h-7 text-xs w-full" />
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
            )
          )}
        </CardContent>
      </Card>

      {pastEntries.length > 0 && (
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Submitted Entries — {date} · {shift}</CardTitle>
            <ExportMenu
              filename={`waste_entries_${date}_${shift}`}
              title="Waste Entries"
              subtitle={`Date: ${date}  Shift: ${shift}  Dept: ${department}`}
              columns={[
                { key: "machine_code", label: "Machine" },
                { key: "waste_type", label: "Waste Type" },
                { key: "lot_no", label: "Lot" },
                { key: "ratio", label: "Ratio" },
                { key: "waste_kg", label: "Waste (kg)" },
                { key: "status", label: "Status" },
                { key: "entered_by", label: "Entered By" },
              ]}
              rows={pastEntries}
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="text-sm min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Machine</TableHead>
                    <TableHead>Waste Type</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Ratio</TableHead>
                    <TableHead>Waste kg</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastEntries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 font-mono text-xs">{e.machine_code}</TableCell>
                      <TableCell className="text-xs">{e.waste_type || "—"}</TableCell>
                      <TableCell className="text-xs">{e.lot_no || "—"}</TableCell>
                      <TableCell className="text-xs">{e.ratio || "—"}</TableCell>
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

/** Auto-formats 4-digit input → HH:MM. Avoids slow native scroll picker. */
function TimeInput({ value, onChange, className = "" }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
    onChange(raw.length >= 3 ? raw.slice(0, 2) + ":" + raw.slice(2) : raw);
  };
  return (
    <input
      type="text" inputMode="numeric" value={value} onChange={handle}
      placeholder="HH:MM" maxLength={5}
      className={className}
    />
  );
}

type StopRow = {
  id: string;
  stop_from: string;
  stop_to: string;
  datalog_code: string;
  codeSearch: string;
  showDropdown: boolean;
  section: string;
  production_loss_kg: string;
  dropdownPos: { top: number; left: number; width: number } | null;
};

function makeStopRow(): StopRow {
  return {
    id: Math.random().toString(36).slice(2),
    stop_from: "", stop_to: "", datalog_code: "",
    codeSearch: "", showDropdown: false,
    section: "", production_loss_kg: "",
    dropdownPos: null,
  };
}

function StoppageForm() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];

  // Mode: individual machine OR machine group
  const [stoppageMode, setStoppageMode] = useState<"individual" | "group">("individual");

  // Header state
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [department, setDepartment] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<string>("");

  // Multi-row state
  const [rows, setRows] = useState<StopRow[]>([makeStopRow()]);

  const setRowField = (id: string, field: keyof StopRow, value: any) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((prev) => [...prev, makeStopRow()]);
  const removeRow = (id: string) => setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);

  // Mill masters
  const { data: millMasters } = useMillMasters();
  const deptOptions = millMasters?.department ?? [];
  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const first = deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions]);

  // Stop codes — filtered by selected department (codes with no dept = applies to all)
  const stopCodesQ = useQuery({
    queryKey: ["stop-codes", department],
    queryFn: () => productionApi.getStopCodes(department || undefined),
    staleTime: 5 * 60_000,
    enabled: true,
  });
  const stopCodes = (stopCodesQ.data ?? []) as any[];

  // Machine Group filter
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const machineGroupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machineGroups = (machineGroupsQ.data ?? []) as MachineGroup[];

  // Machines — filtered by group OR department
  const machinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId, "stoppage", selectedGroupId],
    queryFn: () => productionApi.getMachines(
      selectedGroupId
        ? { machine_group_ids: selectedGroupId, mill_id: millId, page_size: 1000, page: 1 }
        : { ...(departmentId ? { department_id: departmentId } : { department }), mill_id: millId, page_size: 1000, page: 1 }
    ),
    staleTime: 60_000,
    enabled: !!millId && !!(selectedGroupId || departmentId || department),
  });
  const machines = (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[];

  useEffect(() => { setSelectedMachine(""); }, [department, selectedGroupId]);

  // Stoppage log date range
  const [logDateFrom, setLogDateFrom] = useState(localDate);
  const [logDateTo, setLogDateTo] = useState(localDate);

  const stoppageLogQ = useQuery({
    queryKey: ["downtime", millId, logDateFrom, logDateTo],
    queryFn: () => productionApi.getDowntimeLogs({ mill_id: millId, page_size: 500, date_from: logDateFrom, date_to: logDateTo }),
    staleTime: 20_000,
    enabled: !!millId,
  });
  const stoppageLogs = (Array.isArray(stoppageLogQ.data) ? stoppageLogQ.data : (stoppageLogQ.data?.data ?? [])) as any[];
  const todayTotal = useMemo(() => stoppageLogs.reduce((s: number, r: any) => s + (r.duration_min || 0), 0), [stoppageLogs]);

  // Helper: auto-calc minutes for a row
  const calcMin = (from: string, to: string) => {
    if (!from || !to) return null;
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    return diff > 0 ? diff : null;
  };

  // Save all mutation — handles both individual and group mode
  const saveMutation = useMutation({
    mutationFn: async () => {
      const validRows = rows.filter((r) => r.datalog_code);
      if (validRows.length === 0) throw new Error("Add at least one row with a stop code");

      let machineCodes: string[] = [];
      if (stoppageMode === "individual") {
        if (!selectedMachine) throw new Error("Select a machine first");
        machineCodes = [selectedMachine];
      } else {
        // Group mode: apply stoppage to all machines in the selected group
        const groupMachines = (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[];
        if (groupMachines.length === 0) throw new Error("No machines found in selected group");
        machineCodes = groupMachines.map((m: any) => m.code).filter(Boolean);
      }

      const calls = machineCodes.flatMap((machine_code) =>
        validRows.map((r) =>
          productionApi.logDatalogDowntime({
            machine_code,
            datalog_code: Number(r.datalog_code),
            stop_from: r.stop_from || undefined,
            stop_to: r.stop_to || undefined,
            date, shift,
            production_loss_kg: r.production_loss_kg ? Number(r.production_loss_kg) : 0,
            remarks: r.section || undefined,
          }, millId ?? "")
        )
      );
      const results = await Promise.allSettled(calls);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failedResults = results.filter((r) => r.status === "rejected");
      if (succeeded === 0 && failedResults.length > 0) {
        const firstErr = (failedResults[0] as PromiseRejectedResult).reason;
        throw new Error(firstErr?.response?.data?.detail || `All ${failedResults.length} row(s) failed to save`);
      }
      return { total: succeeded, failed: failedResults.length, machines: machineCodes.length };
    },
    onSuccess: ({ total, failed, machines }) => {
      const label = stoppageMode === "group"
        ? `${total} stoppages logged across ${machines} machines`
        : `${total} stoppage${total !== 1 ? "s" : ""} saved for ${selectedMachine}`;
      toast.success(label);
      if (failed > 0) {
        toast.warning(`${failed} row(s) could not be saved — they may already exist or the machine was not found.`);
      }
      setRows([makeStopRow()]);
      qc.invalidateQueries({ queryKey: ["downtime"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save stoppages");
    },
  });

  const codedRows = rows.filter((r) => r.datalog_code).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            Log Stoppage — DATALOG Entry
          </CardTitle>
          <div className="flex items-center gap-3">
            {todayTotal > 0 && (
              <span className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                Today: <strong>{stoppageLogs.length} stops · {todayTotal} min total</strong>
              </span>
            )}
            {/* Mode toggle */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 font-medium transition-colors ${stoppageMode === "individual" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => { setStoppageMode("individual"); setSelectedGroupId(""); }}
              >
                Individual
              </button>
              <button
                className={`px-3 py-1.5 font-medium transition-colors border-l ${stoppageMode === "group" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => { setStoppageMode("group"); setSelectedMachine(""); }}
              >
                Machine Group
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── Header: Date / Shift / Department ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as "A" | "B" | "C")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={department} onValueChange={(v) => {
                setDepartment(v);
                setSelectedGroupId("");
                const d = deptOptions.find((x: any) => (typeof x === "string" ? x : x.name) === v);
                setDepartmentId(d && typeof d !== "string" ? (d.id || null) : null);
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select dept" /></SelectTrigger>
                <SelectContent>
                  {deptOptions.map((d: any) => {
                    const name = typeof d === "string" ? d : d.name;
                    return <SelectItem key={name} value={name}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Machine selector — mode-aware ── */}
          {stoppageMode === "individual" ? (
            <div className="space-y-3">
              {/* Group filter (optional, to narrow machine list) */}
              {machineGroups.length > 0 && (
                <div className="flex items-center gap-3">
                  <Layers className="size-4 text-muted-foreground shrink-0" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Machine Group <span className="text-[10px]">(select to filter machines)</span>
                    </Label>
                    <Select
                      value={selectedGroupId || "_all"}
                      onValueChange={(v) => { setSelectedGroupId(v === "_all" ? "" : v); setSelectedMachine(""); }}
                    >
                      <SelectTrigger className="h-8 text-sm w-64">
                        <SelectValue placeholder="— All machines in department —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">— All machines in department —</SelectItem>
                        {machineGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Machine <span className="text-destructive">*</span>
                    {department && <span className="text-muted-foreground font-normal ml-1">({department})</span>}
                  </Label>
                  <Select value={selectedMachine} onValueChange={setSelectedMachine} disabled={!department && !selectedGroupId}>
                    <SelectTrigger className="h-9 text-sm border-primary/40 font-medium">
                      <SelectValue placeholder={department || selectedGroupId ? "Select machine to log stoppages…" : "Select a department first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.length === 0
                        ? <SelectItem value="_none" disabled>No machines found</SelectItem>
                        : machines.map((m: any) => (
                            <SelectItem key={m.code} value={m.code}>{m.code}{m.name ? ` — ${m.name}` : ""}</SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedMachine && (
                  <span className="text-xs text-muted-foreground pb-2 shrink-0">
                    {rows.length} row{rows.length !== 1 ? "s" : ""} · {codedRows} coded
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Group mode — select group, all machines get the stoppage */
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Machine Group <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1 text-[10px]">(stoppage will be logged for all machines in this group)</span>
                </Label>
                <Select
                  value={selectedGroupId || ""}
                  onValueChange={(v) => setSelectedGroupId(v)}
                >
                  <SelectTrigger className="h-9 text-sm border-primary/40 font-medium">
                    <SelectValue placeholder="Select machine group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {machineGroups.length === 0
                      ? <SelectItem value="_none" disabled>No machine groups configured</SelectItem>
                      : machineGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedGroupId && machines.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Will log for:</span>
                  {machines.slice(0, 12).map((m: any) => (
                    <span key={m.code} className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">{m.code}</span>
                  ))}
                  {machines.length > 12 && (
                    <span className="text-xs text-muted-foreground">+{machines.length - 12} more</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Rows table ── */}
          {(stoppageMode === "individual" ? !!selectedMachine : !!selectedGroupId) ? (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60 text-muted-foreground">
                      <th className="text-left px-2 py-1.5 font-medium border-b w-[88px]">From</th>
                      <th className="text-left px-2 py-1.5 font-medium border-b w-[88px]">To</th>
                      <th className="text-center px-2 py-1.5 font-medium border-b w-[52px]">Min</th>
                      <th className="text-left px-2 py-1.5 font-medium border-b min-w-[180px]">Stop Code <span className="text-destructive">*</span></th>
                      <th className="text-left px-2 py-1.5 font-medium border-b w-[88px]">Section</th>
                      <th className="text-left px-2 py-1.5 font-medium border-b w-[80px]">Loss (kg)</th>
                      <th className="border-b w-[28px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const min = calcMin(row.stop_from, row.stop_to);
                      const selectedCode = stopCodes.find((c: any) => String(c.code) === row.datalog_code);
                      const filteredCodes = stopCodes
                        .filter((c: any) => {
                          const q = row.codeSearch.toLowerCase();
                          return !q || String(c.code).includes(q) || (c.name ?? "").toLowerCase().includes(q);
                        })
                        .slice(0, 8);

                      return (
                        <tr key={row.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          {/* From */}
                          <td className="px-1.5 py-1 border-b">
                            <TimeInput value={row.stop_from}
                              onChange={(v) => setRowField(row.id, "stop_from", v)}
                              className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          {/* To */}
                          <td className="px-1.5 py-1 border-b">
                            <TimeInput value={row.stop_to}
                              onChange={(v) => setRowField(row.id, "stop_to", v)}
                              className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          {/* Min (auto) */}
                          <td className="px-1.5 py-1 border-b text-center">
                            <span className={min ? "font-semibold text-amber-600" : "text-muted-foreground"}>
                              {min ?? "—"}
                            </span>
                          </td>
                          {/* Stop code — searchable combobox */}
                          <td className="px-1.5 py-1 border-b">
                            <div className="relative">
                              {selectedCode ? (
                                <div className="flex items-center gap-1 h-7 px-2 rounded border border-primary/40 bg-primary/5 text-xs">
                                  <span className="font-mono font-bold text-primary shrink-0">[{selectedCode.code}]</span>
                                  <span className="truncate text-muted-foreground">{selectedCode.name}</span>
                                  <button type="button"
                                    onClick={() => { setRowField(row.id, "datalog_code", ""); setRowField(row.id, "codeSearch", ""); }}
                                    className="ml-auto text-muted-foreground hover:text-destructive shrink-0 text-base leading-none">×</button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={row.codeSearch}
                                    placeholder="Type code or name…"
                                    onChange={(e) => { setRowField(row.id, "codeSearch", e.target.value); setRowField(row.id, "showDropdown", true); }}
                                    onFocus={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setRowField(row.id, "dropdownPos", { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) });
                                      setRowField(row.id, "showDropdown", true);
                                    }}
                                    onBlur={() => setTimeout(() => setRowField(row.id, "showDropdown", false), 200)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && filteredCodes.length > 0) {
                                        const top = filteredCodes[0];
                                        setRowField(row.id, "datalog_code", String(top.code));
                                        setRowField(row.id, "codeSearch", "");
                                        setRowField(row.id, "showDropdown", false);
                                        e.preventDefault();
                                      }
                                    }}
                                    className="w-full h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  {row.showDropdown && row.dropdownPos && createPortal(
                                    <div style={{
                                      position: "fixed",
                                      top: row.dropdownPos.top,
                                      left: row.dropdownPos.left,
                                      width: row.dropdownPos.width,
                                      zIndex: 9999,
                                    }} className="bg-popover border rounded-md shadow-lg overflow-hidden">
                                      {stopCodesQ.isLoading ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
                                      ) : filteredCodes.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">No codes match — type a code number or name</div>
                                      ) : filteredCodes.map((c: any) => (
                                        <button key={c.code} type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            setRowField(row.id, "datalog_code", String(c.code));
                                            setRowField(row.id, "codeSearch", "");
                                            setRowField(row.id, "showDropdown", false);
                                          }}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-center gap-2 cursor-pointer">
                                          <span className="font-mono font-bold text-primary w-8 shrink-0">{c.code}</span>
                                          <span className="text-foreground truncate">{c.name}</span>
                                        </button>
                                      ))}
                                    </div>,
                                    document.body
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          {/* Section */}
                          <td className="px-1.5 py-1 border-b">
                            <input type="text" value={row.section}
                              onChange={(e) => setRowField(row.id, "section", e.target.value)}
                              placeholder="e.g. A1"
                              className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          {/* Loss */}
                          <td className="px-1.5 py-1 border-b">
                            <input type="number" min={0} step="0.01" value={row.production_loss_kg}
                              onChange={(e) => setRowField(row.id, "production_loss_kg", e.target.value)}
                              placeholder="0"
                              className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          {/* Delete row */}
                          <td className="px-1 py-1 border-b text-center">
                            <button type="button" onClick={() => removeRow(row.id)}
                              disabled={rows.length === 1}
                              className="text-muted-foreground hover:text-destructive disabled:opacity-20 px-1 text-base leading-none">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5 text-xs h-8">
                  <Plus className="size-3.5" />
                  Add Row
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || codedRows === 0}
                  className="gap-2"
                >
                  <Save className="size-4" />
                  {saveMutation.isPending ? "Saving…" : `Save All (${codedRows})`}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {stoppageMode === "group"
                ? (!selectedGroupId ? "Select a machine group above to log stoppages" : "Add rows above and click Save All")
                : (!department ? "Select a department above to get started" : "Select a machine above to log stoppages")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stoppage log date range filter */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="text-xs text-muted-foreground font-medium">Filter log:</span>
        <input
          type="date"
          value={logDateFrom}
          onChange={(e) => setLogDateFrom(e.target.value)}
          className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={logDateTo}
          onChange={(e) => setLogDateTo(e.target.value)}
          className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {(logDateFrom !== localDate || logDateTo !== localDate) && (
          <button
            onClick={() => { setLogDateFrom(localDate); setLogDateTo(localDate); }}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset to today
          </button>
        )}
      </div>

      {/* Live stoppage log table */}
      {stoppageLogs.length > 0 && (
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Stoppage Log ({stoppageLogs.length} entries · {todayTotal} min)</CardTitle>
            <ExportMenu
              filename={`stoppage_log_${logDateFrom}_${logDateTo}`}
              title="Stoppage Log"
              subtitle={logDateFrom === logDateTo ? `Date: ${logDateFrom}` : `Date: ${logDateFrom} to ${logDateTo}`}
              columns={[
                { key: "machine_code", label: "Machine" },
                { key: "datalog_code", label: "Code" },
                { key: "reason", label: "Reason" },
                { key: "started_at", label: "From", format: (v) => v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" },
                { key: "ended_at", label: "To", format: (v) => v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" },
                { key: "duration_min", label: "Min" },
                { key: "production_loss_kg", label: "Loss (kg)" },
                { key: "resolved", label: "Status", format: (v) => v ? "Done" : "Open" },
              ]}
              rows={stoppageLogs}
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm min-w-[650px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Machine</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Min</TableHead>
                    <TableHead>Loss (kg)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stoppageLogs.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4 font-mono text-xs font-medium">{r.machine_code}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{r.datalog_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.reason ?? r.code_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.started_at ? new Date(r.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.ended_at ? new Date(r.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-amber-600">{r.duration_min ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.production_loss_kg ? `${r.production_loss_kg} kg` : "—"}</TableCell>
                      <TableCell><StatusBadge status={r.resolved ? "active" : "pending"} label={r.resolved ? "Done" : "Open"} size="sm" /></TableCell>
                      <TableCell>
                        <ConfirmDeleteButton
                          onConfirm={async () => {
                            await productionApi.deleteDowntime(r.id);
                            qc.invalidateQueries({ queryKey: ["downtime"] });
                          }}
                          label={`Delete stoppage record for ${r.machine_code}?`}
                          title="Delete Stoppage Log?"
                          confirmText="Delete"
                          successMessage="Record deleted"
                        />
                      </TableCell>
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
// MANPOWER TAB — RF Common Category
// ─────────────────────────────────────────────────────────────────

// Declared outside component to avoid infinite useEffect loop (stable reference)
const RF_DEFAULT_CATEGORIES = [
  { id: "line_man",              category: "line_man",              label: "Line Man" },
  { id: "doffer",                category: "doffer",                label: "Doffer" },
  { id: "house_keeper",          category: "house_keeper",          label: "House Keeper" },
  { id: "pneumafil_collection",  category: "pneumafil_collection",  label: "Pneumafil Collection" },
  { id: "floor_cleaner",         category: "floor_cleaner",         label: "Floor Cleaner" },
  { id: "gripperman",            category: "gripperman",            label: "Gripperman" },
  { id: "cope_carrier",          category: "cope_carrier",          label: "Cope Carrier" },
  { id: "robo_doffer",           category: "robo_doffer",           label: "Robo Doffer" },
  { id: "roving_carrier",        category: "roving_carrier",        label: "Roving Carrier" },
  { id: "maintenance_assi",      category: "maintenance_assi",      label: "Maintenance Assistant" },
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

function buildManpowerRows(categories: { category: string; label: string }[]): ManpowerRow[] {
  return categories.map((c) => ({
    category: c.category, categoryLabel: c.label,
    mcIdFrom: "", mcIdTo: "", totalMachines: "", headcount: "", supervisor: "",
  }));
}

// ── ManpowerCategoryEditor — inline add/edit/delete categories per dept ──────

function ManpowerCategoryEditor({
  department, millId, onClose,
}: { department: string; millId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const catQ = useQuery({
    queryKey: ["manpower-categories", millId, department],
    queryFn: () => productionApi.getManpowerCategories({ mill_id: millId, department }),
    staleTime: 0,
    enabled: !!millId && !!department,
  });
  const cats = ((catQ.data?.data ?? []).length > 0
    ? catQ.data?.data
    : RF_DEFAULT_CATEGORIES
  ) as { id: string; category: string; label: string }[];

  const addMut = useMutation({
    mutationFn: (label: string) => {
      const category = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/, "");
      return productionApi.createManpowerCategory({ department, category, label, sort_order: cats.length }, millId);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manpower-categories"] }); setNewLabel(""); toast.success("Category added"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to add"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      productionApi.updateManpowerCategory(id, { label }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manpower-categories"] }); setEditId(null); toast.success("Updated"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => productionApi.deleteManpowerCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manpower-categories"] }); toast.success("Removed"); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to delete"),
  });

  const seedMut = useMutation({
    mutationFn: () => productionApi.getManpowerCategories({ mill_id: millId, department, seed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manpower-categories"] }); toast.success("Default categories seeded"); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="font-semibold text-sm">Manpower Categories</p>
            <p className="text-xs text-muted-foreground">{department}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X className="size-4" />
          </button>
        </div>

        {/* Category list */}
        <div className="divide-y max-h-80 overflow-y-auto">
          {catQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
          ) : cats.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No categories yet.{" "}
              <button onClick={() => seedMut.mutate()} className="text-primary underline">Seed defaults</button>
            </div>
          ) : cats.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 px-4 py-2.5">
              {editId === cat.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="h-7 text-sm flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateMut.mutate({ id: cat.id, label: editLabel });
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <Button size="sm" variant="default" className="h-7 px-2 text-xs"
                    onClick={() => updateMut.mutate({ id: cat.id, label: editLabel })}
                    disabled={updateMut.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditId(null)}>✕</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{cat.label}</span>
                  <button onClick={() => { setEditId(cat.id); setEditLabel(cat.label); }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => { if (confirm(`Remove "${cat.label}"?`)) deleteMut.mutate(cat.id); }}
                    className="text-muted-foreground hover:text-destructive p-1 rounded"
                    disabled={deleteMut.isPending}>
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New category name…"
              className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && newLabel.trim()) addMut.mutate(newLabel.trim()); }}
            />
            <Button size="sm" onClick={() => newLabel.trim() && addMut.mutate(newLabel.trim())}
              disabled={addMut.isPending || !newLabel.trim()}>
              <Plus className="size-3.5 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes apply only to <strong>{department}</strong>.
            {cats === RF_DEFAULT_CATEGORIES && (
              <> Using defaults. <button onClick={() => seedMut.mutate()} className="text-primary underline ml-1">Save to DB</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function ManpowerGrid() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [department, setDepartment] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  // Mode: individual machine OR machine group
  const [manpowerMode, setManpowerMode] = useState<"individual" | "group">("individual");
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  const { data: millMasters } = useMillMasters();
  const deptOptions = (millMasters?.department ?? []) as any[];

  useEffect(() => {
    if (!department && deptOptions.length > 0) {
      const rfDept = deptOptions.find((d: any) => (typeof d === "string" ? d : d.name).toLowerCase().includes("ring"));
      const first = rfDept ?? deptOptions[0];
      const name = typeof first === "string" ? first : first.name;
      const id = typeof first === "string" ? null : (first.id || null);
      setDepartment(name);
      setDepartmentId(id);
    }
  }, [deptOptions, department]);

  // Machine groups
  const machineGroupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machineGroups = (machineGroupsQ.data ?? []) as MachineGroup[];

  // Machines for dept / group
  const mpMachinesQ = useQuery({
    queryKey: ["machines", departmentId || department, millId, "manpower", selectedGroupId],
    queryFn: () => productionApi.getMachines(
      selectedGroupId
        ? { machine_group_ids: selectedGroupId, mill_id: millId, page_size: 1000, page: 1 }
        : { ...(departmentId ? { department_id: departmentId } : { department }), mill_id: millId, page_size: 1000, page: 1 }
    ),
    staleTime: 60_000,
    enabled: !!millId && !!(selectedGroupId || departmentId || department),
  });
  const mpMachines = (Array.isArray(mpMachinesQ.data) ? mpMachinesQ.data : (mpMachinesQ.data?.data ?? [])) as any[];

  // Per-dept categories
  const categoriesQ = useQuery({
    queryKey: ["manpower-categories", millId, department],
    queryFn: () => productionApi.getManpowerCategories({ mill_id: millId, department }),
    staleTime: 60_000,
    enabled: !!millId && !!department,
  });
  const deptCategories = (
    categoriesQ.isError || (categoriesQ.data?.data ?? []).length === 0
      ? RF_DEFAULT_CATEGORIES
      : (categoriesQ.data?.data ?? [])
  ) as { id: string; category: string; label: string }[];

  const [rows, setRows] = useState<ManpowerRow[]>(() => buildManpowerRows(RF_DEFAULT_CATEGORIES));

  // Rebuild rows when dept categories change
  const deptCatKey = deptCategories.map((c) => c.category).join(",");
  useEffect(() => {
    setRows(buildManpowerRows(deptCategories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptCatKey]);

  const updateRow = (idx: number, field: keyof ManpowerRow, value: string) =>
    setRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });

  const totalHeadcount = useMemo(() => rows.reduce((s, r) => s + (Number(r.headcount) || 0), 0), [rows]);

  // Load existing plan
  const existingQ = useQuery({
    queryKey: ["rf-manpower", date, shift, millId, department, manpowerMode === "individual" ? selectedMachine : selectedGroupId],
    queryFn: () => productionApi.getRFManpower({ date, shift, mill_id: millId }),
    staleTime: 30_000,
    enabled: !!millId && !!date,
  });

  useEffect(() => {
    const existing = (existingQ.data?.data ?? []) as any[];
    if (!existing.length) return;
    const filterKey = manpowerMode === "individual" ? selectedMachine : undefined;
    setRows((prev) => prev.map((row) => {
      const match = existing.find((e: any) => e.category === row.category && (!filterKey || e.mc_id_from === filterKey));
      if (!match) return row;
      return { ...row, mcIdFrom: match.mc_id_from ?? "", mcIdTo: match.mc_id_to ?? "", totalMachines: String(match.total_machines ?? ""), headcount: String(match.headcount ?? ""), supervisor: match.supervisor ?? "" };
    }));
  }, [existingQ.data, manpowerMode, selectedMachine]);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const filled = rows.filter((r) => Number(r.headcount) > 0);
      if (!date || !shift) throw new Error("Date and Shift are required");
      if (filled.length === 0) throw new Error("Enter headcount for at least one category");

      if (manpowerMode === "individual") {
        if (!selectedMachine) throw new Error("Select a machine first");
        const res = await productionApi.upsertRFManpowerBulk({
          date, shift,
          rows: filled.map((r) => ({ category: r.category, mc_id_from: selectedMachine, mc_id_to: row_mcTo(r, mpMachines, selectedMachine), total_machines: r.totalMachines ? Number(r.totalMachines) : 1, headcount: Number(r.headcount), supervisor: r.supervisor || undefined })),
        }, millId ?? "");
        return { upserted: res.upserted, errors: res.errors ?? [], machines: 1, label: `Saved for ${selectedMachine}` };
      } else {
        if (!selectedGroupId) throw new Error("Select a machine group first");
        const groupMachines = mpMachines;
        if (groupMachines.length === 0) throw new Error("No machines in selected group");
        const codes = groupMachines.map((m: any) => m.code).filter(Boolean);
        const calls = codes.map((mc: string) =>
          productionApi.upsertRFManpowerBulk({
            date, shift,
            rows: filled.map((r) => ({ category: r.category, mc_id_from: mc, mc_id_to: undefined, total_machines: 1, headcount: Number(r.headcount), supervisor: r.supervisor || undefined })),
          }, millId ?? "")
        );
        const results = await Promise.allSettled(calls);
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (succeeded === 0) throw new Error(failed[0]?.reason?.response?.data?.detail || "All machines failed");
        const total = results.reduce((s, r) => s + (r.status === "fulfilled" ? (r.value as any).upserted : 0), 0);
        return { upserted: total, errors: failed.map((f) => f.reason?.message ?? "error"), machines: codes.length, label: `Saved ${total} rows across ${codes.length} machines` };
      }
    },
    onSuccess: ({ label, errors: errs }) => {
      toast.success(label);
      if (errs.length > 0) toast.warning(`${errs.length} error(s) — some rows may not have saved`);
      qc.invalidateQueries({ queryKey: ["rf-manpower"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Helper: find the last machine in department for mc_id_to (used in individual mode)
  function row_mcTo(row: ManpowerRow, machines: any[], fromCode: string): string | undefined {
    return row.mcIdTo || undefined;
  }

  const [showCatEditor, setShowCatEditor] = useState(false);

  const readyToFill = manpowerMode === "individual" ? !!selectedMachine : !!selectedGroupId;
  const saveLabel = bulkMutation.isPending ? "Saving…"
    : manpowerMode === "group" && selectedGroupId && mpMachines.length > 0
      ? `Save for ${mpMachines.length} machines`
      : "Save Plan";

  return (
    <div className="space-y-4">
      {showCatEditor && millId && department && (
        <ManpowerCategoryEditor
          department={department}
          millId={millId}
          onClose={() => setShowCatEditor(false)}
        />
      )}
      {/* ── Header card: date / shift / dept ── */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users2 className="size-4 text-muted-foreground" />
            Manpower Plan
          </CardTitle>
          {/* Mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 font-medium transition-colors ${manpowerMode === "individual" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              onClick={() => { setManpowerMode("individual"); setSelectedGroupId(""); setSelectedMachine(""); }}
            >Individual</button>
            <button
              className={`px-3 py-1.5 font-medium transition-colors border-l ${manpowerMode === "group" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              onClick={() => { setManpowerMode("group"); setSelectedMachine(""); setSelectedGroupId(""); }}
            >Machine Group</button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Date / Shift / Dept row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift *</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as "A" | "B" | "C")}>
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
                setSelectedGroupId(""); setSelectedMachine("");
                const d = deptOptions.find((x: any) => (typeof x === "string" ? x : x.name) === v);
                setDepartmentId(d && typeof d !== "string" ? (d.id || null) : null);
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select dept" /></SelectTrigger>
                <SelectContent>
                  {deptOptions.map((d: any) => { const name = typeof d === "string" ? d : d.name; return <SelectItem key={name} value={name}>{name}</SelectItem>; })}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-center">
              <div className="text-xs text-muted-foreground">Total Headcount</div>
              <div className="text-xl font-bold mt-0.5">{totalHeadcount} <span className="text-sm font-normal text-muted-foreground">workers</span></div>
            </div>
          </div>

          {/* Machine / Group selector */}
          {manpowerMode === "individual" ? (
            <div className="space-y-3">
              {machineGroups.length > 0 && (
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Filter by Machine Group <span className="text-[10px]">(optional)</span></Label>
                    <Select value={selectedGroupId || "_all"} onValueChange={(v) => { setSelectedGroupId(v === "_all" ? "" : v); setSelectedMachine(""); }}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">— All machines in department —</SelectItem>
                        {machineGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Machine <span className="text-destructive">*</span></Label>
                <Select value={selectedMachine} onValueChange={setSelectedMachine} disabled={!department}>
                  <SelectTrigger className="h-9 text-sm border-primary/50 font-medium">
                    <SelectValue placeholder={department ? "Select a machine…" : "Select department first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mpMachines.length === 0
                      ? <SelectItem value="_none" disabled>{mpMachinesQ.isLoading ? "Loading…" : "No machines found"}</SelectItem>
                      : mpMachines.map((m: any) => <SelectItem key={m.code} value={m.code}>{m.code}{m.name ? ` — ${m.name}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">
                Machine Group <span className="text-destructive">*</span>
                <span className="text-muted-foreground font-normal ml-1 text-[10px]">— headcount saved for every machine in this group</span>
              </Label>
              <Select value={selectedGroupId || ""} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="h-9 text-sm border-primary/50 font-medium">
                  <SelectValue placeholder="Select machine group…" />
                </SelectTrigger>
                <SelectContent>
                  {machineGroups.length === 0
                    ? <SelectItem value="_none" disabled>No machine groups configured</SelectItem>
                    : machineGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedGroupId && mpMachines.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground shrink-0 self-center">Will log for:</span>
                  {mpMachines.slice(0, 16).map((m: any) => (
                    <span key={m.code} className="text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono">{m.code}</span>
                  ))}
                  {mpMachines.length > 16 && <span className="text-xs text-muted-foreground self-center">+{mpMachines.length - 16} more</span>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Category table — always visible once dept selected ── */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {department || "—"} — Categories
            {categoriesQ.isLoading && <span className="text-xs font-normal text-muted-foreground ml-2">(loading…)</span>}
            {readyToFill && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                · {manpowerMode === "individual" ? selectedMachine : `${mpMachines.length} machines`}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowCatEditor(true)} disabled={!department}>
              <Settings2 className="size-3.5 mr-1.5" />
              Manage
            </Button>
            <Button size="sm" onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending || !readyToFill || totalHeadcount === 0}>
              <Save className="size-3.5 mr-1.5" />
              {saveLabel}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!readyToFill ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {manpowerMode === "individual"
                ? "Select a machine above to enter headcount per category"
                : "Select a machine group above to enter headcount for all machines in it"}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No categories for <strong>{department}</strong>. Add them in Masters → Manpower Categories.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm min-w-[480px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4 w-56">Category</TableHead>
                    <TableHead className="w-32 text-right pr-4">Headcount</TableHead>
                    <TableHead>Supervisor / Incharge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={row.category} className={Number(row.headcount) > 0 ? "bg-primary/5" : ""}>
                      <TableCell className="pl-4 font-medium text-sm">{row.categoryLabel}</TableCell>
                      <TableCell className="pr-4">
                        <Input
                          type="number" min={0}
                          value={row.headcount}
                          onChange={(e) => updateRow(idx, "headcount", e.target.value)}
                          placeholder="0"
                          className="h-8 text-sm w-full text-right font-medium"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.supervisor}
                          onChange={(e) => updateRow(idx, "supervisor", e.target.value)}
                          placeholder="Name (optional)"
                          className="h-8 text-sm w-full"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow className="bg-muted/60 font-semibold">
                    <TableCell className="pl-4 text-sm">Total</TableCell>
                    <TableCell className="pr-4 text-right text-sm font-bold">{totalHeadcount}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Categories are per-department. Customise in Masters → Manpower Categories.
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
        <ArrowDown className="size-4 mr-1" />
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

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION REPORTS TAB
// ─────────────────────────────────────────────────────────────────────────────

type ReportRecordType = "entries" | "wastage" | "packing" | "stoppage" | "manpower";

const PROD_REPORT_TYPES: { value: ReportRecordType; label: string; icon: any }[] = [
  { value: "entries",  label: "Shift Entries", icon: LayoutGrid },
  { value: "wastage",  label: "Wastage",       icon: Trash2 },
  { value: "packing",  label: "Packing",       icon: Save },
  { value: "stoppage", label: "Stoppage",      icon: Clock },
  { value: "manpower", label: "Manpower",      icon: Users2 },
];

const PROD_REPORT_COLS: Record<ReportRecordType, { key: string; label: string }[]> = {
  entries: [
    { key: "date",         label: "Date" },
    { key: "shift",        label: "Shift" },
    { key: "department",   label: "Dept" },
    { key: "machine_code", label: "Machine" },
    { key: "count_ne",     label: "Count (Ne)" },
    { key: "produced_kg",  label: "Produced (kg)" },
    { key: "target_kg",    label: "Target (kg)" },
    { key: "efficiency_pct", label: "Eff %" },
    { key: "status",       label: "Status" },
    { key: "entered_by",   label: "By" },
  ],
  wastage: [
    { key: "date",         label: "Date" },
    { key: "shift",        label: "Shift" },
    { key: "department",   label: "Dept" },
    { key: "machine_code", label: "Machine" },
    { key: "waste_type",   label: "Waste Type" },
    { key: "waste_kg",     label: "Waste (kg)" },
    { key: "lot_no",       label: "Lot" },
    { key: "ratio",        label: "Ratio" },
    { key: "remarks",      label: "Remarks" },
    { key: "entered_by",   label: "By" },
  ],
  packing: [
    { key: "date",         label: "Date" },
    { key: "shift",        label: "Shift" },
    { key: "lot_no",       label: "Lot No" },
    { key: "count_ne",     label: "Count Ne" },
    { key: "count_desc",   label: "Count Desc" },
    { key: "bag_from",     label: "Bag From" },
    { key: "bag_to",       label: "Bag To" },
    { key: "total_bags",   label: "Total Bags" },
    { key: "operator",     label: "Operator" },
  ],
  stoppage: [
    { key: "date",               label: "Date" },
    { key: "machine_code",       label: "Machine" },
    { key: "datalog_code",       label: "Stop Code" },
    { key: "reason",             label: "Reason" },
    { key: "started_at",         label: "From" },
    { key: "ended_at",           label: "To" },
    { key: "duration_min",       label: "Duration (min)" },
    { key: "production_loss_kg", label: "Loss (kg)" },
    { key: "stop_type",          label: "Type" },
  ],
  manpower: [
    { key: "date",          label: "Date" },
    { key: "shift",         label: "Shift" },
    { key: "category",      label: "Category" },
    { key: "mc_id_from",    label: "MC From" },
    { key: "mc_id_to",      label: "MC To" },
    { key: "total_machines", label: "Machines" },
    { key: "headcount",     label: "Headcount" },
    { key: "supervisor",    label: "Supervisor" },
  ],
};

function ProductionReportsTab() {
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400_000);
  const defaultFrom = new Date(sevenDaysAgo.getTime() - sevenDaysAgo.getTimezoneOffset() * 60000).toISOString().split("T")[0];

  const [recordType, setRecordType] = useState<ReportRecordType>("wastage");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(localDate);
  const [shift, setShift] = useState<string>("_all");
  const [department, setDepartment] = useState<string>("");
  const [machineCode, setMachineCode] = useState<string>("");

  const { data: millMasters } = useMillMasters();
  const deptOptions = (millMasters?.department ?? []) as any[];

  const machineGroupsQ = useQuery({
    queryKey: ["machine-groups", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const machineGroups = (machineGroupsQ.data ?? []) as MachineGroup[];
  const [machineGroupId, setMachineGroupId] = useState<string>("");

  const baseParams = {
    mill_id: millId,
    date_from: dateFrom,
    date_to: dateTo,
    ...(shift !== "_all" ? { shift } : {}),
    ...(department ? { department } : {}),
    ...(machineCode ? { machine_code: machineCode } : {}),
    page_size: 1000,
  };

  const entriesQ = useQuery({
    queryKey: ["prod-report-entries", millId, dateFrom, dateTo, shift, department, machineCode],
    queryFn: () => productionApi.getEntries(baseParams),
    enabled: !!millId && recordType === "entries",
    staleTime: 30_000,
  });
  const wasteQ = useQuery({
    queryKey: ["prod-report-waste", millId, dateFrom, dateTo, shift, department, machineCode],
    queryFn: () => productionApi.getWasteEntries(baseParams),
    enabled: !!millId && recordType === "wastage",
    staleTime: 30_000,
  });
  const packingQ = useQuery({
    queryKey: ["prod-report-packing", millId, dateFrom, dateTo, shift],
    queryFn: async () => {
      const { api } = await import("@/lib/api");
      const r = await api.get("/production/packing/entries", { params: { mill_id: millId, date_from: dateFrom, date_to: dateTo, ...(shift !== "_all" ? { shift } : {}), page_size: 1000 } });
      return r.data;
    },
    enabled: !!millId && recordType === "packing",
    staleTime: 30_000,
  });
  const stoppageQ = useQuery({
    queryKey: ["prod-report-stoppage", millId, dateFrom, dateTo, shift, department, machineCode],
    queryFn: () => productionApi.getDowntimeLogs({ mill_id: millId, date_from: dateFrom, date_to: dateTo, ...(shift !== "_all" ? { shift } : {}), ...(machineCode ? { machine_code: machineCode } : {}), page_size: 1000 }),
    enabled: !!millId && recordType === "stoppage",
    staleTime: 30_000,
  });
  const manpowerQ = useQuery({
    queryKey: ["prod-report-manpower", millId, dateFrom, dateTo, shift],
    queryFn: () => productionApi.getRFManpower({ mill_id: millId, date_from: dateFrom, date_to: dateTo, ...(shift !== "_all" ? { shift } : {}) }),
    enabled: !!millId && recordType === "manpower",
    staleTime: 30_000,
  });

  const entryRows    = (entriesQ.data?.data  ?? entriesQ.data  ?? []) as any[];
  const wasteRows    = (wasteQ.data?.data    ?? wasteQ.data    ?? []) as any[];
  const packingRows  = (packingQ.data?.data  ?? packingQ.data  ?? []) as any[];
  const stoppageRows = (Array.isArray(stoppageQ.data) ? stoppageQ.data : (stoppageQ.data?.data ?? [])) as any[];
  const manpowerRows = (manpowerQ.data?.data ?? []) as any[];

  const activeRows =
    recordType === "entries"  ? entryRows
    : recordType === "wastage"  ? wasteRows
    : recordType === "packing"  ? packingRows
    : recordType === "stoppage" ? stoppageRows
    : manpowerRows;

  const isLoading =
    (recordType === "entries"  && entriesQ.isLoading)
    || (recordType === "wastage"  && wasteQ.isLoading)
    || (recordType === "packing"  && packingQ.isLoading)
    || (recordType === "stoppage" && stoppageQ.isLoading)
    || (recordType === "manpower" && manpowerQ.isLoading);

  const cols = PROD_REPORT_COLS[recordType];
  const hasDeptFilter = ["entries", "wastage", "stoppage"].includes(recordType);
  const hasMachineFilter = ["entries", "wastage", "stoppage"].includes(recordType);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Record type pills */}
          <div className="flex flex-wrap gap-1.5">
            {PROD_REPORT_TYPES.map((rt) => (
              <button
                key={rt.value}
                onClick={() => setRecordType(rt.value)}
                className={[
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-medium transition-colors",
                  recordType === rt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40",
                ].join(" ")}
              >
                <rt.icon className="size-3" />
                {rt.label}
              </button>
            ))}
          </div>

          {/* Date / Shift / Dept / Machine filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Shifts</SelectItem>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasDeptFilter && (
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select value={department || "_all"} onValueChange={(v) => setDepartment(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All depts" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Departments</SelectItem>
                    {deptOptions.map((d: any) => {
                      const name = typeof d === "string" ? d : d.name;
                      return <SelectItem key={name} value={name}>{name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            {hasMachineFilter && machineGroups.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Layers className="size-3" /> Machine Group</Label>
                <Select value={machineGroupId || "_all"} onValueChange={(v) => { setMachineGroupId(v === "_all" ? "" : v); setMachineCode(""); }}>
                  <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All groups" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Groups</SelectItem>
                    {machineGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {hasMachineFilter && (
              <div className="space-y-1">
                <Label className="text-xs">Machine</Label>
                <Input value={machineCode} onChange={(e) => setMachineCode(e.target.value)}
                  placeholder="e.g. CD_001" className="h-8 text-xs w-28" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">
            {PROD_REPORT_TYPES.find((r) => r.value === recordType)?.label} Records
            {!isLoading && activeRows.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({activeRows.length} rows)</span>
            )}
          </CardTitle>
          {activeRows.length > 0 && (
            <ExportMenu
              filename={`${recordType}_${dateFrom}_${dateTo}`}
              title={`${PROD_REPORT_TYPES.find((r) => r.value === recordType)?.label} Report`}
              subtitle={`${dateFrom} to ${dateTo}${shift !== "_all" ? `  Shift ${shift}` : ""}${department ? `  ${department}` : ""}`}
              columns={cols}
              rows={activeRows}
            />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="size-4 animate-spin" /> Loading…
            </div>
          ) : activeRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No records found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs min-w-max">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {cols.map((c) => (
                      <TableHead key={c.key} className="px-3 py-2 whitespace-nowrap">{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRows.map((row: any, i: number) => (
                    <TableRow key={row.id ?? i} className="hover:bg-muted/30">
                      {cols.map((c) => {
                        let val = row[c.key];
                        // Derive date/shift from started_at if missing (stoppage records)
                        if (c.key === "date" && (val == null || val === "") && row.started_at) {
                          val = row.started_at.slice(0, 10);
                        }
                        if (c.key === "shift" && (val == null || val === "") && row.stop_type) {
                          val = row.stop_type;
                        }
                        // Format timestamps
                        if (typeof val === "string" && val.length > 10 && val.includes("T")) {
                          try { val = val.slice(0, 16).replace("T", " "); } catch {}
                        }
                        return (
                          <TableCell key={c.key} className="px-3 py-1.5 whitespace-nowrap">
                            {val != null && val !== "" ? String(val) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKING GRID
// ─────────────────────────────────────────────────────────────────────────────

type PackingRow = {
  _localId: string;          // ephemeral key for React
  id?: string;               // set after save
  lot_no: string;
  count_ne: string;
  count_desc: string;
  bag_from: string;
  bag_to: string;
  total_bags: string;
  machine_code: string;
  operator: string;
  supervisor?: string;
  remarks: string;
  status?: string;
};

const EMPTY_PACKING_ROW = (): PackingRow => ({
  _localId: crypto.randomUUID(),
  lot_no: "",
  count_ne: "",
  count_desc: "",
  bag_from: "",
  bag_to: "",
  total_bags: "",
  machine_code: "",
  operator: "",
  remarks: "",
});

function computeTotal(row: PackingRow): string {
  const f = parseInt(row.bag_from, 10);
  const t = parseInt(row.bag_to, 10);
  if (!isNaN(f) && !isNaN(t) && t >= f) return String(t - f + 1);
  return "";
}

function PackingGrid() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];
  const [date, setDate] = useState(localDate);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [supervisor, setSupervisor] = useState("");
  const [rows, setRows] = useState<PackingRow[]>([EMPTY_PACKING_ROW()]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Fetch existing entries for the selected date+shift
  const entriesQ = useQuery({
    queryKey: ["packing-entries", millId, date, shift],
    queryFn: async () => {
      const r = await api.get(
        `/production/packing/entries?date=${date}&shift=${shift}&page_size=200`
      );
      return (r.data?.data ?? []) as PackingRow[];
    },
    enabled: !!millId && !!date,
    staleTime: 30_000,
  });

  // Load fetched entries into grid
  useEffect(() => {
    const fetched = entriesQ.data;
    if (fetched && fetched.length > 0) {
      setRows(
        fetched.map((e: any) => ({
          _localId: e.id,
          id: e.id,
          lot_no: e.lot_no ?? "",
          count_ne: e.count_ne != null ? String(e.count_ne) : "",
          count_desc: e.count_desc ?? "",
          bag_from: e.bag_from != null ? String(e.bag_from) : "",
          bag_to: e.bag_to != null ? String(e.bag_to) : "",
          total_bags: e.total_bags != null ? String(e.total_bags) : "",
          machine_code: e.machine_code ?? "",
          operator: e.operator ?? "",
          remarks: e.remarks ?? "",
          status: e.status,
        }))
      );
      const sv = fetched.find((e: any) => e.supervisor)?.supervisor;
      if (sv) setSupervisor(sv);
    } else if (fetched) {
      setRows([EMPTY_PACKING_ROW()]);
    }
  }, [entriesQ.data]);

  // Auto-suggest next bag_from when lot_no loses focus — scoped to same shift+date
  async function onLotBlur(idx: number) {
    const lot = rows[idx].lot_no.trim();
    if (!lot || rows[idx].bag_from) return; // skip if already filled

    // 1. Check other local rows first (same lot, same session — not yet saved)
    let localMax: number | null = null;
    rows.forEach((r, i) => {
      if (i === idx) return;
      if (r.lot_no.trim().toLowerCase() !== lot.toLowerCase()) return;
      const t = parseInt(r.bag_to, 10);
      if (!isNaN(t) && (localMax === null || t > localMax)) localMax = t;
    });

    if (localMax !== null) {
      updateRow(idx, "bag_from", String(localMax + 1));
      return; // local rows are authoritative for this session
    }

    // 2. Fall back to DB — last saved bag for this lot+date+shift
    try {
      const r = await api.get(
        `/production/packing/last-bag/${encodeURIComponent(lot)}`,
        { params: { date, shift } }
      );
      const last = r.data?.last_bag_to;
      if (last != null) {
        updateRow(idx, "bag_from", String(last + 1));
      }
    } catch {
      // ignore — non-critical
    }
  }

  function updateRow(idx: number, field: keyof PackingRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], [field]: value };
      // Auto-calc total_bags
      if (field === "bag_from" || field === "bag_to") {
        r.total_bags = computeTotal({ ...r, [field]: value });
      }
      next[idx] = r;
      return next;
    });
  }

  function addRow(copyFrom?: PackingRow) {
    setRows((prev) => [
      ...prev,
      copyFrom
        ? { ...EMPTY_PACKING_ROW(), lot_no: copyFrom.lot_no, count_ne: copyFrom.count_ne, count_desc: copyFrom.count_desc, machine_code: copyFrom.machine_code }
        : EMPTY_PACKING_ROW(),
    ]);
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // Validate rows
  function validate(): string[] {
    const errs: string[] = [];
    rows.forEach((r, i) => {
      if (!r.lot_no.trim()) errs.push(`Row ${i + 1}: Lot No is required`);
      const f = parseInt(r.bag_from, 10);
      const t = parseInt(r.bag_to, 10);
      if (!isNaN(f) && !isNaN(t) && f > t) {
        errs.push(`Row ${i + 1} (${r.lot_no}): Bag From > Bag To`);
      }
    });
    return errs;
  }

  async function saveAll() {
    const errs = validate();
    if (errs.length) {
      toast.error(errs.join("\n"));
      return;
    }
    setSaving(true);
    try {
      // Split into new (no id) and existing (has id)
      const newRows = rows.filter((r) => !r.id);
      const existingRows = rows.filter((r) => !!r.id);

      if (newRows.length) {
        await api.post("/production/packing/entries/bulk", {
          date,
          shift,
          supervisor,
          entries: newRows.map((r) => ({
            lot_no: r.lot_no,
            count_ne: r.count_ne ? parseFloat(r.count_ne) : null,
            count_desc: r.count_desc || null,
            bag_from: r.bag_from ? parseInt(r.bag_from, 10) : null,
            bag_to: r.bag_to ? parseInt(r.bag_to, 10) : null,
            machine_code: r.machine_code || null,
            operator: r.operator || null,
            supervisor: supervisor || null,
            remarks: r.remarks || null,
          })),
        });
      }

      for (const r of existingRows) {
        await api.patch(`/production/packing/entries/${r.id}`, {
          lot_no: r.lot_no,
          count_ne: r.count_ne ? parseFloat(r.count_ne) : null,
          count_desc: r.count_desc || null,
          bag_from: r.bag_from ? parseInt(r.bag_from, 10) : null,
          bag_to: r.bag_to ? parseInt(r.bag_to, 10) : null,
          machine_code: r.machine_code || null,
          operator: r.operator || null,
          supervisor: supervisor || null,
          remarks: r.remarks || null,
        });
      }

      toast.success("Packing entries saved");
      qc.invalidateQueries({ queryKey: ["packing-entries", millId, date, shift] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      await api.delete(`/production/packing/entries/${id}`);
      toast.success("Entry deleted");
      qc.invalidateQueries({ queryKey: ["packing-entries", millId, date, shift] });
    } catch {
      toast.error("Delete failed");
    }
  }

  const totalBags = rows.reduce((s, r) => s + (parseInt(r.total_bags, 10) || 0), 0);

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Packing Shift Entry</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              className="w-36 h-8 text-xs"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select value={shift} onValueChange={(v) => setShift(v as "A" | "B" | "C")}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A — Morning</SelectItem>
                <SelectItem value="B">B — Afternoon</SelectItem>
                <SelectItem value="C">C — Night</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="w-36 h-8 text-xs"
              placeholder="Supervisor"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setImportOpen(true)}>
              <ArrowDown className="size-3.5" />
              Import
            </Button>
            <ExportMenu
              filename={`packing_${date}_${shift}`}
              title="Packing Entries"
              subtitle={`Date: ${date}  Shift: ${shift}`}
              columns={[
                { key: "lot_no", label: "Lot No" },
                { key: "count_ne", label: "Count Ne" },
                { key: "count_desc", label: "Count Desc" },
                { key: "bag_from", label: "Bag From" },
                { key: "bag_to", label: "Bag To" },
                { key: "total_bags", label: "Total Bags" },
                { key: "operator", label: "Operator" },
                { key: "supervisor", label: "Supervisor" },
                { key: "remarks", label: "Remarks" },
              ]}
              rows={rows}
              className="h-8 text-xs"
            />
          </div>
        </div>
        {totalBags > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {rows.length} rows · <strong>{totalBags}</strong> total bags this shift
          </p>
        )}
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-2 py-1.5 text-left font-medium w-6">#</th>
              <th className="px-2 py-1.5 text-left font-medium min-w-[110px]">Lot No *</th>
              <th className="px-2 py-1.5 text-left font-medium w-20">Count Ne</th>
              <th className="px-2 py-1.5 text-left font-medium min-w-[130px]">Count Desc</th>
              <th className="px-2 py-1.5 text-left font-medium w-24">Bag From</th>
              <th className="px-2 py-1.5 text-left font-medium w-24">Bag To</th>
              <th className="px-2 py-1.5 text-left font-medium w-20">Total</th>
              <th className="px-2 py-1.5 text-left font-medium min-w-[110px]">Operator</th>
              <th className="px-2 py-1.5 text-left font-medium min-w-[130px]">Remarks</th>
              <th className="px-2 py-1.5 text-center font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row._localId} className="border-b hover:bg-muted/20">
                <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    value={row.lot_no}
                    onChange={(e) => updateRow(idx, "lot_no", e.target.value)}
                    onBlur={() => onLotBlur(idx)}
                    placeholder="LOT-001"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    step="0.5"
                    value={row.count_ne}
                    onChange={(e) => updateRow(idx, "count_ne", e.target.value)}
                    placeholder="30"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    value={row.count_desc}
                    onChange={(e) => updateRow(idx, "count_desc", e.target.value)}
                    placeholder="100% Combed"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={row.bag_from}
                    onChange={(e) => updateRow(idx, "bag_from", e.target.value)}
                    placeholder="1001"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={row.bag_to}
                    onChange={(e) => updateRow(idx, "bag_to", e.target.value)}
                    placeholder="1040"
                  />
                </td>
                <td className="px-2 py-1 font-medium tabular-nums">
                  {row.total_bags || <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    value={row.operator}
                    onChange={(e) => updateRow(idx, "operator", e.target.value)}
                    placeholder="Name"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs"
                    value={row.remarks}
                    onChange={(e) => updateRow(idx, "remarks", e.target.value)}
                    placeholder="—"
                  />
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Duplicate row"
                      onClick={() => addRow(row)}
                    >
                      <Plus className="size-3" />
                    </Button>
                    {row.id ? (
                      <ConfirmDeleteButton
                        onConfirm={() => deleteEntry(row.id!)}
                      />
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteRow(idx)}
                        disabled={rows.length === 1}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => addRow()}>
          <Plus className="size-3" /> Add Row
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={saveAll}
          disabled={saving}
        >
          <Save className="size-3" />
          {saving ? "Saving…" : "Save All"}
        </Button>
      </div>

      <UniversalImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        tableName="packing_shift_entries"
        endpoint="/production/packing/entries/bulk"
        importMillId={millId ?? ""}
        title="Import Packing Entries"
      />
    </Card>
  );
}

function ProductionPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "production");
  const { millId } = useActiveMill();
  const [activeTab, setActiveTab] = useState<string>("entry");
  const machinesQ = useQuery({
    queryKey: ["machines", millId],
    queryFn: () => productionApi.getMachines({ mill_id: millId, page_size: 1000, page: 1 }),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  // Entries Log date + shift + operator group filter state
  const todayStrInit = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [entriesDateFrom, setEntriesDateFrom] = useState(todayStrInit);
  const [entriesDateTo, setEntriesDateTo] = useState(todayStrInit);
  const [entriesShift, setEntriesShift] = useState<"all" | "A" | "B" | "C">("all");
  const [entriesGroupId, setEntriesGroupId] = useState<string>("");

  // Load machine groups for export filter
  const entryGroupsQ = useQuery({
    queryKey: ["machine-groups-log", millId],
    queryFn: () => productionApi.getMachineGroups({ mill_id: millId, active_only: true }),
    staleTime: 60_000,
    enabled: !!millId,
  });
  const entryGroups = (entryGroupsQ.data ?? []) as MachineGroup[];

  const dateRx = /^\d{4}-\d{2}-\d{2}$/;
  const validDateFrom = dateRx.test(entriesDateFrom) ? entriesDateFrom : todayStrInit;
  const validDateTo = dateRx.test(entriesDateTo) ? entriesDateTo : todayStrInit;

  const shiftsQ = useQuery({
    queryKey: ["shifts", millId, validDateFrom, validDateTo],
    queryFn: () => productionApi.getEntries({ date_from: validDateFrom, date_to: validDateTo, mill_id: millId, page_size: 500 }),
    staleTime: 30_000,
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
    code: "", name: "", type: "", make: "", model: "", capacity: "", status: "", section: "",
  });
  const [editMachineId, setEditMachineId] = useState<string | null>(null);
  const updateMachineMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      productionApi.updateMachine(id, data),
    onSuccess: () => {
      toast.success("Machine updated");
      setMachineEditOpen(false);
      qc.invalidateQueries({ queryKey: ["machines"] });
      qc.invalidateQueries({ queryKey: ["machine-sections"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : err.message || "Update failed");
    },
  });

  // Machine deactivate
  const deactivateMachineMutation = useMutation({
    mutationFn: (id: string) => productionApi.updateMachineStatus(id, { status: "idle" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
  });

  const deleteMachineMutation = useMutation({
    mutationFn: (id: string) => productionApi.deleteMachine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
  });

  // Entry inline edit
  const [entryEditOpen, setEntryEditOpen] = useState(false);
  const [entryEditId, setEntryEditId] = useState<string | null>(null);
  const [entryEditForm, setEntryEditForm] = useState<Record<string, any>>({});

  // Bulk select + delete
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [bulkCancelConfirm, setBulkCancelConfirm] = useState(false);
  const toggleEntrySelect = (id: string) =>
    setSelectedEntryIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const bulkCancelMut = useMutation({
    mutationFn: () => productionApi.bulkCancelEntries(Array.from(selectedEntryIds)),
    onSuccess: (res: any) => {
      toast.success(`${res.deleted ?? res.cancelled ?? 0} entries deleted`);
      setSelectedEntryIds(new Set());
      setBulkCancelConfirm(false);
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : err.message || "Bulk cancel failed");
    },
  });
  const updateEntryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => productionApi.updateEntry(id, data),
    onSuccess: () => {
      toast.success("Entry updated");
      setEntryEditOpen(false);
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : err.message || "Update failed");
    },
  });

  const machines = (Array.isArray(machinesQ.data) ? machinesQ.data : (machinesQ.data?.data ?? [])) as any[];
  const shiftsRaw = (Array.isArray(shiftsQ.data) ? shiftsQ.data : ((shiftsQ.data as any)?.data ?? [])) as any[];
  const shifts = entriesShift === "all" ? shiftsRaw : shiftsRaw.filter((s: any) => s.shift === entriesShift);
  const downtime = (Array.isArray(downQ.data) ? downQ.data : (downQ.data?.data ?? [])) as any[];
  const machineColConfig = useColumnConfig("production_entries");
  const downColConfig = useColumnConfig("production_downtime");

  const todayStr = new Date().toISOString().split("T")[0];
  // Use most recent date with any entries; fall back to today if no shifts loaded
  const latestShiftDate = shifts.length > 0
    ? shifts.reduce((latest: string, s: any) => (s.date > latest ? s.date : latest), "")
    : todayStr;
  const kpiDate = latestShiftDate || todayStr;
  const isLatestDateToday = kpiDate === todayStr;
  const totalProduced = shifts
    .filter((s: any) => s.date === kpiDate)
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

  if (!user) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );

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
                  {isLatestDateToday ? "Produced Today" : `Produced (${kpiDate})`}
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

          <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              <TabsTrigger value="packing" className="gap-1.5">
                <Save className="size-3.5" />
                Packing
              </TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="shifts">Entries Log</TabsTrigger>
              <TabsTrigger value="downtime">Downtime Log</TabsTrigger>
              <TabsTrigger value="reports" className="gap-1.5">
                <FileText className="size-3.5" />
                Reports
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entry">
              <ErrorBoundary key={`entry-${activeTab}`} inline label="Shift Grid">
              {canEdit ? (
                <ShiftGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create shift entries.
                </div>
              )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="waste">
              <ErrorBoundary key={`waste-${activeTab}`} inline label="Waste">
              {canEdit ? (
                <WasteGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create waste entries.
                </div>
              )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="stoppage">
              <ErrorBoundary key={`stoppage-${activeTab}`} inline label="Stoppage">
              {canEdit ? (
                <StoppageForm />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to log stoppages.
                </div>
              )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="manpower">
              <ErrorBoundary key={`manpower-${activeTab}`} inline label="Shift Planning">
              {canEdit ? (
                <ManpowerGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to manage manpower plans.
                </div>
              )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="packing">
              <ErrorBoundary key={`packing-${activeTab}`} inline label="Packing">
              {canEdit ? (
                <PackingGrid />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  You do not have permission to create packing entries.
                </div>
              )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="machines">
              <Card>
                <CardHeader><CardTitle className="text-base">Machine Status</CardTitle></CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Machine Status">
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
                              section: m.section ?? "",
                            });
                            setEditMachineId(m.id);
                            setMachineEditOpen(true);
                          }}
                        >
                          <Pencil className="size-3 mr-1" /> Edit
                        </Button>
                        <ConfirmDeleteButton
                          onConfirm={async () => {
                            await deactivateMachineMutation.mutateAsync(m.id);
                          }}
                          title="Deactivate this machine?"
                          label={`Deactivate machine ${m.code}? It will be hidden from entry forms but its records are preserved.`}
                          confirmText="Deactivate"
                          successMessage="Machine deactivated"
                          trigger={
                            <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                              <PowerOff className="size-3 mr-1" /> Deactivate
                            </Button>
                          }
                        />
                        <ConfirmDeleteButton
                          onConfirm={async () => {
                            await deleteMachineMutation.mutateAsync(m.id);
                          }}
                          title="Permanently delete this machine?"
                          label={`Permanently DELETE machine ${m.code}? This cannot be undone. Machines with existing entries cannot be deleted — deactivate instead.`}
                          confirmText="Delete"
                          successMessage="Machine deleted"
                          errorMessage="Machine has existing entries — cannot delete. Deactivate it instead."
                          trigger={
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                              <Trash2 className="size-3 mr-1" /> Delete
                            </Button>
                          }
                        />
                      </div>
                    )}
                  />
                  </ErrorBoundary>
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
                      <Label className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                        Machine Line / Section
                      </Label>
                      <Input
                        value={editForm.section}
                        onChange={(e) => setEditForm((p) => ({ ...p, section: e.target.value }))}
                        placeholder="e.g. Carding Line 1, Ring Frame A"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Group this machine into a line/section. Used to filter machines in Shift Entry.
                      </p>
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
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Shift Production Entries</CardTitle>
                  <div className="flex items-center gap-2">
                    {canEdit && <ImportShiftEntriesDialog />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Date + Shift filter bar */}
                  <div className="flex items-center gap-3 flex-wrap pb-3 border-b">
                    {/* Quick date buttons */}
                    <Button
                      size="sm"
                      variant={entriesDateFrom === todayStrInit && entriesDateTo === todayStrInit ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => { setEntriesDateFrom(todayStrInit); setEntriesDateTo(todayStrInit); }}
                    >
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant={entriesDateFrom === sevenDaysAgo && entriesDateTo === todayStrInit ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => { setEntriesDateFrom(sevenDaysAgo); setEntriesDateTo(todayStrInit); }}
                    >
                      Last 7 days
                    </Button>
                    {/* Custom date range */}
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                      <Input
                        type="date"
                        value={entriesDateFrom}
                        onChange={(e) => setEntriesDateFrom(e.target.value)}
                        className="h-7 text-xs w-36"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                      <Input
                        type="date"
                        value={entriesDateTo}
                        onChange={(e) => setEntriesDateTo(e.target.value)}
                        className="h-7 text-xs w-36"
                      />
                    </div>
                    {/* Shift filter chips */}
                    <div className="flex items-center gap-1 border-l pl-3 ml-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap mr-1">Shift</Label>
                      {(["all", "A", "B", "C"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={entriesShift === s ? "default" : "outline"}
                          className="h-7 text-xs px-2.5"
                          onClick={() => setEntriesShift(s)}
                        >
                          {s === "all" ? "All" : s}
                        </Button>
                      ))}
                    </div>
                    {/* Machine group filter (for export) */}
                    {entryGroups.length > 0 && (
                      <div className="flex items-center gap-1.5 border-l pl-3 ml-1">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Group</Label>
                        <select
                          className="h-7 text-xs border border-input rounded-md bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                          value={entriesGroupId}
                          onChange={(e) => setEntriesGroupId(e.target.value)}
                        >
                          <option value="">All groups</option>
                          {entryGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {shiftsQ.isFetching && <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{shifts.length} entries</span>
                  </div>

                  {/* Bulk action toolbar */}
                  {selectedEntryIds.size > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                      <span className="text-sm text-red-700 font-medium flex-1">
                        {selectedEntryIds.size} entr{selectedEntryIds.size === 1 ? "y" : "ies"} selected
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedEntryIds(new Set())}
                        className="h-7 text-xs"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => setBulkCancelConfirm(true)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete Selected
                      </Button>
                    </div>
                  )}

                  <ErrorBoundary inline label="Shift Entries">
                  <DataTable
                    tableId="production_shifts"
                    columns={[
                      {
                        key: "_select",
                        label: "",
                        className: "w-8",
                        render: (s: any) => (
                          <Checkbox
                            checked={selectedEntryIds.has(s.id)}
                            onCheckedChange={() => toggleEntrySelect(s.id)}
                            aria-label="Select entry"
                          />
                        ),
                      },
                      { key: "date", label: machineColConfig.getLabel('date'), type: "date" },
                      { key: "shift", label: machineColConfig.getLabel('shift'), render: (s: any) => <Badge variant="outline">{s.shift}</Badge> },
                      { key: "machine_code", label: machineColConfig.getLabel('machine_code'), className: "font-mono text-xs" },
                      { key: "department", label: machineColConfig.getLabel('department'), type: "status" },
                      { key: "operator", label: machineColConfig.getLabel('operator') },
                      { key: "entered_by", label: "Entered by", render: (s: any) => <span className="text-xs text-muted-foreground">{s.entered_by ?? "—"}</span> },
                      { key: "count", label: machineColConfig.getLabel('count') },
                      { key: "produced_kg", label: machineColConfig.getLabel('produced_kg'), render: (s: any) => `${s.produced_kg ?? 0} kg` },
                      { key: "waste_kg", label: machineColConfig.getLabel('waste_kg'), render: (s: any) => <span className="text-muted-foreground">{s.waste_kg ?? 0} kg</span> },
                    ] satisfies ColDef[]}
                    data={shifts}
                    loading={shiftsQ.isLoading}
                    rowKey={(s: any) => s.id}
                    exportFilename="shift_entries"
                    disableExport={true}
                    toolbar={
                      <ExportDateRangeButton
                        onExportXlsx={(f, t) => exportApi.productionXlsx(f, t, undefined, entriesGroupId || undefined)}
                        onExportPdf={(f, t) => exportApi.productionPdf(f, t, undefined, entriesGroupId || undefined)}
                      />
                    }
                    actions={canEdit ? (s: any) => (
                      <div className="flex gap-1 items-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Edit entry"
                          onClick={() => {
                            setEntryEditId(s.id);
                            setEntryEditForm({
                              produced_kg: s.produced_kg ?? "",
                              waste_kg: s.waste_kg ?? "",
                              count: s.count ?? "",
                              operator: s.operator ?? "",
                              remarks: s.remarks ?? "",
                              stoppage_mins: s.stoppage_mins ?? "",
                              stoppage_reason: s.stoppage_reason ?? "",
                            });
                            setEntryEditOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <ConfirmDeleteButton
                          onConfirm={async () => {
                            await productionApi.deleteEntry(s.id);
                            qc.invalidateQueries({ queryKey: ["shifts"] });
                          }}
                          label={`Delete entry for machine ${s.machine_code} on ${s.date}?`}
                          title="Delete Entry?"
                          confirmText="Delete"
                          successMessage="Entry deleted"
                        />
                      </div>
                    ) : undefined}
                  />
                  </ErrorBoundary>
                </CardContent>
              </Card>

              {/* Bulk delete confirm modal */}
              {bulkCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <Trash2 className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm">Delete {selectedEntryIds.size} entr{selectedEntryIds.size === 1 ? "y" : "ies"}?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          This will permanently remove the selected entries. Cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setBulkCancelConfirm(false)} disabled={bulkCancelMut.isPending}>
                        Back
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => bulkCancelMut.mutate()}
                        disabled={bulkCancelMut.isPending}
                      >
                        {bulkCancelMut.isPending ? "Deleting…" : "Confirm Delete"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {/* Entry Edit Sheet */}
              <Sheet open={entryEditOpen} onOpenChange={setEntryEditOpen}>
                <SheetContent side="right" className="w-96">
                  <SheetHeader>
                    <SheetTitle>Edit Entry</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4 py-4">
                    {[
                      { key: "produced_kg", label: "Produced (kg)", type: "number" },
                      { key: "waste_kg", label: "Waste (kg)", type: "number" },
                      { key: "count", label: "Count", type: "number" },
                      { key: "operator", label: "Operator", type: "text" },
                      { key: "stoppage_mins", label: "Stoppage (min)", type: "number" },
                      { key: "stoppage_reason", label: "Stoppage Reason", type: "text" },
                      { key: "remarks", label: "Remarks", type: "text" },
                    ].map(({ key, label, type }) => (
                      <div key={key} className="space-y-2">
                        <Label>{label}</Label>
                        <Input
                          type={type}
                          value={entryEditForm[key] ?? ""}
                          onChange={(e) => setEntryEditForm((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder={label}
                        />
                      </div>
                    ))}
                  </div>
                  <SheetFooter>
                    <Button
                      onClick={() => entryEditId && updateEntryMutation.mutate({ id: entryEditId, data: entryEditForm })}
                      disabled={updateEntryMutation.isPending}
                    >
                      {updateEntryMutation.isPending ? "Saving…" : "Save Changes"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
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
                  <ErrorBoundary inline label="Downtime Logs">
                  <DataTable
                    tableId="production_downtime"
                    columns={[
                      { key: "machine_code", label: "Machine", className: "font-mono text-xs font-semibold" },
                      { key: "reason", label: "Stop Code / Reason", render: (d: any) => (
                        <div className="max-w-[220px]">
                          {d.datalog_code
                            ? <span className="text-xs"><span className="font-mono font-bold text-primary mr-1">[{d.datalog_code}]</span>{(d.reason ?? "").replace(/^\[\d+\]\s*/, "")}</span>
                            : <span className="text-xs text-muted-foreground">{d.reason ?? "—"}</span>
                          }
                        </div>
                      )},
                      { key: "started_at", label: "Date & Time", render: (d: any) => {
                        if (!d.started_at) return <span className="text-muted-foreground text-xs">—</span>;
                        const dt = new Date(d.started_at);
                        const dateStr = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
                        const timeStr = d.stop_from && d.stop_to
                          ? `${d.stop_from} → ${d.stop_to}`
                          : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        return (
                          <div>
                            <div className="text-xs font-medium">{dateStr}</div>
                            <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                          </div>
                        );
                      }},
                      { key: "duration_min", label: "Duration", render: (d: any) => (
                        <span className={`text-xs font-semibold ${(d.duration_min ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {(d.duration_min ?? 0) > 0 ? `${d.duration_min} min` : "—"}
                        </span>
                      )},
                      { key: "production_loss_kg", label: "Loss", render: (d: any) => (
                        <span className="text-xs">{(d.production_loss_kg ?? 0) > 0 ? `${d.production_loss_kg} kg` : "—"}</span>
                      )},
                      { key: "resolved", label: "Status", render: (d: any) => <StatusBadge status={d.resolved ? "active" : "pending"} label={d.resolved ? "Resolved" : "Open"} size="sm" /> },
                    ] satisfies ColDef[]}
                    data={downtime}
                    loading={downQ.isLoading}
                    rowKey={(d: any) => d.id}
                    exportFilename="downtime_logs"
                    actions={canEdit ? (d: any) => (
                      <ConfirmDeleteButton
                        onConfirm={async () => {
                          await productionApi.deleteDowntime(d.id);
                          qc.invalidateQueries({ queryKey: ["downtime"] });
                        }}
                        label={`Delete downtime record for ${d.machine_code}?`}
                        title="Delete Downtime Log?"
                        confirmText="Delete"
                        successMessage="Record deleted"
                      />
                    ) : undefined}
                  />
                  </ErrorBoundary>
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

            <TabsContent value="reports">
              <ErrorBoundary key="reports" inline label="Reports">
                <ProductionReportsTab />
              </ErrorBoundary>
            </TabsContent>

          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}
