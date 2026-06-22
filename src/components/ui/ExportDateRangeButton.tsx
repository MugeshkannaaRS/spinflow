/**
 * ExportDateRangeButton — Universal export popup with date range, shift filter, and format picker.
 *
 * - Date range defaults to today → today (override with defaultFrom/defaultTo)
 * - Optional shift filter — pass shifts={[{id, name}]} to show the dropdown
 * - Formats: CSV (if onExportCsv), Excel (always), PDF (if onExportPdf)
 * - Convention: ArrowUp = export, ArrowDown = import
 *
 * Usage:
 *   <ExportDateRangeButton
 *     onExportXlsx={(f, t, shift) => exportApi.qualityXlsx(f, t, shift)}
 *     onExportCsv={(f, t, shift) => exportApi.qualityCsv(f, t, shift)}
 *     shifts={shifts}   // optional
 *   />
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
import { toast } from "sonner";

type DateRangeFormat = "csv" | "xlsx" | "pdf";

export interface ShiftOption {
  id: string;
  name: string;
  code?: string;
}

interface ExportDateRangeButtonProps {
  /** Excel export — always required. Receives (dateFrom, dateTo, shiftId?) */
  onExportXlsx: (dateFrom: string, dateTo: string, shiftId?: string) => Promise<void>;
  /** Optional CSV export */
  onExportCsv?: (dateFrom: string, dateTo: string, shiftId?: string) => Promise<void>;
  /** Optional PDF export */
  onExportPdf?: (dateFrom: string, dateTo: string, shiftId?: string) => Promise<void>;
  /** Optional shift list — if provided, a shift filter appears */
  shifts?: ShiftOption[];
  /** Default start date (ISO string). Defaults to today. */
  defaultFrom?: string;
  /** Default end date (ISO string). Defaults to today. */
  defaultTo?: string;
  /** Button label */
  label?: string;
  /** Extra className */
  className?: string;
}

export function ExportDateRangeButton({
  onExportXlsx,
  onExportCsv,
  onExportPdf,
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
  const [shiftId, setShiftId] = useState<string>("all");
  const [format, setFormat] = useState<DateRangeFormat>("xlsx");
  const [loading, setLoading] = useState(false);

  // Reset dates to today when dialog opens
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
      if (format === "csv" && onExportCsv) {
        await onExportCsv(dateFrom, dateTo, effectiveShift);
      } else if (format === "pdf" && onExportPdf) {
        await onExportPdf(dateFrom, dateTo, effectiveShift);
      } else {
        await onExportXlsx(dateFrom, dateTo, effectiveShift);
      }
      setOpen(false);
      toast.success("Export started");
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Export failed";
      toast.error(typeof detail === "string" ? detail : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  type FormatOption = { id: DateRangeFormat; label: string; icon: React.ReactNode; available: boolean };
  const formats: FormatOption[] = ([
    { id: "csv" as DateRangeFormat,  label: "CSV",   icon: <FileText className="size-4 text-blue-500" />,        available: !!onExportCsv },
    { id: "xlsx" as DateRangeFormat, label: "Excel", icon: <FileSpreadsheet className="size-4 text-green-600" />, available: true },
    { id: "pdf" as DateRangeFormat,  label: "PDF",   icon: <FileText className="size-4 text-red-500" />,          available: !!onExportPdf },
  ] as FormatOption[]).filter((f) => f.available);

  const hasShifts = shifts && shifts.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={["h-8 gap-1.5 text-xs", className].filter(Boolean).join(" ")}>
          <ArrowUp className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from" className="text-xs font-medium">From</Label>
              <Input
                id="exp-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to" className="text-xs font-medium">To</Label>
              <Input
                id="exp-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Shift filter — only when shifts are provided */}
          {hasShifts && (
            <div className="space-y-1.5">
              <Label htmlFor="exp-shift" className="text-xs font-medium">Shift</Label>
              <div className="relative">
                <select
                  id="exp-shift"
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  className="flex h-8 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All Shifts</option>
                  {shifts!.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.code ? ` (${s.code})` : ""}
                    </option>
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
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm transition-colors ${
                    format === f.id
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {f.icon}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1" />
                Exporting…
              </>
            ) : (
              <>
                <ArrowUp className="size-3.5 mr-1" />
                Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
