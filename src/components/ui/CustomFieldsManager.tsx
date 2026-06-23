/**
 * CustomFieldsManager — Mill Owner / General Manager UI for managing custom field definitions.
 * Shown in the Masters page as a "Custom Fields" tab.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import type { CustomFieldDefinition } from "@/components/ui/CustomFieldsSection";

// ── Types ──────────────────────────────────────────────────────────────────

interface TableEntry {
  table_name: string;
  label: string;
}

interface TablesResponse {
  modules: Record<string, TableEntry[]>;
}

const FIELD_TYPES = [
  { value: "text",    label: "Text" },
  { value: "number",  label: "Number" },
  { value: "select",  label: "Select (dropdown)" },
  { value: "boolean", label: "Yes / No" },
  { value: "date",    label: "Date" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

// ── Main component ─────────────────────────────────────────────────────────

export function CustomFieldsManager() {
  const user = useAuth((s) => s.user);
  const { millId } = useActiveMill();
  const qc = useQueryClient();

  // Only MILL_OWNER, GENERAL_MANAGER, SUPER_ADMIN can use this
  const canManage = ["MILL_OWNER", "GENERAL_MANAGER", "SUPER_ADMIN"].includes(user?.role ?? "");
  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Custom field management is available to Mill Owners and General Managers.
      </p>
    );
  }

  const { data: tablesData } = useQuery<TablesResponse>({
    queryKey: ["custom-fields-tables"],
    queryFn: () => api.get<TablesResponse>("/custom-fields/tables").then((r) => r.data),
    staleTime: 3_600_000,
    refetchOnWindowFocus: false,
  });

  const { data: allDefinitions = [] } = useQuery<CustomFieldDefinition[]>({
    queryKey: ["custom-field-definitions-all", millId],
    queryFn: () =>
      api
        .get<CustomFieldDefinition[]>("/custom-fields/definitions")
        .then((r) => r.data),
    enabled: !!millId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Group definitions by table_name for quick lookup
  const defsByTable: Record<string, CustomFieldDefinition[]> = {};
  for (const d of allDefinitions) {
    if (!defsByTable[d.table_name]) defsByTable[d.table_name] = [];
    defsByTable[d.table_name].push(d);
  }

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDefn, setEditDefn] = useState<CustomFieldDefinition | null>(null);
  const [activeTable, setActiveTable] = useState<{ table_name: string; module: string } | null>(null);

  function openAdd(table_name: string, module: string) {
    setEditDefn(null);
    setActiveTable({ table_name, module });
    setDialogOpen(true);
  }

  function openEdit(defn: CustomFieldDefinition) {
    setEditDefn(defn);
    setActiveTable({ table_name: defn.table_name, module: defn.module });
    setDialogOpen(true);
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-fields/definitions/${id}`),
    onSuccess: () => {
      toast.success("Field removed");
      qc.invalidateQueries({ queryKey: ["custom-field-definitions-all", millId] });
      qc.invalidateQueries({ queryKey: ["custom-field-definitions"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to remove field"),
  });

  const modules = tablesData?.modules ?? {};

  return (
    <div className="space-y-4">
      {Object.entries(modules).map(([moduleName, tables]) => (
        <ModuleSection
          key={moduleName}
          moduleName={moduleName}
          tables={tables}
          defsByTable={defsByTable}
          onAdd={(t) => openAdd(t, moduleName)}
          onEdit={openEdit}
          onDelete={(id) => deleteMutation.mutate(id)}
          canManage={canManage}
        />
      ))}

      {dialogOpen && activeTable && (
        <FieldDefinitionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editDefn={editDefn}
          tableName={activeTable.table_name}
          module={activeTable.module}
          millId={millId}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["custom-field-definitions-all", millId] });
            qc.invalidateQueries({ queryKey: ["custom-field-definitions"] });
          }}
        />
      )}
    </div>
  );
}

// ── Module section (collapsible) ───────────────────────────────────────────

function ModuleSection({
  moduleName,
  tables,
  defsByTable,
  onAdd,
  onEdit,
  onDelete,
  canManage,
}: {
  moduleName: string;
  tables: TableEntry[];
  defsByTable: Record<string, CustomFieldDefinition[]>;
  onAdd: (table_name: string) => void;
  onEdit: (defn: CustomFieldDefinition) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(true);
  const totalCount = tables.reduce((s, t) => s + (defsByTable[t.table_name]?.length ?? 0), 0);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold capitalize hover:bg-muted/50 transition-colors"
      >
        <span>
          {moduleName}
          {totalCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {totalCount}
            </Badge>
          )}
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      {open && (
        <div className="border-t divide-y">
          {tables.map((tbl) => (
            <TableRow
              key={tbl.table_name}
              tbl={tbl}
              definitions={defsByTable[tbl.table_name] ?? []}
              onAdd={() => onAdd(tbl.table_name)}
              onEdit={onEdit}
              onDelete={onDelete}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-table row ──────────────────────────────────────────────────────────

function TableRow({
  tbl,
  definitions,
  onAdd,
  onEdit,
  onDelete,
  canManage,
}: {
  tbl: TableEntry;
  definitions: CustomFieldDefinition[];
  onAdd: () => void;
  onEdit: (defn: CustomFieldDefinition) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(definitions.length > 0);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-left hover:underline"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {tbl.label}
          {definitions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {definitions.length} field{definitions.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </button>
        {canManage && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add field
          </Button>
        )}
      </div>

      {open && definitions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {definitions.map((defn) => (
            <div
              key={defn.id}
              className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{defn.label}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {defn.field_type}
                </Badge>
                {defn.is_required && (
                  <Badge variant="destructive" className="text-[10px] shrink-0">
                    required
                  </Badge>
                )}
                <code className="text-[10px] text-muted-foreground truncate">{defn.field_key}</code>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => onEdit(defn)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(defn.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add / Edit dialog ──────────────────────────────────────────────────────

interface FieldDefinitionDialogProps {
  open: boolean;
  onClose: () => void;
  editDefn: CustomFieldDefinition | null;
  tableName: string;
  module: string;
  millId: string | null;
  onSaved: () => void;
}

function FieldDefinitionDialog({
  open,
  onClose,
  editDefn,
  tableName,
  module,
  millId,
  onSaved,
}: FieldDefinitionDialogProps) {
  const isEdit = !!editDefn;

  const [form, setForm] = useState({
    label: "",
    field_key: "",
    field_type: "text" as "text" | "number" | "select" | "boolean" | "date",
    options_text: "",
    is_required: false,
    sort_order: 0,
    is_active: true,
  });

  useEffect(() => {
    if (editDefn) {
      setForm({
        label: editDefn.label,
        field_key: editDefn.field_key,
        field_type: editDefn.field_type,
        options_text: editDefn.options ? editDefn.options.join(", ") : "",
        is_required: editDefn.is_required,
        sort_order: editDefn.sort_order,
        is_active: editDefn.is_active,
      });
    } else {
      setForm({
        label: "",
        field_key: "",
        field_type: "text",
        options_text: "",
        is_required: false,
        sort_order: 0,
        is_active: true,
      });
    }
  }, [editDefn, open]);

  // Auto-generate field_key from label (only for new fields)
  const handleLabelChange = (v: string) => {
    setForm((p) => ({
      ...p,
      label: v,
      field_key: isEdit ? p.field_key : toFieldKey(v),
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const options =
        form.field_type === "select" && form.options_text.trim()
          ? form.options_text
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null;

      if (isEdit && editDefn) {
        return api
          .patch(`/custom-fields/definitions/${editDefn.id}`, {
            label: form.label,
            options,
            is_required: form.is_required,
            sort_order: form.sort_order,
            is_active: form.is_active,
          })
          .then((r) => r.data);
      } else {
        return api
          .post("/custom-fields/definitions", {
            module,
            table_name: tableName,
            field_key: form.field_key,
            label: form.label,
            field_type: form.field_type,
            options,
            is_required: form.is_required,
            sort_order: form.sort_order,
          })
          .then((r) => r.data);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Field updated" : "Field created");
      onSaved();
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? "Failed to save field"),
  });

  const keyError = form.field_key && !/^[a-z0-9_]{1,50}$/.test(form.field_key)
    ? "Only lowercase letters, digits, underscores (max 50)"
    : "";

  const canSave =
    form.label.trim().length > 0 &&
    form.field_key.trim().length > 0 &&
    !keyError &&
    !saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Label <span className="text-destructive">*</span></Label>
            <Input
              value={form.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Humidity %"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Field Key <span className="text-destructive">*</span></Label>
            <Input
              value={form.field_key}
              onChange={(e) => setForm((p) => ({ ...p, field_key: e.target.value }))}
              placeholder="e.g. humidity_pct"
              disabled={isEdit}
              className={keyError ? "border-destructive" : ""}
            />
            {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                Auto-generated from label. Snake_case only.
              </p>
            )}
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Field Type <span className="text-destructive">*</span></Label>
              <Select
                value={form.field_type}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    field_type: v as typeof form.field_type,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.field_type === "select" && (
            <div className="space-y-1.5">
              <Label>Options (comma-separated)</Label>
              <Input
                value={form.options_text}
                onChange={(e) =>
                  setForm((p) => ({ ...p, options_text: e.target.value }))
                }
                placeholder="Option A, Option B, Option C"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={form.is_required}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, is_required: v }))}
                />
                <Label className="cursor-pointer">Required</Label>
              </div>
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
              <Label className="cursor-pointer">Active</Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>
            {saveMutation.isPending ? "Saving…" : isEdit ? "Update" : "Create field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
