/**
 * ExportMenu — universal 3-format export dropdown for any table.
 *
 * Shows: CSV | Excel | PDF
 * Convention: ArrowUp = export (data leaving the system)
 *             ArrowDown = import (data entering the system)
 *
 * Usage:
 *   <ExportMenu
 *     columns={[{ key: "date", label: "Date" }, ...]}
 *     rows={data}
 *     filename="entries-2024-01-15"
 *     title="Production Entries"
 *   />
 */
import { useState } from "react";
import { ArrowUp, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCsv, exportToExcel, exportToPdf, type ExportColumn } from "@/lib/export-utils";
import { LetterheadPreview } from "@/components/ui/LetterheadPreview";
import { toast } from "sonner";

type ExportFormat = "csv" | "excel" | "pdf";

interface ExportMenuProps {
  columns: ExportColumn[];
  rows: any[];
  filename: string;
  title?: string;
  subtitle?: string;
  /** Mill name shown in the letterhead header */
  millName?: string;
  /** Render as icon-only button (default: false) */
  iconOnly?: boolean;
  /** Extra className for the trigger button */
  className?: string;
  disabled?: boolean;
  /** Size of the trigger button (default: "sm") */
  size?: "sm" | "default";
}

export function ExportMenu({
  columns,
  rows,
  filename,
  title,
  subtitle,
  millName,
  iconOnly = false,
  className = "",
  disabled = false,
  size = "sm",
}: ExportMenuProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  // Letterhead preview state — shows all-records preview (user scrolls through)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const handle = async (format: ExportFormat) => {
    if (loading) return;
    setLoading(format);
    try {
      const opts = { columns, rows, filename, title, subtitle };
      if (format === "csv") await exportToCsv(opts);
      else if (format === "excel") await exportToExcel(opts);
      else await exportToPdf(opts);
      const label = format === "csv" ? "CSV" : format === "excel" ? "Excel" : "PDF";
      toast.success(`Exported ${rows.length} row${rows.length !== 1 ? "s" : ""} as ${label}`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(null);
    }
  };

  const heightClass = size === "sm" ? "h-8" : "h-9";

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={[heightClass, "gap-1.5 text-xs", className].filter(Boolean).join(" ")}
          disabled={disabled || rows.length === 0}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
          {!iconOnly && <span>Export</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal py-1">
          {rows.length} row{rows.length !== 1 ? "s" : ""}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => handle("csv")}
          disabled={loading !== null}
        >
          <FileText className="h-3.5 w-3.5 text-blue-500" />
          <span>Export as CSV</span>
          {loading === "csv" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => handle("excel")}
          disabled={loading !== null}
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
          <span>Export as Excel</span>
          {loading === "excel" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => handle("pdf")}
          disabled={loading !== null}
        >
          <FileText className="h-3.5 w-3.5 text-red-500" />
          <span>Export as PDF</span>
          {loading === "pdf" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => { setPreviewIdx(0); setPreviewOpen(true); }}
          disabled={rows.length === 0}
        >
          <Printer className="h-3.5 w-3.5 text-blue-600" />
          <span>Print with Letterhead</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Inline letterhead preview — one record at a time, with prev/next */}
    {previewOpen && rows[previewIdx] && (
      <>
        <LetterheadPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          row={rows[previewIdx]}
          columns={columns}
          title={title ?? filename}
          millName={millName}
          subtitle={subtitle}
        />
        {/* Record navigator — shown above the preview */}
        {rows.length > 1 && (
          <div
            className="sf-no-print fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-white border border-border rounded-lg shadow-lg px-3 py-1.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              disabled={previewIdx === 0}
              onClick={() => setPreviewIdx((i) => i - 1)}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:bg-muted"
            >← Prev</button>
            <span className="text-muted-foreground">{previewIdx + 1} / {rows.length}</span>
            <button
              disabled={previewIdx === rows.length - 1}
              onClick={() => setPreviewIdx((i) => i + 1)}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:bg-muted"
            >Next →</button>
          </div>
        )}
      </>
    )}
    </>
  );
}
