import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useInvalidateMillMasters } from "@/hooks/useMillConfig";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  fuzzyMatchColumns, parseExcelDate, filterBlankRows, generateImportTemplate,
  isValidNumericString, validateDateString,
  FIELD_ALIASES,
  type ImportMapping,
} from "@/lib/excel-import";
import { useColumnConfig, type ColumnConfig } from "@/hooks/useColumnConfig";
import { useAuth } from "@/stores/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle,
  XCircle, ArrowLeft, ArrowRight,
} from "lucide-react";

interface UniversalImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  endpoint: string;
  onSuccess?: (count: number) => void;
  title?: string;
  importMillId?: string;
}

interface PreviewRecord {
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
}

interface ImportError {
  row: number;
  message: string;
  field?: string;
  value?: string;
  severity?: string;
}

function normalizeCustomFieldKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "custom_field";
}

function computeConfidence(
  header: string,
  col: ColumnConfig,
): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const nh = norm(header);
  const aliases = FIELD_ALIASES[col.key];
  if (aliases && aliases.some((a) => norm(a) === nh)) return 100;
  const levenshtein = (a: string, b: string): number => {
    const m = a.length; const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };
  const keyScore = levenshtein(nh, norm(col.key.replace(/_/g, " ")));
  const labelScore = levenshtein(nh, norm(col.label));
  const score = Math.min(keyScore, labelScore);
  const maxLen = Math.max(nh.length, 1);
  return Math.max(0, Math.round(100 - (score / maxLen) * 100));
}

