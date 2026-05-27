import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  fuzzyMatchColumns, parseExcelDate, filterBlankRows, generateImportTemplate,
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
}

interface PreviewRecord {
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
}

interface ImportError {
  row: number;
  message: string;
}

function computeConfidence(
  header: string,
  col: ColumnConfig,
): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
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
  const nh = norm(header);
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
}: UniversalImportModalProps) {
  const { columns: colConfigs } = useColumnConfig(tableName);
  const user = useAuth((s) => s.user);
  const millId = user?.millId ?? "";

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
    skipped: number;
    errors: ImportError[];
  } | null>(null);
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

  const handleFileRead = useCallback(
    async (f: File) => {
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
  });

  const applyMapping = useCallback(() => {
    const colConfigArr = colConfigs;
    const keyToConfig: Record<string, ColumnConfig> = {};
    for (const c of colConfigArr) {
      keyToConfig[c.key] = c;
    }

    const records: PreviewRecord[] = [];
    for (const row of rawRows) {
      const record: Record<string, any> = {};
      const errors: string[] = [];
      const warnings: string[] = [];

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const fieldKey = mapping[header];
        if (!fieldKey) continue;
        const colCfg = keyToConfig[fieldKey];
        let value = row[i];

        if (colCfg) {
          if (colCfg.type === "date") {
            value = parseExcelDate(value);
          }
          if (colCfg.type === "number" && typeof value === "string" && value) {
            const parsed = parseFloat(value);
            value = isNaN(parsed) ? value : parsed;
          }
          if (colCfg.type === "boolean") {
            if (typeof value === "string") {
              value = ["yes", "1", "true"].includes(value.toLowerCase());
            }
          }
        }
        record[fieldKey] = value ?? null;
      }

      for (const c of colConfigArr) {
        if (c.isRequired) {
          const val = record[c.key];
          if (val === undefined || val === null || val === "") {
            errors.push(`${c.label} is required`);
          }
        }
      }

      records.push({ data: record, errors, warnings });
    }

    setPreviewRecords(records);

    const mappingsToSave: ImportMapping[] = Object.entries(mapping)
      .filter(([, v]) => v !== null)
      .map(([header, field]) => ({
        excel_header: header,
        spinflow_field: field,
      }));
    saveMappingsMutation.mutate(mappingsToSave);

    setStep(3);
  }, [rawRows, headers, mapping, colConfigs, millId, tableName, saveMappingsMutation]);

  const handleCellEdit = useCallback(
    (rowIdx: number, fieldKey: string, value: any) => {
      setPreviewRecords((prev) => {
        const updated = [...prev];
        const row = { ...updated[rowIdx] };
        row.data = { ...row.data, [fieldKey]: value };

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

  const validateRecord = useCallback(
    (record: Record<string, any>): { errors: string[]; warnings: string[] } => {
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const c of colConfigs) {
        if (c.isRequired) {
          const val = record[c.key];
          if (val === undefined || val === null || val === "") {
            errors.push(`${c.label} is required`);
          }
        }
      }
      return { errors, warnings };
    },
    [colConfigs],
  );

  const FIELD_MAP: Record<string, Record<string, string>> = {
    hr_employees: {
      name: "full_name",
      employee_id: "employee_code",
      joining_date: "date_of_joining",
    },
    stores_spares: {
      code: "item_code",
      stock: "current_stock",
      min_stock: "reorder_level",
    },
  };

  const TABLE_KEY_FIELDS: Record<string, string[]> = {
    hr_employees: ["name", "employee_id", "sl_no"],
  };

  const handleImport = useCallback(async () => {
    const keyFields = TABLE_KEY_FIELDS[tableName];
    const nonBlank = filterBlankRows(
      previewRecords.map((r) => r.data),
      keyFields,
    );

    const fieldMap = FIELD_MAP[tableName] ?? {};
    const validRecords = nonBlank.map((rec) => {
      const mapped: Record<string, any> = {};
      for (const [key, value] of Object.entries(rec)) {
        mapped[fieldMap[key] ?? key] = value;
      }
      return mapped;
    });
    if (validRecords.length === 0) {
      toast.error("No valid records to import");
      return;
    }

    setStep(4);
    setIsImporting(true);
    setImportProgress({ current: 0, total: validRecords.length });

    const BATCH_SIZE = 50;
    let successCount = 0;
    const errors: ImportError[] = [];

    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      try {
        await api.post(endpoint, { items: batch, mill_id: millId });
        successCount += batch.length;
      } catch (err: any) {
        const msg = err?.response?.data?.detail ?? err?.message ?? "Import failed";
        errors.push({ row: i + 1, message: msg });
      }
      setImportProgress({ current: Math.min(i + BATCH_SIZE, validRecords.length), total: validRecords.length });
    }

    setIsImporting(false);
    setImportResult({
      success: successCount,
      skipped: validRecords.length - successCount,
      errors,
    });
    setStep(5);
    onSuccess?.(successCount);
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
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleBrowse}
        />
        <Upload className="size-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-base font-medium">Drop your Excel file here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Supports .xlsx and .xls files</p>
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
            {headers.map((header) => (
              <TableRow key={header}>
                <TableCell className="font-medium">{header}</TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>
                  {mapping[header] ? getConfidenceBadge(confidence[header] ?? 0) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={mapping[header] === null}
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
            ))}
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
    const mappedFields = Object.values(mapping).filter(Boolean) as string[];

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
                  <TableHead key={fk}>{colMap[fk]?.label ?? fk}</TableHead>
                ))}
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRecords.map((record, ri) => (
                <TableRow key={ri} className={getRowVariant(record)}>
                  <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                  {mappedFields.map((fk) => (
                    <TableCell key={fk}>
                      <Input
                        className={cn(
                          "h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-offset-0",
                          record.errors.some((e) => e.includes(colMap[fk]?.label ?? "")) && "text-red-600",
                        )}
                        value={String(record.data[fk] ?? "")}
                        onChange={(e) => handleCellEdit(ri, fk, e.target.value)}
                      />
                    </TableCell>
                  ))}
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
    const hasErrors = importResult && importResult.errors.length > 0;
    const [showErrors, setShowErrors] = useState(false);

    return (
      <div className="py-8 space-y-6 text-center">
        {hasErrors ? (
          <>
            <div className="mx-auto size-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="size-8 text-yellow-600" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium">Import completed with issues</p>
              <p className="text-sm text-muted-foreground">
                {importResult!.success} records imported
                {importResult!.skipped > 0 && (
                  <span className="text-red-500">, {importResult!.skipped} failed</span>
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="size-8 text-green-600" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium">Import complete!</p>
              <p className="text-sm text-muted-foreground">
                {importResult?.success ?? 0} records imported successfully
              </p>
            </div>
          </>
        )}

        {hasErrors && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowErrors(!showErrors)}
            >
              {showErrors ? "Hide" : "View"} Error Details
            </Button>
            {showErrors && importResult && (
              <div className="mt-3 max-h-40 overflow-y-auto text-left border rounded-lg p-3">
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 py-0.5">
                    Row {e.row}: {e.message}
                  </p>
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
