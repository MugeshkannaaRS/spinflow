import { useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  validateDateString,
  isValidNumericString,
  filterBlankRows,
  generateImportTemplate,
} from "@/lib/excel-import";
import { useColumnConfig, type ColumnConfig } from "@/hooks/useColumnConfig";
import { useAuth } from "@/stores/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

/**
 * DirectImportModal — single-mill, mapping-free Excel import.
 *
 * Replaces the old UniversalImportModal + SmartColumnMapper pipeline.
 * Because SpinFlow now serves ONE mill, there is no need for per-mill
 * saved column mappings or a fuzzy-match step. Excel headers are matched
 * directly to SpinFlow fields by:
 *   1. the `[field_key]` marker row that the downloaded template embeds, OR
 *   2. exact / normalized match against each column's key or label.
 *
 * Flow: Upload → Preview (auto-mapped) → Import → Done.
 */

interface DirectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Column-config table name, e.g. "maintenance_schedules" */
  tableName: string;
  /** Backend bulk endpoint, e.g. "/maintenance/schedules/bulk" */
  endpoint: string;
  onSuccess?: (count: number) => void;
  title?: string;
  /** Accepted for backwards-compatibility; ignored in single-mill mode. */
  importMillId?: string;
}

interface PreviewRow {
  data: Record<string, any>;
  errors: string[];
}

const norm = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Key fields used to drop fully-blank rows, per table. */
const TABLE_KEY_FIELDS: Record<string, string[]> = {
  maintenance_schedules: ["machine_code", "task_description", "description"],
  maintenance_parameters: ["machine_code", "parameter_name"],
  masters_machines: ["name", "code"],
  masters_customers: ["name", "code"],
  masters_departments: ["name", "code"],
  hr_employees: ["full_name", "employee_code", "sl_no"],
};

/**
 * Header aliases — maps common Excel column-header variants to a field key,
 * per table. This is a small, fixed lookup (NOT the old fuzzy/saved-mapping
 * system): it only kicks in when a header doesn't match a column's key/label
 * exactly. Keys are normalized (lowercased, alphanumerics only) on use.
 */
const HEADER_ALIASES: Record<string, Record<string, string>> = {
  maintenance_schedules: {
    // description variants (col key is "description")
    workdescription: "description",
    taskdescription: "description",
    task: "description",
    activity: "description",
    pmactivity: "description",
    maintenanceactivity: "description",
    workdone: "description",
    jobdescription: "description",
    descriptionofwork: "description",
    // machine variants
    machinecode: "machine_code",
    machineno: "machine_code",
    machine: "machine_code",
    machinetype: "type",
    // note: "machine_name" is intentionally NOT aliased — it is descriptive only
    // and not a ScheduleBulkItem field, so it is safely ignored on import.
    // frequency: human label vs explicit days
    frequency: "frequency", // e.g. "01 Month" — kept as text, backend resolves to days
    freq: "frequency",
    frequencyofwork: "frequency",
    frequencydays: "frequency_days",
    freqdays: "frequency_days",
    // enrichment variants
    dept: "department",
    section: "department",
    slno: "sl_no",
    sino: "sl_no",
    srno: "sl_no",
    manpower: "manpower_count",
    manpowercount: "manpower_count",
    machinecount: "machine_count",
    noofmachines: "machine_count",
    lubricantname: "lubricant_name",
    lubricatingnamebrand: "lubricant_name",
    lubricant: "lubricant_name",
    lubricantquantity: "lubricant_quantity",
    quantity: "lubricant_quantity",
    machinelinecode: "machine_line_code",
    linecode: "machine_line_code",
    openingdiamm: "opening_dia_mm",
    openingdia: "opening_dia_mm",
    currentdiamm: "current_dia_mm",
    currentdia: "current_dia_mm",
    grindingfreqdays: "grinding_freq_days",
    lastgrindingdate: "last_grinding_date",
    // date variants
    lastdone: "last_done",
    lastdonedate: "last_done",
    nextdue: "next_due",
    nextduedate: "next_due",
  },
};

/**
 * Field-name normalization applied just before POST, so the payload keys
 * match what the bulk endpoint's Pydantic schema expects. This is a small,
 * explicit per-table map — NOT a saved/fuzzy mapping system.
 */
const FIELD_RENAME: Record<string, Record<string, string>> = {
  maintenance_schedules: {
    description: "task_description",
    last_done: "last_done_date",
    next_due: "next_due_date",
  },
};

