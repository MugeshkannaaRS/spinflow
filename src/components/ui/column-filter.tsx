import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface ColumnFilterProps<T> {
  data: T[];
  onFilter: (filtered: T[]) => void;
  columns: { key: keyof T | ((item: T) => string); label: string; placeholder?: string }[];
}

export function ColumnFilter<T extends Record<string, unknown>>({
  data,
  onFilter,
  columns,
}: ColumnFilterProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const getValue = (item: T, key: keyof T | ((item: T) => string)): string => {
    if (typeof key === "function") return key(item);
    const v = item[key];
    return v == null ? "" : String(v);
  };

  const updateFilter = (colKey: string, value: string) => {
    const next = { ...filters, [colKey]: value };
    if (!value) delete next[colKey];
    setFilters(next);

    const active = Object.keys(next).length;
    if (!active) {
      onFilter(data);
      return;
    }

    const filtered = data.filter((item) =>
      Object.entries(next).every(([k, v]) => {
        const col = columns[Number(k)];
        if (!col) return true;
        const cell = getValue(item, col.key).toLowerCase();
        return cell.includes(v.toLowerCase());
      }),
    );
    onFilter(filtered);
  };

  const clearFilter = (colKey: string) => {
    updateFilter(colKey, "");
  };

  const hasFilter = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {columns.map((col, i) => (
        <div key={i} className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            placeholder={col.placeholder ?? `Filter ${col.label}...`}
            value={filters[String(i)] ?? ""}
            onChange={(e) => updateFilter(String(i), e.target.value)}
            className="h-7 pl-7 pr-6 text-xs w-40"
          />
          {filters[String(i)] && (
            <button
              type="button"
              onClick={() => clearFilter(String(i))}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      {hasFilter && (
        <button
          type="button"
          onClick={() => {
            setFilters({});
            onFilter(data);
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
