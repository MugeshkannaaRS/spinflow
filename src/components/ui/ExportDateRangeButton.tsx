/**
 * ExportDateRangeButton — single Export button with date-range picker + format choice.
 *
 * Usage:
 *   <ExportDateRangeButton
 *     onExportXlsx={(from, to) => exportApi.qualityXlsx(from, to)}
 *     onExportPdf={(from, to) => exportApi.qualityPdf(from, to)}   // optional
 *   />
 */
import { useState } from "react";
import { Download, FileSpreadsheet, FileDown, Loader2 } from "lucide-react";
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

interface ExportDateRangeButtonProps {
  /** Called with (dateFrom, dateTo) for XLSX download. */
  onExportXlsx: (dateFrom: string, dateTo: string) => Promise<void>;
  /** Optional PDF export — if provided, format selector is shown. */
  onExportPdf?: (dateFrom: string, dateTo: string) => Promise<void>;
}

export function ExportDateRangeButton({
  onExportXlsx,
  onExportPdf,
}: ExportDateRangeButtonProps) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      if (format === "pdf" && onExportPdf) {
        await onExportPdf(dateFrom, dateTo);
      } else {
        await onExportXlsx(dateFrom, dateTo);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Download className="size-3.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="export-from" className="text-xs">From</Label>
              <Input
                id="export-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-to" className="text-xs">To</Label>
              <Input
                id="export-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Format selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("xlsx")}
                className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm transition-colors ${
                  format === "xlsx"
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </button>
              {onExportPdf && (
                <button
                  type="button"
                  onClick={() => setFormat("pdf")}
                  className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm transition-colors ${
                    format === "pdf"
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                >
                  <FileDown className="size-4" />
                  PDF
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={loading}>
            {loading
              ? <><Loader2 className="size-3.5 animate-spin mr-1" />Exporting…</>
              : <><Download className="size-3.5 mr-1" />Download</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
