import type { ColumnConfig } from "@/hooks/useColumnConfig";

function levenshtein(a: string, b: string): number {
  const m = a.length; const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyMatchColumns(
  excelHeaders: string[],
  columnConfigs: ColumnConfig[],
): Map<string, ColumnConfig | null> {
  const result = new Map<string, ColumnConfig | null>();

  for (const header of excelHeaders) {
    const normalizedHeader = normalize(header);
    let bestMatch: ColumnConfig | null = null;
    let bestScore = Infinity;

    for (const col of columnConfigs) {
      const keyScore = levenshtein(normalizedHeader, normalize(col.key.replace(/_/g, " ")));
      const labelScore = levenshtein(normalizedHeader, normalize(col.label));
      const score = Math.min(keyScore, labelScore);
      const threshold = Math.max(3, Math.floor(normalizedHeader.length * 0.4));
      if (score < threshold && score < bestScore) {
        bestScore = score;
        bestMatch = col;
      }
    }
    result.set(header, bestMatch);
  }
  return result;
}

export function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "number" && value > 1000) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    const dmY = /^(\d{2})\/(\d{2})\/(\d{4})$/
    const yMd = /^(\d{4})-(\d{2})-(\d{2})$/
    const dmYMatch = value.match(dmY)
    if (dmYMatch) return `${dmYMatch[3]}-${dmYMatch[2].padStart(2, "0")}-${dmYMatch[1].padStart(2, "0")}`
    if (value.match(yMd)) return value
  }
  return null;
}

export function filterBlankRows(rows: any[], keyFields: string[] = ["name", "employee_id", "sl_no"]): any[] {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return keyFields.some((k) => {
      const val = String(row[k] ?? row[k.toLowerCase()] ?? "").trim();
      return val !== "";
    });
  });
}

export function normalizeShift(value: any): string {
  const map: Record<string, string> = {
    "0": "General",
    "1": "A",
    "2": "B",
    "3": "C",
    a: "A",
    b: "B",
    c: "C",
    general: "General",
    g: "General",
    morning: "A",
    evening: "B",
    night: "C",
    day: "General",
  };
  return map[String(value ?? "").toLowerCase().trim()] ?? "General";
}

export async function generateImportTemplate(
  columns: ColumnConfig[],
  tableName: string,
): Promise<Blob> {
  const XLSX = await import("xlsx");
  const visible = columns
    .filter((c) => c.isVisible && c.isImportable !== false)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const headers = visible.map((c) => c.label);

  const examples = visible.map((c) =>
    c.type === "date"
      ? "2024-01-25"
      : c.type === "number"
        ? "0"
        : c.defaultValue ?? "",
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, examples]);
  ws["!cols"] = visible.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tableName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
