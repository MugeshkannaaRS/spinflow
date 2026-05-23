import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUpDown, X } from "lucide-react";

interface ColumnDef {
  key: string;
  label: string;
  placeholder?: string;
}

interface ExcelColumnFilterProps<T = any> {
  data: T[];
  onFilter: (filtered: T[]) => void;
  columns: ColumnDef[];
  getValue?: (item: T, key: string) => string;
}

export function ExcelColumnFilter<T = any>({
  data,
  onFilter,
  columns,
  getValue,
}: ExcelColumnFilterProps<T>) {
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  const resolveValue = (item: T, key: string): string => {
    if (getValue) return getValue(item, key);
    const v = (item as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  };

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      const vals = new Set<string>();
      for (const item of data) {
        const v = resolveValue(item, col.key);
        if (v) vals.add(v);
      }
      map[col.key] = [...vals].sort();
    }
    return map;
  }, [data, columns]);

  const activeCount = useMemo(
    () => Object.values(filters).reduce((sum, s) => sum + s.size, 0),
    [filters],
  );

  const updateFilters = (next: Record<string, Set<string>>) => {
    setFilters(next);
    const hasActive = Object.values(next).some((s) => s.size > 0);
    if (!hasActive) {
      onFilter(data);
      return;
    }
    const filtered = data.filter((item) =>
      Object.entries(next).every(([key, selected]) => {
        if (selected.size === 0) return true;
        const val = resolveValue(item, key);
        return selected.has(val);
      }),
    );
    onFilter(filtered);
  };

  const toggleValue = (colKey: string, value: string) => {
    const next = { ...filters };
    const set = next[colKey] ? new Set(next[colKey]) : new Set<string>();
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size === 0) delete next[colKey];
    else next[colKey] = set;
    updateFilters(next);
  };

  const setAll = (colKey: string, vals: string[]) => {
    const next = { ...filters, [colKey]: new Set(vals) };
    updateFilters(next);
  };

  const clearCol = (colKey: string) => {
    const next = { ...filters };
    delete next[colKey];
    updateFilters(next);
  };

  const clearAll = () => {
    setFilters({});
    onFilter(data);
  };

  return (
    <div className="flex flex-wrap gap-1.5 mb-3 items-center">
      {columns.map((col) => (
        <Popover key={col.key}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1 ${filters[col.key] ? "border-primary text-primary" : ""}`}
            >
              <ArrowUpDown className="size-3" />
              {col.label}
              {filters[col.key] && (
                <span className="ml-0.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                  {filters[col.key].size}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ColumnFilterDropdown
              column={col}
              values={uniqueValues[col.key] ?? []}
              selected={filters[col.key] ?? new Set()}
              onToggle={(v) => toggleValue(col.key, v)}
              onSelectAll={() => setAll(col.key, uniqueValues[col.key] ?? [])}
              onClear={() => clearCol(col.key)}
            />
          </PopoverContent>
        </Popover>
      ))}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
        >
          Clear all ({activeCount})
        </button>
      )}
    </div>
  );
}

function ColumnFilterDropdown({
  column,
  values,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  column: ColumnDef;
  values: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(
    () => values.filter((v) => v.toLowerCase().includes(search.toLowerCase())),
    [values, search],
  );

  const allVisibleSelected = filtered.length > 0 && filtered.every((v) => selected.has(v));
  const noneSelected = selected.size === 0;

  return (
    <div className="space-y-1">
      <div className="font-medium text-xs mb-1">{column.label}</div>
      <Input
        ref={inputRef}
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-7 text-xs"
      />
      <div className="flex gap-2 text-xs pt-1">
        <button
          type="button"
          onClick={() => {
            if (allVisibleSelected) filtered.forEach((v) => onToggle(v));
            else onSelectAll();
          }}
          className="text-muted-foreground hover:text-foreground underline"
        >
          {allVisibleSelected ? "Deselect all" : "Select all"}
        </button>
        {!noneSelected && (
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
      </div>
      <ScrollArea className="max-h-48">
        <div className="space-y-1 pt-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No values</p>
          )}
          {filtered.map((val) => (
            <label
              key={val}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <Checkbox checked={selected.has(val)} onCheckedChange={() => onToggle(val)} />
              <span className="truncate">{val}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
