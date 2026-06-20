import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Save,
  Eye,
  GripVertical,
  Plus,
  Trash2,
  Settings2,
  ArrowUp,
  ArrowDown,
  Building2,
  RotateCcw,
  EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/column-config")({
  head: () => ({ meta: [{ title: "Column Configurator — SpinFlow ERP" }] }),
  component: ColumnConfigPage,
});

// Grouped for clarity in the selector
const TABLE_GROUPS = [
  {
    group: "Masters",
    tables: [
      { key: "masters_machines", label: "Machines" },
      { key: "masters_departments", label: "Departments" },
      { key: "masters_customers", label: "Customers" },
      { key: "masters_vehicles", label: "Vehicles" },
      { key: "masters_shifts", label: "Shifts" },
      { key: "masters_yarn_counts", label: "Yarn Counts" },
    ],
  },
  {
    group: "Production",
    tables: [
      { key: "production_entries", label: "Production Entries" },
      { key: "production_downtime", label: "Production Downtime" },
    ],
  },
  {
    group: "HR",
    tables: [
      { key: "hr_employees", label: "Employees" },
      { key: "hr_attendance", label: "Attendance" },
      { key: "hr_leaves", label: "Leaves" },
      { key: "hr_payroll", label: "Payroll" },
    ],
  },
  {
    group: "Quality",
    tables: [
      { key: "quality_tests", label: "Quality Tests" },
      { key: "quality_approvals", label: "Quality Approvals" },
    ],
  },
  {
    group: "Inventory & Dispatch",
    tables: [
      { key: "inventory_lots", label: "Lots" },
      { key: "inventory_warehouses", label: "Warehouses" },
      { key: "dispatch_trips", label: "Trips" },
      { key: "dispatch_sales_orders", label: "Sales Orders" },
    ],
  },
  {
    group: "Stores & Maintenance",
    tables: [
      { key: "stores_spares", label: "Spares" },
      { key: "stores_issues", label: "Issues" },
      { key: "maintenance_tasks", label: "Maintenance Tasks" },
      { key: "maintenance_schedules", label: "Maintenance Schedules" },
    ],
  },
  {
    group: "Accounts",
    tables: [
      { key: "accounts_invoices", label: "Invoices" },
      { key: "accounts_gst", label: "GST" },
    ],
  },
];

const ALL_TABLES = TABLE_GROUPS.flatMap((g) => g.tables);

const COLUMN_TYPES = ["text", "number", "date", "dropdown", "boolean", "phone", "email"];

function ColumnConfigPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedMillId, setSelectedMillId] = useState("");
  const [selectedTable, setSelectedTable] = useState("masters_machines");
  const [columns, setColumns] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [optionEditor, setOptionEditor] = useState<{ open: boolean; columnKey: string }>({
    open: false,
    columnKey: "",
  });
  const [dropdownOptions, setDropdownOptions] = useState<
    { value: string; label: string; order: number }[]
  >([]);
  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newField, setNewField] = useState({ key: "", label: "", type: "text" });

  const { data: companies } = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 500, true),
    staleTime: 60_000,
    select: (raw: any) => {
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
      const seen = new Set<string>();
      return list.filter((c: any) => {
        if (!c?.id || seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    },
  });

  const { data: mills } = useQuery({
    queryKey: ["mills-for-company", selectedCompanyId],
    queryFn: () =>
      api
        .get(`/masters/mills?company_id=${selectedCompanyId}`)
        .then((r) => r.data?.data ?? r.data?.items ?? []),
    enabled: !!selectedCompanyId,
  });

  const configQuery = useQuery({
    queryKey: ["column-config-admin", selectedTable, selectedMillId],
    queryFn: async () => {
      const res = await api.get("/ui-config/columns", {
        params: { table: selectedTable, mill_id: selectedMillId || undefined },
      });
      return res.data;
    },
    staleTime: 30_000,
    enabled: !!selectedMillId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save column config
      const res = await api.put(
        "/ui-config/columns",
        { columns },
        {
          params: { table: selectedTable, mill_id: selectedMillId },
        },
      );
      // 2. Register any custom fields in MillCustomField so import + forms see them
      const customFields = columns.filter((c) => c._isCustom);
      if (customFields.length > 0) {
        await api.post("/ui-config/custom-fields", {
          mill_id: selectedMillId,
          table: selectedTable,
          fields: customFields.map((c) => ({ key: c.key, label: c.label, type: c.type })),
        });
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success("Column configuration saved");
      qc.invalidateQueries({ queryKey: ["column-config-admin"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to save");
    },
  });

  useEffect(() => {
    if (configQuery.data) {
      const cols = configQuery.data?.columns;
      if (cols && cols.length > 0) {
        setColumns(cols.map((c: any, i: number) => ({ ...c, _originalIndex: i })));
      } else {
        setColumns([]);
      }
    }
  }, [configQuery.data]);

  const updateColumn = (index: number, field: string, value: any) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((c, i) => ({ ...c, display_order: i + 1 }));
    });
  };

  const moveDown = (index: number) => {
    if (index >= columns.length - 1) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((c, i) => ({ ...c, display_order: i + 1 }));
    });
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const deleteColumn = (index: number) => {
    setColumns((prev) =>
      prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, display_order: i + 1 })),
    );
  };

  const addCustomField = () => {
    const key = newField.key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (!key || !newField.label.trim()) {
      toast.error("Key and Label are required");
      return;
    }
    if (columns.some((c) => c.key === key)) {
      toast.error(`Field key "${key}" already exists`);
      return;
    }
    setColumns((prev) => [
      ...prev,
      {
        key,
        label: newField.label.trim(),
        type: newField.type,
        is_visible: true,
        is_required: false,
        is_searchable: true,
        is_sortable: true,
        is_exportable: true,
        is_importable: true,
        display_order: prev.length + 1,
        _isCustom: true,
      },
    ]);
    setNewField({ key: "", label: "", type: "text" });
    setAddFieldOpen(false);
    toast.success(`Custom field "${key}" added — click Save to persist`);
  };

  const openOptionEditor = (colKey: string) => {
    setOptionEditor({ open: true, columnKey: colKey });
    api
      .get("/ui-config/dropdown-options", {
        params: { table: selectedTable, column: colKey, mill_id: selectedMillId },
      })
      .then((res) => {
        setDropdownOptions(res.data.options ?? []);
      })
      .catch(() => {
        setDropdownOptions([]);
      });
  };

  const addOption = () => {
    if (!newOptValue.trim() || !newOptLabel.trim()) return;
    setDropdownOptions((prev) => [
      ...prev,
      { value: newOptValue.trim(), label: newOptLabel.trim(), order: prev.length },
    ]);
    setNewOptValue("");
    setNewOptLabel("");
  };

  const removeOption = (idx: number) => {
    setDropdownOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveOptions = async () => {
    try {
      await api.put("/ui-config/dropdown-options", {
        mill_id: selectedMillId,
        table_name: selectedTable,
        column_key: optionEditor.columnKey,
        options: dropdownOptions,
      });
      toast.success("Dropdown options saved");
      setOptionEditor({ open: false, columnKey: "" });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save options");
    }
  };

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <>
        <div className="p-6 text-destructive">Only Super Admin can access this page.</div>
      </>
    );
  }

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center gap-4 mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">
              Company
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setSelectedMillId("");
                setColumns([]);
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800 min-w-[200px]"
            >
              <option value="">Select company...</option>
              {(Array.isArray(companies) ? companies : []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCompanyId && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">
                Mill
              </label>
              <select
                value={selectedMillId}
                onChange={(e) => {
                  setSelectedMillId(e.target.value);
                  setColumns([]);
                }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800 min-w-[200px]"
              >
                <option value="">Select mill...</option>
                {(Array.isArray(mills) ? mills : []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedMillId && (
            <div className="ml-auto flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-3 py-2 rounded-lg">
              <Settings2 className="w-4 h-4" />
              Configuring columns for this mill only
            </div>
          )}
        </div>

        {!selectedMillId ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Select a company and mill first</p>
            <p className="text-sm mt-1">
              Column configurations are per-mill — each mill can have different field labels
            </p>
          </div>
        ) : (
          <Card>
            <CardHeader className="py-3 space-y-3">
              {/* Row 1: table selector + actions */}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedTable}
                  onValueChange={(v) => {
                    setSelectedTable(v);
                    setColumns([]);
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    {TABLE_GROUPS.map((g) => (
                      <div key={g.group}>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {g.group}
                        </div>
                        {g.tables.map((t) => (
                          <SelectItem key={t.key} value={t.key} className="pl-4">
                            {t.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm font-semibold text-gray-700 flex-1">
                  {ALL_TABLES.find((t) => t.key === selectedTable)?.label ?? selectedTable}
                  {columns.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {columns.filter((c) => c.is_visible !== false).length} visible /{" "}
                      {columns.length} total
                    </span>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={columns.length === 0}
                >
                  <Eye className="size-3.5 mr-1" /> Preview
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending || columns.length === 0}
                >
                  <Save className="size-3.5 mr-1" /> {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              {/* Row 2: bulk controls + add field */}
              {selectedMillId && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <span className="text-xs text-muted-foreground">Bulk:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setColumns((prev) => prev.map((c) => ({ ...c, is_visible: true })))
                    }
                    disabled={columns.length === 0}
                  >
                    <Eye className="size-3 mr-1" /> Show All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setColumns((prev) => prev.map((c) => ({ ...c, is_visible: false })))
                    }
                    disabled={columns.length === 0}
                  >
                    <EyeOff className="size-3 mr-1" /> Hide All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => {
                      setColumns([]);
                      qc.invalidateQueries({ queryKey: ["column-config-admin"] });
                    }}
                    disabled={columns.length === 0}
                  >
                    <RotateCcw className="size-3 mr-1" /> Reset to Defaults
                  </Button>
                  <div className="ml-auto">
                    <Button size="sm" className="h-7 text-xs" onClick={() => setAddFieldOpen(true)}>
                      <Plus className="size-3 mr-1" /> Add New Field
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs font-semibold">Field Key</TableHead>
                      <TableHead className="text-xs font-semibold">Label</TableHead>
                      <TableHead className="text-xs font-semibold">Type</TableHead>
                      <TableHead className="text-xs font-semibold w-16 text-center">Show</TableHead>
                      <TableHead className="text-xs font-semibold w-16 text-center">Req</TableHead>
                      <TableHead className="text-xs font-semibold w-16 text-center">
                        Search
                      </TableHead>
                      <TableHead className="text-xs font-semibold w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configQuery.isFetching && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-sm text-muted-foreground"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}
                    {!configQuery.isFetching && columns.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-sm text-muted-foreground"
                        >
                          No columns found for this table.
                        </TableCell>
                      </TableRow>
                    )}
                    {columns.length > 0 &&
                      columns.map((col, i) => (
                        <TableRow
                          key={col.key ?? i}
                          className={
                            col._isCustom
                              ? "bg-blue-50/40 hover:bg-blue-50/60"
                              : "hover:bg-muted/30"
                          }
                        >
                          <TableCell className="text-muted-foreground cursor-grab">
                            <GripVertical className="size-3.5" />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-1.5">
                              {col.key}
                              {col._isCustom && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-sans">
                                  custom
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={col.label ?? ""}
                              onChange={(e) => updateColumn(i, "label", e.target.value)}
                              className="h-7 text-xs w-40"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={col.type ?? "text"}
                              onValueChange={(v) => updateColumn(i, "type", v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {COLUMN_TYPES.map((t) => (
                                  <SelectItem key={t} value={t} className="text-xs">
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={col.is_visible ?? true}
                              onCheckedChange={(v) => updateColumn(i, "is_visible", v)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={col.is_required ?? false}
                              onCheckedChange={(v) => updateColumn(i, "is_required", v)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={col.is_searchable ?? true}
                              onCheckedChange={(v) => updateColumn(i, "is_searchable", v)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => moveUp(i)}
                                disabled={i === 0}
                              >
                                <ArrowUp className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => moveDown(i)}
                                disabled={i >= columns.length - 1}
                              >
                                <ArrowDown className="size-3" />
                              </Button>
                              {col.type === "dropdown" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => openOptionEditor(col.key)}
                                >
                                  Options
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-destructive hover:bg-red-50 ml-1"
                                title="Remove this field from config"
                                onClick={() => deleteColumn(i)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
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

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Preview — {ALL_TABLES.find((t) => t.key === selectedTable)?.label ?? selectedTable}
            </DialogTitle>
            <DialogDescription>
              Visible columns as configured (showing first 5 rows)
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {columns
                    .filter((c) => c.is_visible !== false)
                    .map((col) => (
                      <TableHead key={col.key} className="text-xs whitespace-nowrap">
                        {col.label}
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  {columns
                    .filter((c) => c.is_visible !== false)
                    .map((col) => (
                      <TableCell key={col.key} className="text-xs text-muted-foreground py-4">
                        {col.type === "number"
                          ? "0"
                          : col.type === "date"
                            ? "01/01/2026"
                            : col.type === "boolean"
                              ? "Yes"
                              : "—"}
                      </TableCell>
                    ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add New Field Dialog ────────────────────────────────────────── */}
      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Field</DialogTitle>
            <DialogDescription>
              Define a new column for{" "}
              <strong>
                {ALL_TABLES.find((t) => t.key === selectedTable)?.label ?? selectedTable}
              </strong>
              . Custom fields appear in the table and import engine. They are stored as extra
              metadata per record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>
                Field Key <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newField.key}
                onChange={(e) =>
                  setNewField((f) => ({
                    ...f,
                    key: e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, "_")
                      .replace(/[^a-z0-9_]/g, ""),
                  }))
                }
                placeholder="e.g. serial_no, brand_name, warranty_years"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase, underscores only. This is the database/import column name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                Display Label <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newField.label}
                onChange={(e) => setNewField((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Serial No, Brand Name, Warranty (yrs)"
              />
              <p className="text-[11px] text-muted-foreground">
                What users see in tables and forms.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select
                value={newField.type}
                onValueChange={(v) => setNewField((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <strong>What happens:</strong> This field key is added to the column config for this
              mill and table. When importing Excel, any column matching this key name is mapped
              automatically. For existing records, the value is stored as custom metadata (no schema
              change needed).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddFieldOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={addCustomField}
              disabled={!newField.key.trim() || !newField.label.trim()}
            >
              <Plus className="size-3 mr-1" /> Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropdown Options Editor */}
      <Dialog
        open={optionEditor.open}
        onOpenChange={(o) => {
          if (!o) setOptionEditor({ open: false, columnKey: "" });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dropdown Options — {optionEditor.columnKey}</DialogTitle>
            <DialogDescription>Add, edit or remove dropdown options</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {dropdownOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={opt.label}
                    onChange={(e) => {
                      const next = [...dropdownOptions];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setDropdownOptions(next);
                    }}
                    className="h-7 text-xs flex-1"
                    placeholder="Label"
                  />
                  <Input
                    value={opt.value}
                    onChange={(e) => {
                      const next = [...dropdownOptions];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setDropdownOptions(next);
                    }}
                    className="h-7 text-xs w-24"
                    placeholder="Value"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => removeOption(idx)}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t pt-2">
              <Input
                value={newOptLabel}
                onChange={(e) => setNewOptLabel(e.target.value)}
                placeholder="New label…"
                className="h-7 text-xs flex-1"
              />
              <Input
                value={newOptValue}
                onChange={(e) => setNewOptValue(e.target.value)}
                placeholder="Value…"
                className="h-7 text-xs w-24"
              />
              <Button variant="outline" size="sm" className="h-7" onClick={addOption}>
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOptionEditor({ open: false, columnKey: "" })}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveOptions}>
              Save Options
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
