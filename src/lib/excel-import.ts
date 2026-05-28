import type { ColumnConfig } from "@/hooks/useColumnConfig";

export interface ImportMapping {
  excel_header: string;
  spinflow_field: string | null;
  is_custom_field?: boolean;
  confidence?: number | null;
}

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

export const FIELD_ALIASES: Record<string, string[]> = {
  employee_id: [
    "code","emp id","empid","emp_id","employee id","emp no","emp no.","empno",
    "employee no","staff id","staff no","worker id","emp code",
    "employee code","emp code","id","serial no","sr no","sl no",
  ],
  full_name: ["name","fullname","employee name","staff name","worker name","emp name","person name"],
  date_of_joining: ["doj","date of joining","join date","start date","joining date","joining","date joined"],
  basic: ["basic pay","basic salary","basic wage","base pay","base salary"],
  total_salary: ["gross","gross salary","gross pay","total pay","total wage","total wages","ctc"],
  house_rent: ["hra","house rent allowance","rent allowance"],
  department: ["dept","dept.","department name"],
  food_allowance: ["food allow","food","meal allowance"],
  mobile_bill: ["mobile","phone bill","mobile allowance","mobile allow"],
  shift_benefit: ["shift benifit","shift benefit","shift allow","shift allowance"],
};

export function fuzzyMatchColumns(
  excelHeaders: string[],
  columnConfigs: ColumnConfig[],
  savedMappings: ImportMapping[] = [],
  minConfidence = 60,
): Map<string, ColumnConfig | null> {
  const result = new Map<string, ColumnConfig | null>();

  for (const header of excelHeaders) {
    const normalizedHeader = normalize(header);

    const saved = savedMappings.find(
      (m) => m.excel_header.toLowerCase() === header.toLowerCase() && m.spinflow_field,
    );
    if (saved && saved.spinflow_field) {
      const matchedCol = columnConfigs.find((c) => c.key === saved.spinflow_field);
      if (matchedCol) {
        result.set(header, matchedCol);
        continue;
      }
    }

    let exactAliasMatch: ColumnConfig | null = null;
    for (const [fieldKey, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalize(a) === normalizedHeader)) {
        const col = columnConfigs.find((c) => c.key === fieldKey);
        if (col) {
          exactAliasMatch = col;
          break;
        }
      }
    }
    if (exactAliasMatch) {
      result.set(header, exactAliasMatch);
      continue;
    }

    let bestMatch: ColumnConfig | null = null;
    let bestScore = Infinity;

    for (const col of columnConfigs) {
      const keyScore = levenshtein(normalizedHeader, normalize(col.key.replace(/_/g, " ")));
      const labelScore = levenshtein(normalizedHeader, normalize(col.label));
      const score = Math.min(keyScore, labelScore);
      const threshold = Math.max(3, Math.floor(normalizedHeader.length * (100 - minConfidence) / 100));
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
  millName?: string,
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

  const hints = visible.map((c) => {
    if (c.type === "date") return "Format: YYYY-MM-DD";
    if (c.type === "number") return "Numbers only";
    if (c.isRequired) return "Required";
    return "Optional";
  });

  const keys = visible.map((c) => `[${c.key}]`);

  const ws = XLSX.utils.aoa_to_sheet([headers, examples, hints, keys]);
  ws["!cols"] = visible.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tableName);

  const instructions: string[][] = [
    ["SpinFlow Import Template"],
    [`Module: ${tableName}`],
    ...(millName ? [[`Mill: ${millName}`]] : []),
    [""],
    ["INSTRUCTIONS:"],
    ["1. Fill in data starting from Row 2 (the example row)"],
    ["2. Delete the example row before importing"],
    ["3. Do NOT change column headers"],
    ["4. Required fields are marked in the Hints row"],
    ["5. Date format: YYYY-MM-DD (e.g. 2024-01-25)"],
    ["6. Save as .xlsx before uploading"],
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInst, "Instructions");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
