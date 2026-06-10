/**
 * ExportMenu — a small dropdown button for exporting table data.
 *
 * Shows: Export Excel | Export PDF
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/export-utils";
import { toast } from "sonner";

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
}: ExportMenuProps) {
  const [loading, setLoading] = useState<"excel" | "pdf" | null>(null);

  const handle = async (format: "excel" | "pdf") => {
    if (loading) return;
    setLoading(format);
    try {
      const opts = { columns, rows, filename, title, subtitle };
      if (format === "excel") await exportToExcel(opts);
      else await exportToPdf(opts);
      toast.success(`Exported ${rows.length} rows as ${format === "excel" ? "Excel" : "PDF"}`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={["h-8 gap-1.5 text-xs", className].filter(Boolean).join(" ")}
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
      <DropdownMenuContent align="end" className="w-44">
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
