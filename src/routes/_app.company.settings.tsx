import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Settings2, Save, RefreshCw, Plus, X, Building2, Users, ShieldCheck, Tag,
  Sliders, Trash2, ChevronDown,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/company/settings")({
  beforeLoad: () => {
    const user = useAuth.getState().user;
    if (user?.role === "SUPER_ADMIN") {
      throw redirect({ to: "/admin" });
    }
    if (user?.role && !["MILL_OWNER", "GENERAL_MANAGER"].includes(user.role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: CompanySettingsPage,
});

// ── Tag editor: list of strings with add/remove ───────────────────────────
function TagListEditor({
  label,
  description,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function addItem() {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  }

  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addItem(); }
          }}
          placeholder={placeholder}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1 text-sm">
              {item}
              <button
                onClick={() => removeItem(i)}
                className="ml-0.5 rounded hover:bg-destructive/20 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Save button with per-section feedback ─────────────────────────────────
function SaveBtn({
  section,
  savedSection,
  mutation,
}: {
  section: string;
  savedSection: string | null;
  mutation: { mutate: () => void; isPending: boolean; isError: boolean };
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="gap-2"
        size="sm"
      >
        <Save className="w-3.5 h-3.5" />
        {mutation.isPending ? "Saving…" : savedSection === section ? "Saved ✓" : "Save"}
      </Button>
      {mutation.isError && (
        <p className="text-xs text-destructive">Failed to save — try again.</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
function CompanySettingsPage() {
  const { user, activeMill } = useAuth();
  const millId = activeMill?.id ?? user?.millId;
  const queryClient = useQueryClient();

  const [savedSection, setSavedSection] = useState<string | null>(null);
  function flashSaved(section: string) {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2500);
  }

  // ── State for each section ──
  const [prefix, setPrefix] = useState("EMP");
  const [digits, setDigits] = useState(4);
  const [deptNames, setDeptNames] = useState<string[]>([]);
  const [shiftNames, setShiftNames] = useState<string[]>([]);
  const [cvLimit, setCvLimit] = useState<string>("");
  const [cspMin, setCspMin] = useState<string>("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["mill-settings", millId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/mills/${millId}/settings`);
      return res.data;
    },
    enabled: !!millId,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (settings) {
      setPrefix(settings.emp_code_prefix ?? "EMP");
      setDigits(settings.emp_code_digits ?? 4);
      setDeptNames(settings.dept_names ?? []);
      setShiftNames(settings.shift_names ?? []);
      setCvLimit(settings.quality_cv_limit != null ? String(settings.quality_cv_limit) : "");
      setCspMin(settings.quality_csp_min != null ? String(settings.quality_csp_min) : "");
    }
  }, [settings]);

  function makeUpdateMutation(payload: () => object, section: string) {
    return useMutation({
      mutationFn: () =>
        api
          .put(`/api/v1/admin/mills/${millId}/settings`, payload())
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["mill-settings", millId] });
            flashSaved(section);
          }),
    });
  }

  const empMutation = makeUpdateMutation(
    () => ({
      emp_code_prefix: prefix.toUpperCase().trim() || "EMP",
      emp_code_digits: Math.max(1, Math.min(Number(digits), 10)),
    }),
    "emp",
  );

  const deptMutation = makeUpdateMutation(() => ({ dept_names: deptNames }), "dept");
  const shiftMutation = makeUpdateMutation(() => ({ shift_names: shiftNames }), "shift");
  const qualityMutation = makeUpdateMutation(
    () => ({
      quality_cv_limit: cvLimit !== "" ? parseFloat(cvLimit) : null,
      quality_csp_min: cspMin !== "" ? parseInt(cspMin, 10) : null,
    }),
    "quality",
  );

  const nextSeq = (settings?.emp_code_last_seq ?? 0) + 1;
  const previewCode = `${prefix.toUpperCase() || "EMP"}-${String(nextSeq).padStart(Number(digits) || 4, "0")}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Company Settings</h1>
          <p className="text-sm text-muted-foreground">{activeMill?.name ?? "Mill"}</p>
        </div>
      </div>

      {/* ── 1. Employee ID Format ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Employee ID Format</CardTitle>
          </div>
          <CardDescription>
            SpinFlow auto-generates employee codes when the code field is left blank. Configure
            the prefix and zero-padding here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prefix">Prefix</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="EMP"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">Letters only, max 10 chars</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digits">Sequence Digits</Label>
              <Input
                id="digits"
                type="number"
                min={1}
                max={10}
                value={digits}
                onChange={(e) => setDigits(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Padding length (4 → 0001)</p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Next employee code preview</p>
            <p className="text-2xl font-mono font-bold tracking-wider text-foreground">
              {previewCode}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {settings?.emp_code_last_seq ?? 0} employees coded so far
            </p>
          </div>

          <SaveBtn section="emp" savedSection={savedSection} mutation={empMutation} />
        </CardContent>
      </Card>

      {/* ── 2. Departments ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Department Names</CardTitle>
          </div>
          <CardDescription>
            Define the department names for this mill. These appear in dropdown menus across HR,
            production, and quality modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TagListEditor
            label="Departments"
            description="Press Enter or click Add after each name"
            items={deptNames}
            onChange={setDeptNames}
            placeholder="e.g. Carding"
          />
          <SaveBtn section="dept" savedSection={savedSection} mutation={deptMutation} />
        </CardContent>
      </Card>

      {/* ── 3. Shifts ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Shift Names</CardTitle>
          </div>
          <CardDescription>
            Define shift names for this mill. These appear in attendance, payroll, and production
            entry forms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TagListEditor
            label="Shifts"
            description="Press Enter or click Add after each name"
            items={shiftNames}
            onChange={setShiftNames}
            placeholder="e.g. A Shift"
          />
          <SaveBtn section="shift" savedSection={savedSection} mutation={shiftMutation} />
        </CardContent>
      </Card>

      {/* ── 4. Quality Spec Limits ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Quality Spec Limits</CardTitle>
          </div>
          <CardDescription>
            Set thresholds for quality KPIs. Values outside these limits will be flagged in
            quality reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cvLimit">CV% Limit (max)</Label>
              <Input
                id="cvLimit"
                type="number"
                step="0.1"
                min={0}
                value={cvLimit}
                onChange={(e) => setCvLimit(e.target.value)}
                placeholder="e.g. 2.0"
              />
              <p className="text-xs text-muted-foreground">
                CV% above this is flagged red in reports
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cspMin">CSP Minimum</Label>
              <Input
                id="cspMin"
                type="number"
                step="1"
                min={0}
                value={cspMin}
                onChange={(e) => setCspMin(e.target.value)}
                placeholder="e.g. 2400"
              />
              <p className="text-xs text-muted-foreground">
                CSP below this is flagged red in reports
              </p>
            </div>
          </div>
          <SaveBtn section="quality" savedSection={savedSection} mutation={qualityMutation} />
        </CardContent>
      </Card>

      {/* ── 5. Custom Fields ──────────────────────────────────────────── */}
      <CustomFieldsCard millId={millId ?? ""} />

      {/* Info box */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-700">
            <strong>Importing employees?</strong> The bulk import accepts any employee code
            format — type it in the Excel sheet and SpinFlow stores it as-is. Auto-generation
            only applies when the code field is left blank during manual entry.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Custom Fields Card ────────────────────────────────────────────────────────
const MODULES = [
  { value: "employees", label: "Employees" },
  { value: "machines", label: "Machines" },
  { value: "quality", label: "Quality Forms" },
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
];

interface CustomField {
  field_key: string;
  field_label: string;
  field_type: string;
  dropdown_values: string[];
  is_required: boolean;
  sequence: number;
}

function CustomFieldsCard({ millId }: { millId: string }) {
  const queryClient = useQueryClient();
  const [module, setModule] = useState("employees");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newDropdownInput, setNewDropdownInput] = useState("");
  const [newDropdownValues, setNewDropdownValues] = useState<string[]>([]);
  const [addError, setAddError] = useState("");

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom-fields", millId, module],
    queryFn: async () => {
      const res = await api.get(`/api/v1/mill-config/custom-fields?module=${module}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!millId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newLabel.trim()) throw new Error("Field label is required");
      await api.post("/api/v1/mill-config/custom-fields", {
        module,
        field_label: newLabel.trim(),
        field_type: newType,
        dropdown_values: newType === "dropdown" ? newDropdownValues : [],
        is_required: newRequired,
        sequence: fields.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields", millId, module] });
      setNewLabel("");
      setNewType("text");
      setNewRequired(false);
      setNewDropdownValues([]);
      setNewDropdownInput("");
      setAddError("");
    },
    onError: (e: any) => setAddError(e.message ?? "Failed to add"),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) =>
      api.delete(`/api/v1/mill-config/custom-fields/${key}?module=${module}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["custom-fields", millId, module] }),
  });

  function addDropdownValue() {
    const v = newDropdownInput.trim();
    if (!v || newDropdownValues.includes(v)) return;
    setNewDropdownValues((prev) => [...prev, v]);
    setNewDropdownInput("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Custom Fields</CardTitle>
        </div>
        <CardDescription>
          Add extra fields per module. They appear automatically in forms and exports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Module selector */}
        <div className="flex items-center gap-3">
          <Label className="shrink-0">Module</Label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Existing fields */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No custom fields yet for this module.
          </p>
        ) : (
          <div className="divide-y rounded-md border overflow-hidden">
            {fields.map((f) => (
              <div key={f.field_key} className="flex items-center px-3 py-2.5 gap-3 text-sm bg-background">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{f.field_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {FIELD_TYPES.find((t) => t.value === f.field_type)?.label ?? f.field_type}
                    {f.is_required && " · Required"}
                    {f.field_type === "dropdown" && f.dropdown_values?.length > 0 && (
                      <> · {f.dropdown_values.join(", ")}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(f.field_key)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new field */}
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add field</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Blood Group"
                onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={newType} onValueChange={setNewType}>
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
          </div>

          {newType === "dropdown" && (
            <div className="space-y-2">
              <Label className="text-xs">Dropdown options</Label>
              <div className="flex gap-2">
                <Input
                  value={newDropdownInput}
                  onChange={(e) => setNewDropdownInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDropdownValue(); } }}
                  placeholder="Add option…"
                  className="max-w-xs"
                />
                <Button variant="outline" size="sm" onClick={addDropdownValue} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {newDropdownValues.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {newDropdownValues.map((v, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1">
                      {v}
                      <button
                        onClick={() => setNewDropdownValues((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded hover:bg-destructive/20 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded"
              />
              Required field
            </label>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newLabel.trim()}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {createMutation.isPending ? "Adding…" : "Add Field"}
            </Button>
            {addError && <p className="text-xs text-destructive">{addError}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