export function DirectImportModal({
  isOpen,
  onClose,
  tableName,
  endpoint,
  onSuccess,
  title,
}: DirectImportModalProps) {
  const { columns: colConfigs } = useColumnConfig(tableName);
  const user = useAuth((s) => s.user);
  const millId = user?.millId ?? "";
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setFile(null);
      setRows([]);
      setFields([]);
      setIsImporting(false);
      setProgress({ current: 0, total: 0 });
      setResult(null);
      setImportError(null);
    }
  }, [isOpen]);

  /** Build header → field-key resolver using template marker row + label/key match. */
  const resolveHeaders = useCallback(
    (headers: string[], markerRow: string[] | null): (string | null)[] => {
      const byNorm: Record<string, string> = {};
      for (const c of colConfigs) {
        byNorm[norm(c.key)] = c.key;
        byNorm[norm(c.label)] = c.key;
      }
      const aliases = HEADER_ALIASES[tableName] ?? {};
      const knownKeys = new Set(colConfigs.map((c) => c.key));
      return headers.map((h, i) => {
        // 1. Template marker row like "[machine_code]"
        const marker = markerRow?.[i];
        if (marker) {
          const m = String(marker).match(/^\[(.+)\]$/);
          if (m && colConfigs.some((c) => c.key === m[1])) return m[1];
        }
        const nh = norm(h);
        // 2. Direct normalized match on key or label
        if (byNorm[nh]) return byNorm[nh];
        // 3. Header-alias fallback (common variants → field key)
        const aliased = aliases[nh];
        if (aliased) return aliased;
        return null;
      });
      void knownKeys;
    },
    [colConfigs, tableName],
  );

  const coerce = useCallback(
    (value: any, cfg?: ColumnConfig): any => {
      if (value === undefined || value === "") return null;
      if (!cfg) return value ?? null;
      if (cfg.type === "date") return validateDateString(value) ?? value;
      if (cfg.type === "number" && typeof value === "string" && value) {
        const stripped = value.replace(/,/g, "");
        return isValidNumericString(stripped) ? parseFloat(stripped) : value;
      }
      if (cfg.type === "boolean") {
        if (typeof value === "string")
          return ["yes", "1", "true"].includes(value.toLowerCase());
        return Boolean(value);
      }
      return value ?? null;
    },
    [],
  );

  const handleFile = useCallback(
    async (f: File) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
        toast.error("Please upload a .xlsx, .xls, or .csv file");
        return;
      }
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error("No sheet found in file");
        return;
      }
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (aoa.length < 1) {
        toast.error("File is empty");
        return;
      }
      const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim());

      // Detect a template marker row "[key]" anywhere in the first 4 rows.
      let markerRow: string[] | null = null;
      let dataStart = 1;
      for (let r = 1; r < Math.min(aoa.length, 4); r++) {
        const cells = (aoa[r] as any[]).map((c) => String(c ?? "").trim());
        if (cells.some((c) => /^\[.+\]$/.test(c))) {
          markerRow = cells;
          dataStart = r + 1;
        }
      }

      const resolved = resolveHeaders(headers, markerRow);
      const cfgByKey: Record<string, ColumnConfig> = {};
      for (const c of colConfigs) cfgByKey[c.key] = c;

      const usedFields = resolved.filter(Boolean) as string[];
      setFields([...new Set(usedFields)]);

      const dataRows = aoa
        .slice(dataStart)
        .filter((r: any[]) =>
          r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""),
        );

      const preview: PreviewRow[] = dataRows.map((row) => {
        const rec: Record<string, any> = {};
        for (let i = 0; i < headers.length; i++) {
          const fk = resolved[i];
          if (!fk) continue; // unmapped columns are simply ignored (single-mill: no custom-field machinery)
          rec[fk] = coerce(row[i], cfgByKey[fk]);
        }
        // Required-field validation
        const errors: string[] = [];
        for (const c of colConfigs) {
          if (c.isRequired) {
            const v = rec[c.key];
            if (v === undefined || v === null || v === "") errors.push(`${c.label} is required`);
          }
        }
        return { data: rec, errors };
      });

      if (preview.length === 0) {
        toast.error("No data rows found");
        return;
      }

      setFile(f);
      setRows(preview);
      setStep(2);
    },
    [colConfigs, resolveHeaders, coerce],
  );

  const handleImport = useCallback(async () => {
    const keyFields = TABLE_KEY_FIELDS[tableName] ?? [];
    const rename = FIELD_RENAME[tableName] ?? {};
    const nonBlank = filterBlankRows(
      rows.map((r) => r.data),
      keyFields,
    );
    const items = nonBlank.map((rec) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(rec)) out[rename[k] ?? k] = v;
      return out;
    });
    if (items.length === 0) {
      toast.error("No valid records to import");
      return;
    }

    setStep(3);
    setIsImporting(true);
    setImportError(null);
    setProgress({ current: 0, total: items.length });

    const MAX_RETRIES = 3;
    let res: any = null;
    let lastErr: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        res = await api.post(`${endpoint}?mill_id=${millId ?? ""}`, {
          items,
          mill_id: millId,
        });
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }

    setProgress({ current: items.length, total: items.length });
    setIsImporting(false);

    if (!res) {
      const detail = lastErr?.response?.data?.detail ?? lastErr?.message ?? "Network error";
      const msg = Array.isArray(detail) ? detail.map((e: any) => e.msg).join(", ") : detail;
      setImportError(`Import failed: ${msg}`);
      setResult({ created: 0, updated: 0, skipped: 0, errors: [] });
      setStep(4);
      return;
    }

    const data: any = res.data ?? {};
    const created = typeof data.created === "number" ? data.created : 0;
    const updated = typeof data.updated === "number" ? data.updated : 0;
    const skipped = typeof data.skipped === "number" ? data.skipped : 0;
    const errors: string[] = Array.isArray(data.errors)
      ? data.errors.map((e: any) => (typeof e === "string" ? e : (e.error ?? e.message ?? JSON.stringify(e))))
      : [];

    setResult({ created, updated, skipped, errors });
    setStep(4);
    onSuccess?.(created + updated);
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }, [rows, tableName, endpoint, millId, onSuccess, qc]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await generateImportTemplate(colConfigs, tableName, user?.millName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tableName}_import_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate template");
    }
  }, [colConfigs, tableName, user]);

  const cfgByKey: Record<string, ColumnConfig> = {};
  for (const c of colConfigs) cfgByKey[c.key] = c;
  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-w-4xl max-h-[90vh] overflow-y-auto", step === 1 && "max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title ?? `Import ${tableName.replace(/_/g, " ")}`}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "size-7 rounded-full flex items-center justify-center text-xs font-medium",
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s < step ? <CheckCircle2 className="size-4" /> : s}
              </div>
              {s < 4 && <div className={cn("h-0.5 flex-1", s < step ? "bg-green-500" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              onClick={() => document.getElementById("direct-import-input")?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
              )}
            >
              <input
                id="direct-import-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload className="size-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base font-medium">Drop your Excel file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Columns are matched automatically — no mapping step needed.
              </p>
              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="size-4" />
                  <span>{file.name}</span>
                </div>
              )}
            </div>
            <div className="text-center">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="size-4 mr-1" />
                Download Template
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Badge className="bg-green-600 hover:bg-green-600">{validCount} Valid</Badge>
              {errorCount > 0 && <Badge variant="destructive">{errorCount} With errors</Badge>}
              <span className="text-xs text-muted-foreground ml-auto">
                {rows.length} row(s) detected • {fields.length} column(s) matched
              </span>
            </div>
            <div className="max-h-80 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    {fields.map((fk) => (
                      <TableHead key={fk}>{cfgByKey[fk]?.label ?? fk}</TableHead>
                    ))}
                    <TableHead className="w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, ri) => (
                    <TableRow key={ri} className={r.errors.length ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                      {fields.map((fk) => (
                        <TableCell key={fk}>
                          <Input
                            className="h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-1"
                            value={String(r.data[fk] ?? "")}
                            onChange={(e) =>
                              setRows((prev) => {
                                const next = [...prev];
                                next[ri] = { ...next[ri], data: { ...next[ri].data, [fk]: e.target.value } };
                                return next;
                              })
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        {r.errors.length ? (
                          <div className="flex items-center gap-1 text-red-600 text-xs" title={r.errors.join("; ")}>
                            <XCircle className="size-3.5" />
                            <span className="truncate max-w-24">{r.errors[0]}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="size-3.5" />
                            <span>Valid</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 50 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing first 50 rows — all {rows.length} will be imported.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                Import {validCount} Records <ArrowRight className="size-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 3 && (
          <div className="py-12 space-y-6 text-center">
            <div className="animate-pulse">
              <FileSpreadsheet className="size-12 mx-auto text-primary" />
            </div>
            <p className="text-lg font-medium">Importing…</p>
            <p className="text-sm text-muted-foreground">
              {progress.current} / {progress.total} records
            </p>
            <div className="max-w-sm mx-auto">
              <Progress value={progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0} />
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && (
          <div className="py-8 space-y-6 text-center">
            {importError ? (
              <>
                <div className="mx-auto size-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="size-8 text-red-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-medium">Import failed</p>
                  <p className="text-sm text-red-600">{importError}</p>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="size-8 text-green-600" />
                </div>
                <p className="text-lg font-medium">Import complete</p>
                <div className="flex justify-center gap-3 flex-wrap text-sm">
                  {(result?.created ?? 0) > 0 && (
                    <span className="font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                      ✓ {result!.created} created
                    </span>
                  )}
                  {(result?.updated ?? 0) > 0 && (
                    <span className="font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                      ↻ {result!.updated} updated
                    </span>
                  )}
                  {(result?.skipped ?? 0) > 0 && (
                    <span className="font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
                      ⊘ {result!.skipped} skipped
                    </span>
                  )}
                </div>
                {(result?.errors?.length ?? 0) > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto text-left space-y-1">
                    {result!.errors.map((e, i) => (
                      <div key={i} className="text-xs p-2 rounded border bg-red-50 text-red-700 border-red-200">
                        {e}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <DialogFooter className="justify-center">
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
