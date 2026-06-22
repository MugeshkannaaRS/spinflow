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
import { ArrowUp, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
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
import { toast } from "sonner";

type ExportFormat = "csv" | "excel" | "pdf";

interface ExportMenuProps {
  columns: ExportColumn[];
  rows: any[];
  filename: string;
  title?: string;
  subtitle?: string;
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
  iconOnly = false,
  className = "",
  disabled = false,
  size = "sm",
}: ExportMenuProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
