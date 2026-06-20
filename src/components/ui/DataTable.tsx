import { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X,
  Settings2,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useColumnConfig } from "@/hooks/useColumnConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColType = "text" | "number" | "date" | "status" | "boolean";

export interface ColDef<T = any> {
  key: string;
  label: string;
  type?: ColType;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  defaultHidden?: boolean;
  className?: string;
}

type SortDir = "asc" | "desc";

interface SortState {
  key: string;
  dir: SortDir;
}

interface DataTableProps<T = any> {
  tableName?: string;
  tableId?: string;
  columns?: ColDef<T>[];
  data: T[];
  total?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  sortColumn?: string;
  sortDirection?: SortDir;
  onSortChange?: (column: string, direction: SortDir) => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  actions?: (row: T) => React.ReactNode;
  loading?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  exportFilename?: string;
  disableExport?: boolean;
  rowKey?: (row: T) => string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, key: string): string {
  const v = (row as any)[key];
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function sortRows<T>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = getCellValue(a, sort.key).toLowerCase();
    const bv = getCellValue(b, sort.key).toLowerCase();
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

function matchesSearch<T>(row: T, keys: string[], query: string): boolean {
  const q = query.toLowerCase();
  return keys.some((k) => getCellValue(row, k).toLowerCase().includes(q));
}

const STORAGE_KEY = (tid: string) => `dt_hidden_${tid}`;

// ─── Export ───────────────────────────────────────────────────────────────────

function exportToExcel<T>(rows: T[], columns: ColDef<T>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((row) => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        obj[col.label] = getCellValue(row, col.key);
      }
      return obj;
    }),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportToCSV<T>(rows: T[], columns: ColDef<T>[], filename: string) {
  const lines = [columns.map((c) => `"${c.label}"`).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => `"${getCellValue(row, c.key).replace(/"/g, '""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToPDF<T>(rows: T[], columns: ColDef<T>[], title: string) {
  const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(10);
  doc.text(title, 14, 10);
  const headers = columns.map((c) => c.label);
  const data = rows.map((row) => columns.map((col) => getCellValue(row, col.key)));
  autoTable.default(doc, {
    head: [headers],
    body: data,
    startY: 14,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [15, 25, 35] },
  });
  doc.save(`${title}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div
            className="h-4 bg-muted rounded animate-pulse"
            style={{ width: `${40 + Math.random() * 40}%` }}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTable<T = any>({
  tableName,
  tableId,
  columns: columnsProp,
  data,
  total: totalProp,
  isLoading,
  isError,
  onRetry,
  page: pageProp,
  pageSize: pageSizeProp,
  onPageChange,
  onPageSizeChange,
  searchValue,
  onSearchChange,
  sortColumn,
  sortDirection,
  onSortChange,
  onRowClick,
  rowActions,
  // Backward compat aliases
  loading: loadingProp,
  actions: actionsProp,
  toolbar,
  emptyMessage = "No records found.",
  exportFilename,
  disableExport = false,
  rowKey: rowKeyProp,
}: DataTableProps<T>) {
  const loading = isLoading ?? loadingProp;
  const actionNodes = rowActions ?? actionsProp;
  const isServer = pageProp !== undefined;
  const safeData = Array.isArray(data) ? data : [];

  // Column config
  const colConfig = useColumnConfig(tableName ?? "");

  // Merge columns from props or column config
  const allColumns: ColDef<T>[] = useMemo(() => {
    if (columnsProp) return columnsProp;
    if (colConfig.columns.length > 0) {
      return colConfig.columns
        .filter((c) => c.isVisible)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type as ColType,
        }));
    }
    return [];
  }, [columnsProp, colConfig.columns]);

  const effectiveKey = tableId ?? tableName ?? "table";

  // ── Column visibility ────────────────────────────────────────────────────
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY(effectiveKey));
      if (stored) return new Set(JSON.parse(stored));
    } catch {
      /* localStorage unavailable */
    }
    return new Set(allColumns.filter((c) => c.defaultHidden).map((c) => c.key));
  });

  const saveHidden = (next: Set<string>) => {
    setHiddenKeys(next);
    try {
      localStorage.setItem(STORAGE_KEY(effectiveKey), JSON.stringify([...next]));
    } catch {
      /* localStorage unavailable */
    }
  };

  const visibleCols = useMemo(
    () => allColumns.filter((c) => !hiddenKeys.has(c.key)),
    [allColumns, hiddenKeys],
  );

  // ── Client-side sort ─────────────────────────────────────────────────────
  const [clientSort, setClientSort] = useState<SortState | null>(null);

  const handleHeaderClick = (colKey: string) => {
    if (isServer && onSortChange) {
      const nextDir: SortDir = sortColumn === colKey && sortDirection === "asc" ? "desc" : "asc";
      onSortChange(colKey, nextDir);
    } else {
      setClientSort((prev) => {
        const nextDir: SortDir = prev?.key === colKey && prev.dir === "asc" ? "desc" : "asc";
        return { key: colKey, dir: nextDir };
      });
    }
  };

  const activeSort = isServer
    ? sortColumn
      ? ({ key: sortColumn, dir: sortDirection ?? ("asc" as SortDir) } as SortState)
      : null
    : clientSort;

  // ── Client-side search ───────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState("");
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (val: string) => {
    if (isServer && onSearchChange) {
      if (searchTimer) clearTimeout(searchTimer);
      const timer = setTimeout(() => onSearchChange(val), 300);
      setSearchTimer(timer);
    } else {
      setClientSearch(val);
    }
  };

  // ── Client-side pagination ───────────────────────────────────────────────
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(20);

  const searchableKeys = useMemo(
    () => allColumns.filter((c) => c.type !== "boolean").map((c) => c.key),
    [allColumns],
  );

  // ── Filtered + sorted rows (client-side) ─────────────────────────────────
  const processed = useMemo(() => {
    if (isServer) return safeData;
    const q = clientSearch || searchValue || "";
    let rows = safeData;
    if (q) rows = rows.filter((r) => matchesSearch(r, searchableKeys, q));
    return sortRows(rows, activeSort);
  }, [safeData, clientSearch, searchValue, activeSort, searchableKeys, isServer]);

  const currentPage = isServer ? (pageProp ?? 1) : clientPage;
  const currentPageSize = isServer ? (pageSizeProp ?? 20) : clientPageSize;
  const total = isServer ? (totalProp ?? safeData.length) : processed.length;
  const totalPages = Math.max(1, Math.ceil(total / currentPageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = isServer
    ? data
    : processed.slice((safePage - 1) * currentPageSize, safePage * currentPageSize);
  const startIdx = total === 0 ? 0 : (safePage - 1) * currentPageSize + 1;
  const endIdx = Math.min(safePage * currentPageSize, total);

  const rowKeyFn = rowKeyProp ?? ((r: any) => r.id ?? JSON.stringify(r));

  // ── Export ───────────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);

  const handleExport = async (format: "excel" | "csv" | "pdf") => {
    const fn = exportFilename ?? effectiveKey;
    if (format === "excel") exportToExcel(processed, visibleCols, fn);
    else if (format === "csv") exportToCSV(processed, visibleCols, fn);
    else await exportToPDF(processed, visibleCols, fn);
    setExportOpen(false);
  };

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  }, [searchTimer]);

  const hasActions = !!actionNodes || !!onRowClick;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar row */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={isServer ? (searchValue ?? "") : clientSearch}
              onChange={(e) => {
                const val = e.target.value;
                if (isServer) {
                  handleSearchChange(val);
                } else {
                  setClientSearch(val);
                  setClientPage(1);
                }
              }}
              className="h-8 pl-8 pr-7 w-52 text-xs"
            />
            {(isServer ? searchValue : clientSearch) && (
              <button
                type="button"
                onClick={() => {
                  if (isServer) {
                    onSearchChange?.("");
                  } else {
                    setClientSearch("");
                    setClientPage(1);
                  }
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {toolbar}

          {/* Export */}
          {!disableExport && (
            <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <ArrowUpFromLine className="size-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={false}
                  onCheckedChange={() => handleExport("excel")}
                  className="text-xs cursor-pointer"
                >
                  <FileSpreadsheet className="size-3.5 mr-2" />
                  Export Excel
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={false}
                  onCheckedChange={() => handleExport("csv")}
                  className="text-xs cursor-pointer"
                >
                  <FileDown className="size-3.5 mr-2" />
                  Export CSV
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={false}
                  onCheckedChange={() => handleExport("pdf")}
                  className="text-xs cursor-pointer"
                >
                  <FileDown className="size-3.5 mr-2" />
                  Export PDF
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={!hiddenKeys.has(col.key)}
                  onCheckedChange={(checked) => {
                    const next = new Set(hiddenKeys);
                    if (checked) next.delete(col.key);
                    else next.add(col.key);
                    saveHidden(next);
                  }}
                  className="text-xs"
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center space-y-2">
          <p className="text-sm text-destructive font-medium">Failed to load data.</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {!isError && (
        <div className="w-full overflow-x-auto rounded-md border">
          <Table className="min-w-max w-full">
            <TableHeader>
              <TableRow className="bg-muted/30">
                {visibleCols.map((col) => {
                  const sort = activeSort;
                  const isActive = sort?.key === col.key;
                  const sortable = col.sortable !== false;
                  return (
                    <TableHead
                      key={col.key}
                      className={cn(
                        "whitespace-nowrap text-xs font-semibold select-none",
                        sortable && "cursor-pointer hover:bg-muted/50",
                        col.className,
                      )}
                      onClick={sortable ? () => handleHeaderClick(col.key) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortable && (
                          <span className="text-muted-foreground">
                            {isActive && sort.dir === "asc" ? (
                              <ArrowUp className="size-3 text-primary" />
                            ) : isActive && sort.dir === "desc" ? (
                              <ArrowDown className="size-3 text-primary" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-30" />
                            )}
                          </span>
                        )}
                      </span>
                    </TableHead>
                  );
                })}
                {hasActions && (
                  <TableHead className="text-xs font-semibold w-24">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} cols={visibleCols.length + (hasActions ? 1 : 0)} />
                  ))}
                </>
              )}
              {!loading && pageRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={visibleCols.length + (hasActions ? 1 : 0)}
                    className="text-center py-12 text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                pageRows.map((row: T, idx: number) => (
                  <TableRow
                    key={rowKeyFn(row) ?? idx}
                    className={cn("hover:bg-muted/30", onRowClick && "cursor-pointer")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {visibleCols.map((col) => {
                      const cellContent = col.render
                        ? col.render(row)
                        : getCellValue(row, col.key) || "—";
                      return (
                        <TableCell
                          key={col.key}
                          className={cn(
                            "text-sm py-2 max-w-[300px] truncate",
                            col.type === "number" && "text-right font-mono tabular-nums",
                            col.type === "date" && "text-muted-foreground",
                            col.className,
                          )}
                        >
                          {cellContent}
                        </TableCell>
                      );
                    })}
                    {actionNodes && (
                      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                        {actionNodes(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap gap-3 items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <Select
            value={String(currentPageSize)}
            onValueChange={(v) => {
              const size = Number(v);
              if (isServer) onPageSizeChange?.(size);
              else {
                setClientPageSize(size);
                setClientPage(1);
              }
            }}
          >
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span>
          {total === 0 ? "No records" : `Showing ${startIdx}–${endIdx} of ${total} records`}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage <= 1}
            onClick={() => {
              if (isServer) onPageChange?.(1);
              else setClientPage(1);
            }}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage <= 1}
            onClick={() => {
              if (isServer) onPageChange?.(safePage - 1);
              else setClientPage((p) => Math.max(1, p - 1));
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 min-w-[60px] text-center">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage >= totalPages}
            onClick={() => {
              if (isServer) onPageChange?.(safePage + 1);
              else setClientPage((p) => Math.min(totalPages, p + 1));
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage >= totalPages}
            onClick={() => {
              if (isServer) onPageChange?.(totalPages);
              else setClientPage(totalPages);
            }}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