export function UniversalImportModal({
  isOpen,
  onClose,
  tableName,
  endpoint,
  onSuccess,
  title,
  importMillId,
}: UniversalImportModalProps) {
  const { columns: colConfigs } = useColumnConfig(tableName);
  const user = useAuth((s) => s.user);
  const millId = importMillId ?? user?.millId ?? "";

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
  const [savedMappings, setSavedMappings] = useState<ImportMapping[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    success: number;
    created: number;
    updated: number;
    skipped: number;
    errors: ImportError[];
    auto_created_departments?: string[];
  } | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "create">("update");
  const qc = useQueryClient();
  const invalidateMillMasters = useInvalidateMillMasters();
  const [importError, setImportError] = useState<string | null>(null);
  const [showStep5Errors, setShowStep5Errors] = useState(false);
  const [dragging, setDragging] = useState(false);

  const colMap = useMemo(() => {
    const map: Record<string, ColumnConfig> = {};
    for (const c of colConfigs) {
      map[c.key] = c;
    }
    return map;
  }, [colConfigs]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setFile(null);
      setHeaders([]);
      setRawRows([]);
      setMapping({});
      setConfidence({});
      setPreviewRecords([]);
      setSavedMappings([]);
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
      setImportResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && tableName && millId) {
      api
        .get("/import/mappings", { params: { table: tableName, mill_id: millId } })
        .then((r) => {
          const data = r.data;
          const list = Array.isArray(data) ? data : data?.mappings ?? [];
          setSavedMappings(list);
        })
        .catch(() => {});
    }
  }, [isOpen, tableName, millId]);

  async function validateExcelFile(file: File): Promise<boolean> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") return true;
    const bytes = await file.slice(0, 4).arrayBuffer();
    const header = new Uint8Array(bytes);
    const isZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04;
    if (!isZip) {
      toast.error("Invalid file. Please upload a real Excel (.xlsx) or CSV file.");
      return false;
    }
    return true;
  }

  const handleFileRead = useCallback(
    async (f: File) => {
      if (!(await validateExcelFile(f))) return;
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error("No sheets found in the file");
        return;
      }
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 1) {
        toast.error("File is empty");
        return;
      }
      const hdrs = (rows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (hdrs.length === 0) {
        toast.error("No headers found in first row");
        return;
      }
      const data = rows.slice(1).filter((r: any[]) => r.some((c) => c !== undefined && c !== null && c !== ""));
      setFile(f);
      setHeaders(hdrs);
      setRawRows(data);

      const fuzzyResult = fuzzyMatchColumns(hdrs, colConfigs, savedMappings);
      const newMapping: Record<string, string | null> = {};
      const newConfidence: Record<string, number> = {};
      for (const h of hdrs) {
        const matched = fuzzyResult.get(h);
        newMapping[h] = matched?.key ?? null;
        newConfidence[h] = matched ? computeConfidence(h, matched) : 0;
      }
      for (const h of hdrs) {
        if (h.toLowerCase() === "column1" && !newMapping[h]) {
          const netPayableCol = colConfigs.find(c => c.key === "net_payable");
          if (netPayableCol) {
            newMapping[h] = "net_payable";
            newConfidence[h] = 100;
          }
        }
      }

      setMapping(newMapping);
      setConfidence(newConfidence);

      setStep(2);
    },
    [colConfigs, savedMappings],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileRead(f);
    },
    [handleFileRead],
  );

  const handleBrowse = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFileRead(f);
    },
    [handleFileRead],
  );

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

  const applyPreviousMapping = useCallback(() => {
    if (savedMappings.length === 0) return;
    const newMapping = { ...mapping };
    const newConfidence = { ...confidence };
    for (const sm of savedMappings) {
      if (sm.spinflow_field && headers.includes(sm.excel_header)) {
        const col = colMap[sm.spinflow_field];
        if (col) {
          newMapping[sm.excel_header] = sm.spinflow_field;
          newConfidence[sm.excel_header] = 100;
        }
      }
    }
    setMapping(newMapping);
    setConfidence(newConfidence);
    toast.success("Previous mapping applied");
  }, [savedMappings, headers, mapping, confidence, colMap]);

  const handleMappingChange = useCallback(
    (header: string, fieldKey: string | null) => {
      setMapping((prev) => ({ ...prev, [header]: fieldKey }));
      if (fieldKey && colMap[fieldKey]) {
        setConfidence((prev) => ({ ...prev, [header]: 100 }));
      } else {
        setConfidence((prev) => ({ ...prev, [header]: 0 }));
      }
    },
    [colMap],
  );

  const saveMappingsMutation = useMutation({
    mutationFn: (mappingsToSave: ImportMapping[]) =>
      api.post("/import/mappings", {
        mill_id: millId,
        table_name: tableName,
        mappings: mappingsToSave,
      }),
    onError: () => {
      console.warn("Could not save import mappings");
    },
  });

  const applyMapping = useCallback(() => {
    const colConfigArr = colConfigs;
    const keyToConfig: Record<string, ColumnConfig> = {};
    for (const c of colConfigArr) {
      keyToConfig[c.key] = c;
    }

    const records: PreviewRecord[] = [];
    for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
      const row = rawRows[rowIdx];
      const record: Record<string, any> = {};
      record.custom_fields = {};
      const errors: string[] = [];
      const warnings: string[] = [];

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const fieldKey = mapping[header];
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const nh = norm(header);
        const isCustom = !fieldKey && !colConfigs.some(
          c => norm(c.key) === nh || norm(c.label) === nh
        );

        if (isCustom) {
          record.custom_fields[normalizeCustomFieldKey(header)] = row[i] != null ? String(row[i]) : null;
          continue;
        }

        if (!fieldKey) continue;
        const colCfg = keyToConfig[fieldKey];
        let value = row[i];

        if (colCfg) {
          if (colCfg.type === "date") {
            value = validateDateString(value) ?? value;
          }
          if (colCfg.type === "number" && typeof value === "string" && value) {
            const stripped = value.replace(/,/g, "");
            value = isValidNumericString(stripped) ? parseFloat(stripped) : value;
          }
          if (colCfg.type === "boolean") {
            if (typeof value === "string") {
              value = ["yes", "1", "true"].includes(value.toLowerCase());
            }
          }
        }
        record[fieldKey] = value ?? null;
      }

      // Apply table-specific rules (mutates record, returns additional errors)
      const tableRule = TABLE_RULES[tableName];
      if (tableRule) {
        errors.push(...tableRule(record, colConfigArr, rowIdx));
      }

      // Auto-code warning (set by TABLE_RULES)
      if (record.__auto_code) {
        delete record.__auto_code;
        warnings.push(`Code auto-generated: ${record.code ?? record.employee_code}`);
      }

      // Required field check AFTER table rules (so auto-generated code doesn't error)
      for (const c of colConfigArr) {
        if (c.isRequired) {
          const val = record[c.key];
          if (val === undefined || val === null || val === "") {
            // Don't double-report if TABLE_RULES already added an error
            if (!errors.some(e => e.toLowerCase().includes(c.label.toLowerCase()))) {
              errors.push(`${c.label} is required`);
            }
          }
        }
      }

      records.push({ data: record, errors, warnings });
    }

    setPreviewRecords(records);

      const mappingsToSave: ImportMapping[] = Object.entries(mapping)
        .filter(([header, v]) => v !== null)
        .map(([header, field]) => ({
          excel_header: header,
          spinflow_field: field,
        }));
    try {
      saveMappingsMutation.mutate(mappingsToSave);
    } catch {
      // non-critical, ignore
    }

    setStep(3);
  }, [rawRows, headers, mapping, colConfigs, millId, tableName, saveMappingsMutation]);

  const handleCellEdit = useCallback(
    (rowIdx: number, fieldKey: string, value: any) => {
      setPreviewRecords((prev) => {
        const updated = [...prev];
        const row = { ...updated[rowIdx] };
        row.data = { ...row.data };

        if (fieldKey.startsWith("__custom__:")) {
          const cfKey = fieldKey.replace("__custom__:", "");
          row.data.custom_fields = { ...(row.data.custom_fields || {}), [cfKey]: value };
        } else {
          row.data[fieldKey] = value;
        }

        const colCfg = colMap[fieldKey];
        const errors: string[] = [];
        const warnings: string[] = [];

        if (colCfg?.isRequired && (value === undefined || value === null || value === "")) {
          errors.push(`${colCfg.label} is required`);
        }

        row.errors = errors;
        row.warnings = warnings;
        updated[rowIdx] = row;
        return updated;
      });
    },
    [colMap],
  );

  function validateNumericFields(
    record: Record<string, any>,
    configs: ColumnConfig[],
    nonNegativeKeys: string[],
  ): string[] {
    const errs: string[] = [];
    for (const key of nonNegativeKeys) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== "") {
        const num = Number(val);
        if (!isNaN(num) && num < 0) {
          const cfg = configs.find((c) => c.key === key);
          errs.push(`${cfg?.label ?? key} cannot be negative`);
        }
      }
    }
    return errs;
  }

  function validateAttendanceStatus(record: Record<string, any>): string | null {
    const status = record.status;
    if (!status) return null;
    const valid = ["present", "absent", "half-day", "leave", "holiday", "P", "A", "H", "CL", "SL", "EL", "OD", "WO"];
    if (!valid.includes(String(status).toLowerCase())) {
      return `Invalid attendance status '${status}'`;
    }
    return null;
  }

  function validateFutureDate(dateVal: any, label: string, refDate?: Date): string | null {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    const cutoff = refDate ?? new Date();
    cutoff.setHours(23, 59, 59, 999);
    if (d > cutoff) return `${label} cannot be in the future`;
    return null;
  }

  const TABLE_RULES: Record<string, (record: Record<string, any>, configs: ColumnConfig[], rowIdx?: number) => string[]> = {
    masters_machines: (rec, _cfgs, rowIdx) => {
      const errors: string[] = [];
      // Auto-generate code if missing (warning, not error)
      if (!rec.code || String(rec.code).trim() === "") {
        rec.code = `MC${String((rowIdx ?? 0) + 1).padStart(4, "0")}`;
        rec.__auto_code = true;
      }
      if (!rec.name || String(rec.name).trim() === "") {
        errors.push("Name is required");
      }
      if (rec.manufacturing_year) {
        const yr = Number(rec.manufacturing_year);
        if (isNaN(yr) || yr < 1900 || yr > 2035) {
          errors.push(`Manufacturing Year '${rec.manufacturing_year}' must be between 1900–2035`);
        }
      }
      if (rec.current_status) {
        const s = String(rec.current_status).toLowerCase().trim();
        if (!["running", "idle", "breakdown", "active", "inactive", "maintenance"].includes(s)) {
          rec.current_status = "running"; // coerce unknown status
        } else if (s === "active") {
          rec.current_status = "running";
        } else if (s === "inactive") {
          rec.current_status = "idle";
        }
      }
      return errors;
    },
    hr_employees: (rec, cfgs, rowIdx) => {
      // Auto-generate employee_code if missing
      if (!rec.employee_code || String(rec.employee_code).trim() === "") {
        rec.employee_code = `EMP${String((rowIdx ?? 0) + 1).padStart(4, "0")}`;
        rec.__auto_code = true;
      }
      // Coerce grade to string
      if (rec.grade !== undefined && rec.grade !== null) {
        rec.grade = String(rec.grade).trim();
      }
      // Normalize gender
      if (rec.gender) {
        const g = String(rec.gender).toLowerCase().trim();
        if (["m", "male"].includes(g)) rec.gender = "Male";
        else if (["f", "female"].includes(g)) rec.gender = "Female";
        else rec.gender = "Other";
      }
      // Strip commas from salary fields
      for (const f of ["basic", "wages", "total_salary", "house_rent", "medical",
                       "conveyance", "food_allowance", "mobile_bill", "shift_benefit"]) {
        if (rec[f] !== undefined && typeof rec[f] === "string") {
          rec[f] = parseFloat(rec[f].replace(/,/g, "")) || 0;
        }
      }
      return [
        ...validateNumericFields(rec, cfgs, ["basic", "house_rent", "medical", "conveyance", "food_allowance", "wages", "increment", "total_salary", "mobile_bill", "shift_benefit"]),
        ...(rec.date_of_joining ? (() => {
          const e = validateFutureDate(rec.date_of_joining, "Date of Joining");
          return e ? [e] : [];
        })() : []),
      ];
    },
    hr_attendance: (rec, cfgs) => [
      ...(validateAttendanceStatus(rec) ? [validateAttendanceStatus(rec)!] : []),
      ...(rec.date ? (() => {
        const e = validateFutureDate(rec.date, "Date");
        return e ? [e] : [];
      })() : []),
    ],
  };

  const validateRecord = useCallback(
    (record: Record<string, any>): { errors: string[]; warnings: string[] } => {
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const c of colConfigs) {
        const val = record[c.key];
        if (c.isRequired) {
          if (val === undefined || val === null || val === "") {
            errors.push(`${c.label} is required`);
          }
        }
        if (c.type === "number" && typeof val === "string" && val !== "") {
          if (!isValidNumericString(val)) {
            errors.push(`${c.label}: '${val}' is not a valid number`);
          }
        }
        if (c.type === "date" && typeof val === "string" && val !== "") {
          if (!validateDateString(val)) {
            errors.push(`${c.label}: '${val}' is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);
          }
        }
      }
      const tableRule = TABLE_RULES[tableName];
      if (tableRule) {
        errors.push(...tableRule(record, colConfigs, undefined));
      }
      return { errors, warnings };
    },
    [colConfigs, tableName],
  );

  const FIELD_MAP: Record<string, Record<string, string>> = {
    hr_employees: {
      name: "full_name",
      employee_id: "employee_code",
      joining_date: "date_of_joining",
    },
    hr_attendance: {
      employee_code: "employee_id",
      employee_name: "employee_name",
    },
    stores_spares: {
      code: "item_code",
      stock: "current_stock",
      min_stock: "reorder_level",
    },
    production_entries: {
    },
    quality_tests: {
    },
    maintenance_schedules: {
      description: "task_description",
      last_done: "last_done_date",
      next_due: "next_due_date",
    },
    masters_machines: {
    },
    masters_customers: {
    },
  };

  const TABLE_KEY_FIELDS: Record<string, string[]> = {
    hr_employees: ["name", "employee_id", "sl_no", "full_name", "employee_code"],
    masters_machines: ["name", "code"],
    masters_customers: ["name", "code"],
    masters_departments: ["name", "code"],
    masters_vehicles: ["vehicle_no", "name"],
  };

  const handleImport = useCallback(async () => {
    try {
      await api.get("/auth/me");
      const keyFields = TABLE_KEY_FIELDS[tableName];
      const nonBlank = filterBlankRows(
        previewRecords.map((r) => r.data),
        keyFields,
      );

      const fieldMap = FIELD_MAP[tableName] ?? {};
      const validRecords = nonBlank.map((rec) => {
        const mapped: Record<string, any> = {};
        const customFields: Record<string, string> = {};
        for (const [key, value] of Object.entries(rec)) {
          if (key === "custom_fields") {
            if (value && typeof value === "object") {
              Object.assign(customFields, value);
            }
          } else {
            mapped[fieldMap[key] ?? key] = value;
          }
        }
        if (Object.keys(customFields).length > 0) {
          mapped.custom_fields = customFields;
        }
        return mapped;
      });
      if (validRecords.length === 0) {
        toast.error("No valid records to import");
        return;
      }

      setStep(4);
      setIsImporting(true);
      setImportError(null);
      setImportProgress({ current: 0, total: validRecords.length });

      const BATCH_SIZE = 20;
      const MAX_RETRIES = 3;
      let successCount = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      const errors: ImportError[] = [];
      const autoDepts: string[] = [];

      for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
        const batch = validRecords.slice(i, i + BATCH_SIZE);
        const sanitized = batch.map(record => ({
          ...record,
          employee_code: record.employee_code != null ? String(record.employee_code).trim() : "",
          gen: record.gen != null ? String(record.gen).trim() : null,
          grade: record.grade != null ? String(record.grade).trim() : null,
        }));

        let res;
        let lastErr: any;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            res = await api.post(`${endpoint}?mode=${duplicateMode}`, { items: sanitized, mill_id: millId });
            break;
          } catch (err: any) {
            lastErr = err;
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
        }
        if (!res) {
          errors.push({ row: i + 1, message: `Network error after ${MAX_RETRIES} retries: ${lastErr?.message}`, severity: "error" });
          setImportProgress({ current: Math.min(i + BATCH_SIZE, validRecords.length), total: validRecords.length });
          continue;
        }

        const data: any = res.data;
        console.log("batch response data:", data);
        const batchCreated = typeof data?.created === "number" ? data.created : 0;
        const batchUpdated = typeof data?.updated === "number" ? data.updated : 0;
        const batchSkipped = typeof data?.skipped === "number" ? data.skipped : 0;
        totalCreated += batchCreated;
        totalUpdated += batchUpdated;
        totalSkipped += batchSkipped;
        successCount += batchCreated + batchUpdated;
        if (Array.isArray(data?.auto_created_departments)) {
          autoDepts.push(...data.auto_created_departments);
        }
        if (data?.errors?.length > 0) {
          for (const e of data.errors) {
            errors.push({
              row: (i + (e.row ?? 1)),
              message: e.error ?? e.message ?? "Import error",
              field: e.code ? `Code: ${e.code}` : e.field,
              value: e.name ?? e.value,
              severity: e.severity ?? "error",
            });
          }
        }
        setImportProgress({ current: Math.min(i + BATCH_SIZE, validRecords.length), total: validRecords.length });
      }

      setIsImporting(false);
      setImportResult({
        success: successCount,
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped || (validRecords.length - successCount),
        errors,
        auto_created_departments: autoDepts.length > 0 ? [...new Set(autoDepts)] : undefined,
      });
      setStep(5);
      onSuccess?.(successCount);
      // Invalidate all relevant queries so UI reflects the import
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      invalidateMillMasters();
    } catch (err: any) {
      setIsImporting(false);
      const msg = err?.message ?? String(err) ?? "Unknown error during import";
      setImportError(msg);
      setImportResult({
        success: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, message: msg }],
      });
      setStep(5);
    }
  }, [previewRecords, endpoint, millId, onSuccess, tableName]);

  const validCount = previewRecords.filter((r) => r.errors.length === 0).length;
  const errorCount = previewRecords.filter((r) => r.errors.length > 0).length;

  const renderStep1 = () => (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("import-file-input")?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
        )}
      >
        <input
          id="import-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleBrowse}
        />
        <Upload className="size-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-base font-medium">Drop your Excel file here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, and .csv files</p>
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
  );

  const getConfidenceBadge = (value: number) => {
    if (value >= 80) {
      return <Badge variant="default" className="bg-green-600 hover:bg-green-600">{value}%</Badge>;
    }
    if (value >= 40) {
      return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-500 text-white">{value}%</Badge>;
    }
    return <Badge variant="destructive">{value}%</Badge>;
  };

  const renderStep2 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Map your Excel columns to SpinFlow fields</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          We detected {headers.length} columns in your file
        </p>
      </div>

      {savedMappings.length > 0 && (
        <Button variant="outline" size="sm" onClick={applyPreviousMapping}>
          <CheckCircle2 className="size-3.5 mr-1" />
          Use Previous Mapping
        </Button>
      )}

      <div className="max-h-80 overflow-y-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Your Excel Column</TableHead>
              <TableHead>Maps To</TableHead>
              <TableHead className="w-24">Matched</TableHead>
              <TableHead className="w-16 text-center">Skip</TableHead>
            </TableRow>
          </TableHeader>
              <TableBody>
                {headers.map((header) => {
                  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const nh = norm(header);
                  const autoCustom = !mapping[header] && !colConfigs.some(
                    c => norm(c.key) === nh || norm(c.label) === nh
                  );
                  return (
                    <TableRow key={header}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell>
                        {autoCustom ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300">
                              Custom: {normalizeCustomFieldKey(header)}
                            </Badge>
                          </div>
                        ) : (
                          <Select
                            value={mapping[header] ?? "__skip__"}
                            onValueChange={(v) => handleMappingChange(header, v === "__skip__" ? null : v)}
                          >
                            <SelectTrigger className="w-56">
                              <SelectValue placeholder="— Skip —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">— Skip —</SelectItem>
                              {colConfigs.map((c) => (
                                <SelectItem key={c.key} value={c.key}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {autoCustom ? (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                            New
                          </Badge>
                        ) : mapping[header] ? (
                          getConfidenceBadge(confidence[header] ?? 0)
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={mapping[header] === null && !autoCustom}
                          onCheckedChange={(chk) => {
                            if (chk) {
                              handleMappingChange(header, null);
                            } else if (headers.length > 0) {
                              const fuzzyResult = fuzzyMatchColumns([header], colConfigs, savedMappings);
                              const matched = fuzzyResult.get(header);
                              handleMappingChange(header, matched?.key ?? null);
                            }
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep(1)}>
          <ArrowLeft className="size-4 mr-1" />
          Back to Upload
        </Button>
        <Button onClick={applyMapping}>
          Apply Mapping
          <ArrowRight className="size-4 ml-1" />
        </Button>
      </DialogFooter>
    </div>
  );

  const getRowVariant = (record: PreviewRecord): string => {
    if (record.errors.length > 0) return "bg-red-50 dark:bg-red-950/20";
    if (record.warnings.length > 0) return "bg-yellow-50 dark:bg-yellow-950/20";
    return "";
  };

  const renderStep3 = () => {
    const displayRecords = previewRecords.slice(0, 20);
    const standardFields = Object.values(mapping).filter(Boolean) as string[];
    const customKeys = [...new Set(displayRecords.flatMap(r =>
      Object.keys(r.data.custom_fields || {}).map(k => `__custom__:${k}`)
    ))];
    const mappedFields = [...standardFields, ...customKeys];
    const isCustomKey = (k: string) => k.startsWith("__custom__:");
    const customKeyToHeader = (k: string) => k.replace("__custom__:", "");

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="default" className="bg-green-600 hover:bg-green-600">
            {validCount} Valid
          </Badge>
          {errorCount > 0 && (
            <Badge variant="destructive">{errorCount} Errors</Badge>
          )}
          <span className="text-muted-foreground">
            {previewRecords.length - validCount - errorCount} Skipped
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            Showing first {displayRecords.length} of {previewRecords.length} rows
          </span>
        </div>

        <div className="max-h-80 overflow-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {mappedFields.map((fk) => (
                  <TableHead key={fk}>
                    {isCustomKey(fk)
                      ? customKeyToHeader(fk).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                      : (colMap[fk]?.label ?? fk)}
                  </TableHead>
                ))}
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRecords.map((record, ri) => (
                <TableRow key={ri} className={getRowVariant(record)}>
                  <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                  {mappedFields.map((fk) => {
                    if (isCustomKey(fk)) {
                      const cfKey = customKeyToHeader(fk);
                      return (
                        <TableCell key={fk}>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="h-5 text-[10px] px-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300">Custom</Badge>
                            <Input
                              className="h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-offset-0"
                              value={String(record.data.custom_fields?.[cfKey] ?? "")}
                              onChange={(e) => handleCellEdit(ri, fk, e.target.value)}
                            />
                          </div>
                        </TableCell>
                      );
                    }
                    const colLabel = colMap[fk]?.label ?? "";
                    return (
                      <TableCell key={fk}>
                        <Input
                          className={cn(
                            "h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-offset-0",
                            record.errors.some((e) => e.includes(colLabel)) && "text-red-600",
                          )}
                          value={String(record.data[fk] ?? "")}
                          onChange={(e) => handleCellEdit(ri, fk, e.target.value)}
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {record.errors.length > 0 ? (
                      <div className="flex items-center gap-1 text-red-600 text-xs" title={record.errors.join("; ")}>
                        <XCircle className="size-3.5" />
                        <span className="truncate max-w-24">{record.errors[0]}</span>
                      </div>
                    ) : record.warnings.length > 0 ? (
                      <div className="flex items-center gap-1 text-yellow-600 text-xs">
                        <AlertTriangle className="size-3.5" />
                        <span>Warning</span>
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

        {validCount === 0 && previewRecords.length > 0 && (
          <p className="text-sm text-destructive text-center">
            No valid records to import. Fix the errors shown above.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep(2)}>
            <ArrowLeft className="size-4 mr-1" />
            Back to Mapping
          </Button>
          <Button onClick={handleImport} disabled={validCount === 0}>
            Import {validCount} Records
            <ArrowRight className="size-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  };

  const renderStep4 = () => {
    const pct = importProgress.total > 0
      ? Math.round((importProgress.current / importProgress.total) * 100)
      : 0;

    return (
      <div className="py-12 space-y-6 text-center">
        <div className="animate-pulse">
          <FileSpreadsheet className="size-12 mx-auto text-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-medium">Importing...</p>
          <p className="text-sm text-muted-foreground">
            {importProgress.current} / {importProgress.total} records
          </p>
        </div>
        <div className="max-w-sm mx-auto">
          <Progress value={pct} />
        </div>
      </div>
    );
  };

  const renderStep5 = () => {
    const hardErrors = importResult?.errors.filter(e => !e.severity || e.severity === "error") ?? [];
    const warnings = importResult?.errors.filter(e => e.severity === "warning") ?? [];
    const hasErrors = hardErrors.length > 0 || warnings.length > 0;
    const hasHardErrors = hardErrors.length > 0;
    const isTotalFailure = importError !== null;

    return (
      <div className="py-8 space-y-6 text-center">
        {isTotalFailure ? (
          <>
            <div className="mx-auto size-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <XCircle className="size-8 text-red-600" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium">Import failed</p>
              <p className="text-sm text-red-600">{importError}</p>
              <p className="text-xs text-muted-foreground">No records were imported.</p>
            </div>
          </>
        ) : hasHardErrors ? (
          <>
            <div className="mx-auto size-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="size-8 text-yellow-600" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium">Import completed with issues</p>
              <div className="flex justify-center gap-3 flex-wrap">
                {importResult!.created > 0 && (
                  <span className="text-sm font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                    ✓ {importResult!.created} created
                  </span>
                )}
                {importResult!.updated > 0 && (
                  <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                    ↻ {importResult!.updated} updated
                  </span>
                )}
                {importResult!.skipped > 0 && (
                  <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                    ⊘ {importResult!.skipped} skipped
                  </span>
                )}
                {hardErrors.length > 0 && (
                  <span className="text-sm font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                    ✗ {hardErrors.length} errors
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="size-8 text-green-600" />
            </div>
            <p className="text-lg font-medium">Import complete!</p>
            {/* 4-stat summary row */}
            <div className="flex justify-center gap-4 flex-wrap mt-2">
              {(importResult?.created ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  {importResult!.created} created
                </div>
              )}
              {(importResult?.updated ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                  ↻ {importResult!.updated} updated
                </div>
              )}
              {(importResult?.skipped ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
                  ⊘ {importResult!.skipped} skipped
                </div>
              )}
              {warnings.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
                  <AlertTriangle className="w-4 h-4" /> {warnings.length} warnings
                </div>
              )}
            </div>
            {/* Auto-created departments banner */}
            {(importResult?.auto_created_departments?.length ?? 0) > 0 && (
              <div className="mt-3 text-left bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                <strong>New departments auto-created:</strong>{" "}
                {importResult!.auto_created_departments!.join(", ")}
                <div className="text-xs text-blue-600 mt-1">Review them in Masters → Departments.</div>
              </div>
            )}
          </>
        )}

        {hasErrors && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStep5Errors(!showStep5Errors)}
            >
              {showStep5Errors ? "Hide" : "View"} Error Details
            </Button>
            {showStep5Errors && (hasHardErrors || warnings.length > 0) && (
              <div className="mt-3 max-h-48 overflow-y-auto text-left space-y-1">
                {hardErrors.map((err, i) => (
                  <div key={i} className="text-sm p-2 rounded border bg-red-50 text-red-700 border-red-200">
                    <span className="font-medium">Row {err.row}</span>
                    {err.field ? ` — ${err.field}` : ''}
                    {err.value ? ` ("${err.value}")` : ''}
                    {err.message ? `: ${err.message}` : ''}
                  </div>
                ))}
                {warnings.map((err, i) => (
                  <div key={`w-${i}`} className="text-sm p-2 rounded border bg-yellow-50 text-yellow-700 border-yellow-200">
                    <span className="font-medium">Row {err.row}</span>
                    {err.field ? ` — ${err.field}` : ''}
                    {err.value ? ` ("${err.value}")` : ''}
                    : {err.message || 'Unknown warning'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="justify-center">
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </div>
    );
  };

  const stepTitles: Record<number, string> = {
    1: "Upload Excel File",
    2: "Column Mapping",
    3: "Preview Data",
    4: "Importing",
    5: "Complete",
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn(
        "max-w-5xl max-h-[90vh] overflow-y-auto",
        step === 1 && "max-w-lg",
      )}>
        <DialogHeader>
          <DialogTitle>{title ?? `Import ${tableName}`}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "size-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s < step ? <CheckCircle2 className="size-4" /> : s}
              </div>
              {s < 5 && (
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    s < step ? "bg-green-500" : "bg-muted",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </DialogContent>
    </Dialog>
  );
}
