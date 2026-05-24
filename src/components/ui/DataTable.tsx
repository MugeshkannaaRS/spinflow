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
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type SortDir = "asc" | "desc" | null;

interface SortState {
  key: string;
  dir: SortDir;
}

interface DataTableProps<T = any> {
  tableId: string;
  columns: ColDef<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (row: T) => string;
  actions?: (row: T) => React.ReactNode;
  exportFilename?: string;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  defaultPageSize?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, key: string): string {
  const v = (row as any)[key];
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function sortRows<T>(rows: T[], sorts: SortState[]): T[] {
  if (!sorts.length) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      if (!s.dir) continue;
      const av = getCellValue(a, s.key).toLowerCase();
      const bv = getCellValue(b, s.key).toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

function matchesGlobal<T>(row: T, keys: string[], query: string): boolean {
  const q = query.toLowerCase();
  return keys.some((k) => getCellValue(row, k).toLowerCase().includes(q));
}

function matchesColumnFilters<T>(
  row: T,
  colFilters: Record<string, Set<string>>,
): boolean {
  return Object.entries(colFilters).every(([key, selected]) => {
    if (!selected.size) return true;
    return selected.has(getCellValue(row, key));
  });
}

const STORAGE_KEY = (tableId: string) => `dt_hidden_${tableId}`;

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTable<T = any>({
  tableId,
  columns,
  data,
  loading,
  rowKey,
  actions,
  exportFilename,
  toolbar,
  emptyMessage = "No records found.",
  defaultPageSize = 20,
}: DataTableProps<T>) {
  // ── Column visibility ──────────────────────────────────────────────────────
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY(tableId));
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key));
  });

  const saveHidden = (next: Set<string>) => {
    setHiddenKeys(next);
    try {
      localStorage.setItem(STORAGE_KEY(tableId), JSON.stringify([...next]));
    } catch {}
  };

  const visibleCols = useMemo(
    () => columns.filter((c) => !hiddenKeys.has(c.key)),
    [columns, hiddenKeys],
  );

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sorts, setSorts] = useState<SortState[]>([]);

  const handleHeaderClick = useCallback(
    (colKey: string, shift: boolean) => {
      setSorts((prev) => {
        const existing = prev.find((s) => s.key === colKey);
        const nextDir: SortDir =
          existing?.dir === null || !existing
            ? "asc"
            : existing.dir === "asc"
              ? "desc"
              : null;

        if (shift) {
          // multi-sort
          return prev
            .filter((s) => s.key !== colKey)
            .concat(nextDir ? [{ key: colKey, dir: nextDir }] : []);
        }
        return nextDir ? [{ key: colKey, dir: nextDir }] : [];
      });
    },
    [],
  );

  // ── Global search ─────────────────────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");

  // ── Per-column filters ────────────────────────────────────────────────────
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});

  const uniqueVals = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.filterable === false) continue;
      const s = new Set<string>();
      for (const row of data) {
        const v = getCellValue(row, col.key);
        if (v) s.add(v);
      }
      map[col.key] = [...s].sort();
    }
    return map;
  }, [data, columns]);

  const toggleColFilter = (colKey: string, value: string) => {
    setColFilters((prev) => {
      const next = { ...prev };
      const set = next[colKey] ? new Set(next[colKey]) : new Set<string>();
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size === 0) delete next[colKey];
      else next[colKey] = set;
      setPage(1);
      return next;
    });
  };

  const clearColFilter = (colKey: string) => {
    setColFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const clearAllFilters = () => {
    setColFilters({});
    setGlobalSearch("");
    setPage(1);
  };

  const activeFilterCount =
    Object.values(colFilters).reduce((s, v) => s + v.size, 0) +
    (globalSearch ? 1 : 0);

  // ── Filtered + sorted rows ─────────────────────────────────────────────────
  const searchableKeys = useMemo(
    () => columns.filter((c) => c.type !== "boolean").map((c) => c.key),
    [columns],
  );

  const filteredRows = useMemo(() => {
    let rows = data;
    if (globalSearch) {
      rows = rows.filter((r) => matchesGlobal(r, searchableKeys, globalSearch));
    }
    if (Object.keys(colFilters).length) {
      rows = rows.filter((r) => matchesColumnFilters(r, colFilters));
    }
    return sortRows(rows, sorts);
  }, [data, globalSearch, colFilters, sorts, searchableKeys]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    setPage(1);
  }, [globalSearch, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, filteredRows.length);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const exportCols = columns.filter((c) => !hiddenKeys.has(c.key) && !c.render);
    const ws = XLSX.utils.json_to_sheet(
      filteredRows.map((row) => {
        const obj: Record<string, string> = {};
        for (const col of exportCols) {
          obj[col.label] = getCellValue(row, col.key);
        }
        return obj;
      }),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${exportFilename ?? tableId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const sortFor = (key: string) => sorts.find((s) => s.key === key);

  return (
    <div className="space-y-3">
      {/* Toolbar row */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Global search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search all columns…"
              value={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.value); setPage(1); }}
              className="h-8 pl-8 pr-7 w-52 text-xs"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => { setGlobalSearch(""); setPage(1); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Per-column filter chips */}
          {columns.filter((c) => c.filterable !== false && uniqueVals[c.key]?.length).map((col) => (
            <ColumnFilterPill
              key={col.key}
              label={col.label}
              colKey={col.key}
              values={uniqueVals[col.key]}
              selected={colFilters[col.key] ?? new Set()}
              onToggle={toggleColFilter}
              onClear={clearColFilter}
            />
          ))}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="flex gap-2 items-center">
          {/* Extra toolbar (import button, add button etc.) */}
          {toolbar}

          {/* Export */}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExport}>
            <Download className="size-3.5" />
            Export
          </Button>

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
              {columns.map((col) => (
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

      {/* Active filter chips */}
      {Object.entries(colFilters).some(([, v]) => v.size > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(colFilters).flatMap(([key, selected]) =>
            [...selected].map((val) => {
              const col = columns.find((c) => c.key === key);
              return (
                <Badge
                  key={`${key}-${val}`}
                  variant="secondary"
                  className="text-xs gap-1 pl-2 pr-1"
                >
                  {col?.label}: {val}
                  <button
                    type="button"
                    onClick={() => toggleColFilter(key, val)}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            }),
          )}
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-md border">
        <Table className="min-w-max w-full">
          <TableHeader>
            <TableRow className="bg-muted/30">
              {visibleCols.map((col) => {
                const sort = sortFor(col.key);
                const sortable = col.sortable !== false;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap text-xs font-semibold select-none",
                      sortable && "cursor-pointer hover:bg-muted/50",
                      col.className,
                    )}
                    onClick={
                      sortable
                        ? (e) => handleHeaderClick(col.key, e.shiftKey)
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortable && (
                        <span className="text-muted-foreground">
                          {sort?.dir === "asc" ? (
                            <ArrowUp className="size-3 text-primary" />
                          ) : sort?.dir === "desc" ? (
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
              {actions && (
                <TableHead className="text-xs font-semibold w-24">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length + (actions ? 1 : 0)}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length + (actions ? 1 : 0)}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row) => (
                <TableRow key={rowKey(row)} className="hover:bg-muted/30">
                  {visibleCols.map((col) => (
                    <TableCell key={col.key} className={cn("text-sm py-2", col.className)}>
                      {col.render ? col.render(row) : getCellValue(row, col.key) || "—"}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className="py-2">{actions(row)}</TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap gap-3 items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
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
          {filteredRows.length === 0
            ? "No records"
            : `Showing ${startIdx}–${endIdx} of ${filteredRows.length} records`}
          {filteredRows.length !== data.length && ` (filtered from ${data.length})`}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage <= 1}
            onClick={() => setPage(1)}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Per-column filter pill ────────────────────────────────────────────────────

function ColumnFilterPill({
  label,
  colKey,
  values,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  colKey: string;
  values: string[];
  selected: Set<string>;
  onToggle: (key: string, val: string) => void;
  onClear: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = values.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1",
            selected.size > 0 && "border-primary text-primary",
          )}
        >
          <ArrowUpDown className="size-3" />
          {label}
          {selected.size > 0 && (
            <span className="size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
              {selected.size}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-2" align="start">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
          autoFocus
        />
        <div className="flex gap-2 text-[11px] mb-1">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline"
            onClick={() => filtered.forEach((v) => onToggle(colKey, v))}
          >
            Select all
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline"
              onClick={() => onClear(colKey)}
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.map((val) => (
            <label
              key={val}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                className="size-3"
                checked={selected.has(val)}
                onChange={() => onToggle(colKey, val)}
              />
              <span className="truncate">{val}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No values</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
