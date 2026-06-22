/**
 * ExportDateRangeButton — Universal export popup.
 *
 * Always shows: Date range (defaults to today) + optional Shift filter + Format (CSV / Excel / PDF)
 *
 * - Excel: downloaded as blob from backend via onExportXlsx
 * - CSV + PDF: generated client-side from onFetchData JSON response
 *   If onFetchData is not provided, CSV/PDF fall back to onExportXlsx (Excel only shown)
 *
 * Convention: ArrowUp = export, ArrowDown = import
 */
import { useState } from "react";
import { ArrowUp, FileText, FileSpreadsheet, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { exportToCsv, exportToPdf, type ExportColumn } from "@/lib/export-utils";
import { toast } from "sonner";

type DateRangeFormat = "csv" | "xlsx" | "pdf";

export interface ShiftOption {
  id: string;
  name: string;
  code?: string;
}

export interface FetchedExportData {
  columns: string[];
  rows: Record<string, any>[];
}

interface ExportDateRangeButtonProps {
  /** Excel blob download from backend. Receives (dateFrom, dateTo, shiftId?) */
  onExportXlsx: (dateFrom: string, dateTo: string, shiftId?: string) => Promise<void>;
  /**
   * Fetch JSON data for CSV/PDF client-side generation.
   * Returns { columns: string[], rows: Record<string,any>[] }
   * If not provided, only Excel is available.
   */
  onFetchData?: (dateFrom: string, dateTo: string, shiftId?: string) => Promise<FetchedExportData>;
  /** Optional page title used in PDF header */
  exportTitle?: string;
  /** Optional shift list — shows shift dropdown when provided */
  shifts?: ShiftOption[];
  /** Default start date override (ISO). Defaults to today. */
  defaultFrom?: string;
  /** Default end date override (ISO). Defaults to today. */
  defaultTo?: string;
  /** Button label */
  label?: string;
  /** Extra className on the trigger button */
  className?: string;
}

export function ExportDateRangeButton({
  onExportXlsx,
  onFetchData,
  exportTitle = "Export",
  shifts,
  defaultFrom,
  defaultTo,
  label = "Export",
  className = "",
}: ExportDateRangeButtonProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultFrom ?? today);
  const [dateTo, setDateTo] = useState(defaultTo ?? today);
  const [shiftId, setShiftId] = useState("all");
  const [format, setFormat] = useState<DateRangeFormat>("xlsx");
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (o) {
      const now = new Date().toISOString().slice(0, 10);
      setDateFrom(defaultFrom ?? now);
      setDateTo(defaultTo ?? now);
      setShiftId("all");
    }
    setOpen(o);
  };

  async function handleExport() {
    setLoading(true);
    const effectiveShift = shiftId === "all" ? undefined : shiftId;
    try {
      if (format === "xlsx") {
        await onExportXlsx(dateFrom, dateTo, effectiveShift);
        toast.success("Excel download started");
      } else if (onFetchData) {
        const { columns, rows } = await onFetchData(dateFrom, dateTo, effectiveShift);
        const exportCols: ExportColumn[] = columns.map((c) => ({ key: c, label: c }));
        const subtitle = `${dateFrom}${dateTo !== dateFrom ? ` → ${dateTo}` : ""}${effectiveShift ? `  Shift: ${effectiveShift}` : ""}`;
        const filename = `${exportTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${dateFrom}`;
        if (format === "csv") {
          await exportToCsv({ filename, columns: exportCols, rows });
          toast.success(`Exported ${rows.length} rows as CSV`);
        } else {
          await exportToPdf({ filename, title: exportTitle, subtitle, columns: exportCols, rows });
          toast.success(`Exported ${rows.length} rows as PDF`);
        }
      }
      setOpen(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? "Export failed";
      toast.error(typeof detail === "string" ? detail : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  const hasShifts = shifts && shifts.length > 0;
  const hasCsvPdf = !!onFetchData;

  type FormatOption = { id: DateRangeFormat; label: string; icon: React.ReactNode };
  const formats: FormatOption[] = [
    ...(hasCsvPdf ? [{ id: "csv" as DateRangeFormat, label: "CSV",   icon: <FileText className="size-4 text-blue-500" /> }] : []),
    { id: "xlsx", label: "Excel", icon: <FileSpreadsheet className="size-4 text-green-600" /> },
    ...(hasCsvPdf ? [{ id: "pdf" as DateRangeFormat, label: "PDF",   icon: <FileText className="size-4 text-red-500" /> }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="outline"
          className={["h-8 gap-1.5 text-xs", className].filter(Boolean).join(" ")}
        >
          <ArrowUp className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Export — {exportTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from" className="text-xs font-medium">From</Label>
              <Input id="exp-from" type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to" className="text-xs font-medium">To</Label>
              <Input id="exp-to" type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Shift filter */}
          {hasShifts && (
            <div className="space-y-1.5">
              <Label htmlFor="exp-shift" className="text-xs font-medium">Shift</Label>
              <div className="relative">
                <select id="exp-shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)}
                  className="flex h-8 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="all">All Shifts</option>
                  {shifts!.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Format selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Format</Label>
            <div className="flex gap-2">
              {formats.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 border rounded-md py-2 text-sm transition-colors ${
                    format === f.id
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}>
                  {f.icon}{f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleExport} disabled={loading}>
            {loading
              ? <><Loader2 className="size-3.5 animate-spin mr-1" />Exporting…</>
              : <><ArrowUp className="size-3.5 mr-1" />Download</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
