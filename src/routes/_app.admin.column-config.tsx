import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/column-config")({
  head: () => ({ meta: [{ title: "Column Configurator — SpinFlow ERP" }] }),
  component: ColumnConfigPage,
});

const ALL_TABLES = [
  { key: "hr_employees", label: "HR Employees" },
  { key: "hr_attendance", label: "HR Attendance" },
  { key: "hr_leaves", label: "HR Leaves" },
  { key: "hr_payroll", label: "HR Payroll" },
  { key: "production_entries", label: "Production Entries" },
  { key: "production_downtime", label: "Production Downtime" },
  { key: "quality_tests", label: "Quality Tests" },
  { key: "quality_approvals", label: "Quality Approvals" },
  { key: "inventory_lots", label: "Inventory Lots" },
  { key: "inventory_warehouses", label: "Inventory Warehouses" },
  { key: "dispatch_trips", label: "Dispatch Trips" },
  { key: "dispatch_sales_orders", label: "Dispatch Sales Orders" },
  { key: "stores_spares", label: "Stores Spares" },
  { key: "stores_issues", label: "Stores Issues" },
  { key: "maintenance_tasks", label: "Maintenance Tasks" },
  { key: "maintenance_schedules", label: "Maintenance Schedules" },
  { key: "accounts_invoices", label: "Accounts Invoices" },
  { key: "accounts_gst", label: "Accounts GST" },
  { key: "masters_departments", label: "Masters Departments" },
  { key: "masters_machines", label: "Masters Machines" },
  { key: "masters_customers", label: "Masters Customers" },
  { key: "masters_vehicles", label: "Masters Vehicles" },
  { key: "masters_shifts", label: "Masters Shifts" },
  { key: "masters_yarn_counts", label: "Masters Yarn Counts" },
];

const COLUMN_TYPES = ["text", "number", "date", "dropdown", "boolean", "phone", "email"];

function ColumnConfigPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedMillId, setSelectedMillId] = useState("");
  const [selectedTable, setSelectedTable] = useState("hr_employees");
  const [columns, setColumns] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [optionEditor, setOptionEditor] = useState<{ open: boolean; columnKey: string }>({ open: false, columnKey: "" });
  const [dropdownOptions, setDropdownOptions] = useState<{ value: string; label: string; order: number }[]>([]);
  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");

  const { data: companies } = useQuery({
    queryKey: ["companies-list"],
    queryFn: () => api.get("/masters/companies").then(r => r.data?.data ?? r.data?.items ?? []),
  });

  const { data: mills } = useQuery({
    queryKey: ["mills-for-company", selectedCompanyId],
    queryFn: () => api.get(`/masters/mills?company_id=${selectedCompanyId}`).then(r => r.data?.data ?? r.data?.items ?? []),
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
      const res = await api.put("/ui-config/columns", { columns }, {
        params: { table: selectedTable, mill_id: selectedMillId },
      });
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

  const openOptionEditor = (colKey: string) => {
    setOptionEditor({ open: true, columnKey: colKey });
    api.get("/ui-config/dropdown-options", {
      params: { table: selectedTable, column: colKey, mill_id: selectedMillId },
    }).then((res) => {
      setDropdownOptions(res.data.options ?? []);
    }).catch(() => {
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
      <AccessGuard module="masters">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center gap-4 mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">
                Company
              </label>
              <select
                value={selectedCompanyId}
                onChange={e => { setSelectedCompanyId(e.target.value); setSelectedMillId(""); setColumns([]); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800 min-w-[200px]"
              >
                <option value="">Select company...</option>
                {(Array.isArray(companies) ? companies : []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                  onChange={e => { setSelectedMillId(e.target.value); setColumns([]); }}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800 min-w-[200px]"
                >
                  <option value="">Select mill...</option>
                  {(Array.isArray(mills) ? mills : []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
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
              <p className="text-sm mt-1">Column configurations are per-mill — each mill can have different field labels</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base">
                  Column Configuration — {ALL_TABLES.find((t) => t.key === selectedTable)?.label ?? selectedTable}
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedTable} onValueChange={(v) => { setSelectedTable(v); setColumns([]); }}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="Select table" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_TABLES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={columns.length === 0}>
                    <Eye className="size-3.5 mr-1" /> Preview
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || columns.length === 0}>
                    <Save className="size-3.5 mr-1" /> {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
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
                        <TableHead className="text-xs font-semibold w-16 text-center">Search</TableHead>
                        <TableHead className="text-xs font-semibold w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {configQuery.isFetching && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell>
                        </TableRow>
                      )}
                      {!configQuery.isFetching && columns.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                            No columns found for this table.
                          </TableCell>
                        </TableRow>
                      )}
                      {columns.length > 0 && columns.map((col, i) => (
                        <TableRow key={col.key ?? i} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground cursor-grab">
                            <GripVertical className="size-3.5" />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{col.key}</TableCell>
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
                                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
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
                            <div className="flex gap-1">
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
      </AccessGuard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview — {ALL_TABLES.find((t) => t.key === selectedTable)?.label ?? selectedTable}</DialogTitle>
            <DialogDescription>Visible columns as configured (showing first 5 rows)</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {columns.filter((c) => c.is_visible !== false).map((col) => (
                    <TableHead key={col.key} className="text-xs whitespace-nowrap">{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  {columns.filter((c) => c.is_visible !== false).map((col) => (
                    <TableCell key={col.key} className="text-xs text-muted-foreground py-4">
                      {col.type === "number" ? "0" : col.type === "date" ? "01/01/2026" : col.type === "boolean" ? "Yes" : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropdown Options Editor */}
      <Dialog open={optionEditor.open} onOpenChange={(o) => { if (!o) setOptionEditor({ open: false, columnKey: "" }); }}>
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
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeOption(idx)}>
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
            <Button variant="outline" size="sm" onClick={() => setOptionEditor({ open: false, columnKey: "" })}>Cancel</Button>
            <Button size="sm" onClick={saveOptions}>Save Options</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
