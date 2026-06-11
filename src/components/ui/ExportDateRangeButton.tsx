/**
 * ExportDateRangeButton — date-range picker dialog that triggers an XLSX download.
 *
 * Usage:
 *   <ExportDateRangeButton
 *     label="Export Quality"
 *     onExport={(from, to) => exportApi.qualityXlsx(from, to)}
 *   />
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
  /** Button label (default: "Export XLSX") */
  label?: string;
  /** Called with (dateFrom, dateTo) — both may be empty strings if user skips.
   *  Should return a Promise that resolves when download starts. */
  onExport: (dateFrom: string, dateTo: string) => Promise<void>;
}

export function ExportDateRangeButton({
  label = "Export XLSX",
  onExport,
}: ExportDateRangeButtonProps) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      await onExport(dateFrom, dateTo);
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
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Download className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Date Range</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Download className="size-3.5 mr-1" />}
            {loading ? "Exporting…" : "Download XLSX"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
