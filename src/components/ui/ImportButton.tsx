import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Download, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";
import * as XLSXOut from "xlsx";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ImportColDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "date";
  // candidate header names for auto-detect
  candidates?: string[];
}

interface ImportButtonProps {
  label?: string;
  templateCols: ImportColDef[];
  endpoint: string;
  onSuccess?: () => void;
  exampleRow?: Record<string, string>;
  disabled?: boolean;
}

// ─── Column mapping helpers ────────────────────────────────────────────────

function detectColIndex(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => (h ?? "").toLowerCase().trim());
  for (const cand of candidates) {
    const idx = lower.findIndex(
      (h) => h === cand.toLowerCase() || h.includes(cand.toLowerCase()),
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function buildDefaultCandidates(col: ImportColDef): string[] {
  if (col.candidates?.length) return col.candidates;
  return [col.key, col.label.toLowerCase()];
}

// ─── Main component ───────────────────────────────────────────────────────

export function ImportButton({
  label = "Import Excel",
  templateCols,
  endpoint,
  onSuccess,
  exampleRow,
  disabled,
}: ImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"mapping" | "preview" | "importing">("mapping");

  // raw rows from file (index 0 = headers if detected)
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // mapping: fieldKey → column index (-1 = unmapped)
  const [mapping, setMapping] = useState<Record<string, number>>({});

  // parsed preview rows with errors
  interface PreviewRow {
    cells: Record<string, string>;
    errors: string[];
    edited: Set<string>;
  }
  const [preview, setPreview] = useState<PreviewRow[]>([]);

  // import progress
  const [progress, setProgress] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, failed: 0, errors: [] as string[] });

  // ── File pick ───────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ab = e.target?.result as ArrayBuffer;
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!aoa.length) {
        toast.error("Empty file");
        return;
      }
      const hdrs = aoa[0].map((v: any) => String(v ?? "").trim());
      const rows = aoa.slice(1).filter((r) => r.some((c: any) => c !== "")).map((r) =>
        r.map((c: any) => String(c ?? "").trim()),
      );
      setHeaders(hdrs);
      setRawRows(rows);

      // auto-detect mapping
      const auto: Record<string, number> = {};
      for (const col of templateCols) {
        auto[col.key] = detectColIndex(hdrs, buildDefaultCandidates(col));
      }
      setMapping(auto);
      setStep("mapping");
      setOpen(true);
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Apply mapping → build preview ──────────────────────────────────────
  const applyMapping = () => {
    const rows: PreviewRow[] = rawRows.map((raw) => {
      const cells: Record<string, string> = {};
      for (const col of templateCols) {
        const idx = mapping[col.key] ?? -1;
        cells[col.key] = idx >= 0 ? (raw[idx] ?? "") : "";
      }
      const errors: string[] = [];
      for (const col of templateCols) {
        if (col.required && !cells[col.key]) {
          errors.push(`${col.label} is required`);
        }
      }
      return { cells, errors, edited: new Set() };
    });
    setPreview(rows);
    setStep("preview");
  };

  // ── Edit preview cell ──────────────────────────────────────────────────
  const editCell = (rowIdx: number, key: string, val: string) => {
    setPreview((prev) => {
      const next = prev.map((r, i) => (i === rowIdx ? { ...r } : r));
      next[rowIdx].cells = { ...next[rowIdx].cells, [key]: val };
      next[rowIdx].edited = new Set([...next[rowIdx].edited, key]);
      // re-validate
      const errors: string[] = [];
      for (const col of templateCols) {
        if (col.required && !next[rowIdx].cells[col.key]) {
          errors.push(`${col.label} is required`);
        }
      }
      next[rowIdx].errors = errors;
      return next;
    });
  };

  const validRows = preview.filter((r) => r.errors.length === 0);
  const invalidRows = preview.filter((r) => r.errors.length > 0);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleImport = async () => {
    setStep("importing");
    setProgress(0);
    setImportDone(false);

    const body = validRows.map((r) => r.cells);
    try {
      setProgress(30);
      const res = await api.post(endpoint, { items: body });
      setProgress(100);
      const data = res.data;
      const success = data.created ?? data.success ?? body.length;
      const failed = data.failed ?? (data.errors?.length ?? 0);
      const errors: string[] = data.errors ?? [];
      setImportResult({ success, failed, errors });
      setImportDone(true);
      if (success > 0) {
        toast.success(`Imported ${success} records successfully`);
        onSuccess?.();
      }
    } catch (err: any) {
      setProgress(0);
      toast.error(err?.response?.data?.detail ?? "Import failed");
      setStep("preview");
    }
  };

  const reset = () => {
    setOpen(false);
    setStep("mapping");
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setPreview([]);
    setProgress(0);
    setImportDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Template download ──────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headerRow = templateCols.map((c) => c.label);
    const exRow = exampleRow
      ? templateCols.map((c) => exampleRow[c.key] ?? "")
      : templateCols.map((c) =>
          c.type === "number" ? "0" : c.type === "date" ? "01/01/2025" : `Example ${c.label}`,
        );
    const ws = XLSX.utils.aoa_to_sheet([headerRow, exRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `template_${endpoint.replace(/\//g, "_")}.xlsx`);
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {label}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs gap-1"
          disabled={disabled}
          onClick={downloadTemplate}
          title="Download template"
        >
          <Download className="size-3.5" />
          Template
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !o && reset()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Records</DialogTitle>
            <DialogDescription>
              {step === "mapping" && `${rawRows.length} rows detected. Verify column mapping.`}
              {step === "preview" && `${validRows.length} valid · ${invalidRows.length} errors. Click cells to fix.`}
              {step === "importing" && "Importing…"}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Column mapping */}
          {step === "mapping" && (
            <div className="space-y-4">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium">Field</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Required</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Detected Column</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {templateCols.map((col) => {
                      const idx = mapping[col.key] ?? -1;
                      const detected = idx >= 0 ? `Col ${idx + 1}: "${headers[idx]}"` : null;
                      return (
                        <tr key={col.key}>
                          <td className="px-3 py-2 font-medium text-xs">{col.label}</td>
                          <td className="px-3 py-2">
                            {col.required ? (
                              <Badge variant="destructive" className="text-[10px] h-4">Required</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] h-4">Optional</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={idx >= 0 ? String(idx) : "__none__"}
                              onValueChange={(v) =>
                                setMapping((prev) => ({
                                  ...prev,
                                  [col.key]: v === "__none__" ? -1 : Number(v),
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-52">
                                <SelectValue placeholder="Not mapped" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__" className="text-xs text-muted-foreground">
                                  — Not mapped —
                                </SelectItem>
                                {headers.map((h, i) => (
                                  <SelectItem key={i} value={String(i)} className="text-xs">
                                    Col {i + 1}: {h}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
                <Button size="sm" onClick={applyMapping}>
                  Apply Mapping →
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="size-4" /> {validRows.length} valid
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="size-4" /> {invalidRows.length} errors
                </span>
              </div>

              <div className="overflow-x-auto rounded-md border max-h-[45vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                      {templateCols.map((col) => (
                        <th key={col.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                          {col.label}
                          {col.required && <span className="text-destructive ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((row, ri) => (
                      <tr
                        key={ri}
                        className={row.errors.length > 0 ? "bg-destructive/5" : "bg-green-50/50 dark:bg-green-950/10"}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{ri + 1}</td>
                        {templateCols.map((col) => {
                          const isErr = row.errors.some((e) => e.includes(col.label));
                          const isEdited = row.edited.has(col.key);
                          return (
                            <td key={col.key} className="px-1 py-0.5">
                              <Input
                                value={row.cells[col.key] ?? ""}
                                onChange={(e) => editCell(ri, col.key, e.target.value)}
                                className={`h-6 text-xs px-1.5 min-w-[80px] ${
                                  isErr
                                    ? "border-destructive bg-destructive/5"
                                    : isEdited
                                      ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/10"
                                      : ""
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1">
                          {row.errors.length > 0 ? (
                            <span className="text-destructive text-[10px]">{row.errors.join("; ")}</span>
                          ) : (
                            <CheckCircle2 className="size-3 text-green-600" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setStep("mapping")}>← Back</Button>
                <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={validRows.length === 0}
                  onClick={handleImport}
                >
                  Import {validRows.length} Records
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="space-y-4 py-4">
              {!importDone && (
                <>
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-center text-muted-foreground">
                    Importing {validRows.length} records…
                  </p>
                </>
              )}
              {importDone && (
                <div className="space-y-3">
                  <div className="flex justify-center gap-6 text-sm">
                    <span className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="size-5" />
                      <strong>{importResult.success}</strong> imported
                    </span>
                    {importResult.failed > 0 && (
                      <span className="flex items-center gap-2 text-destructive">
                        <X className="size-5" />
                        <strong>{importResult.failed}</strong> failed
                      </span>
                    )}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto space-y-1">
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-destructive">{e}</p>
                      ))}
                    </div>
                  )}
                  <DialogFooter>
                    <Button size="sm" onClick={reset}>Done</Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
