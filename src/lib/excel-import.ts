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
  // ── Employees ──────────────────────────────────────────────────────
  employee_id: [
    "code","emp id","empid","emp_id","employee id","emp no","emp no.","empno",
    "employee no","staff id","staff no","worker id","emp code",
    "employee code","emp code","id","serial no","sr no","sl no","si no",
  ],
  // v2 key — matches useColumnConfig key for auto-mapping
  employee_code: [
    "code","emp id","empid","emp_id","employee id","emp no","emp no.","empno",
    "employee no","staff id","staff no","worker id","emp code",
    "employee code","emp code","id","employee no.","emp.code","emp. code",
    "emp.no","emp.id","staff code","worker code","worker no","labour code",
    "labour id","labor code","labor id",
  ],
  full_name: [
    "full name","name","fullname","employee name","staff name","worker name",
    "emp name","person name","name of employee","name of worker","worker name",
    "staff name","labour name","labor name","name of staff","emp full name",
  ],
  date_of_joining: [
    "doj","date of joining","join date","start date","joining date","joining",
    "date joined","d.o.j","date of appointment","appointment date",
    "date of employment","employment date","joined on","joining dt",
  ],
  basic: [
    "basic","basic pay","basic salary","basic wage","base pay","base salary",
    "bs","basic amt","basic amount","basic sal","b.s","basic sal.",
  ],
  total_salary: [
    "gross","gross salary","gross pay","total pay","total wage","total wages",
    "ctc","total salary","gross wages","total earnings","total emoluments",
    "gross amt","total amt","gross amount","total sal","salary","sal",
    "total sal.","gross sal","monthly salary","monthly wages",
  ],
  house_rent: [
    "hra","house rent allowance","rent allowance","house rent","h.r.a",
    "hra amount","house rent allow","h r a","house rent amt",
  ],
  department: [
    "dept","dept.","department name","department","division",
    "department code","dept code","dept name","dep","section name",
  ],
  section: [
    "section","section name","sub dept","sub-dept","unit","floor","area",
  ],
  food_allowance: [
    "food allow","food","meal allowance","food allowance","canteen","food amt",
    "food allw","food alw","tiffin","tiffin allowance","lunch allowance",
  ],
  mobile_bill: [
    "mobile","phone bill","mobile allowance","mobile allow","mobile bill",
    "mobile amt","mobile alw","mobile allw","telephone allow","telephone allowance",
  ],
  shift_benefit: [
    "shift benifit","shift benefit","shift allow","shift allowance","shift_benefit",
    "shift bonus","shift alw","night allowance","night allow","night shift",
  ],
  wages: [
    "wages","wage","daily wage","daily rate","da","daily wages",
    "da amount","dearness allowance","d.a","dearness allow","d a",
    "wage amount","wage amt",
  ],
  designation: [
    "designation","post","position","job title","cadre","rank","role",
    "desg","desgn","post name","designation name","job role",
    "desg.","desgn.","cadre name","grade designation",
  ],
  grade: [
    "grade","pay grade","level","category","class","scale","grade name",
    "pay scale","pay band","pay level","grade no","grade code",
  ],
  gender: ["gender","sex","m/f","male/female","gen","m / f","gender code"],
  gen: ["gen","generation","gen code","gen name"],
  date_of_birth: ["date of birth","dob","birth date","born","dob date"],
  // v2 key — matches useColumnConfig key
  dob: [
    "date of birth","dob","birth date","born","dob date","d.o.b",
    "birth dt","date of birth","d o b","dob.","birthdate",
  ],
  phone: [
    "mobile","phone","mobile no","phone no","contact","contact no","cell",
    "mobile number","phone number","contact number","cell no","mob no",
    "mob","tel","tel no","telephone","phone no.","mobile no.",
  ],
  age: ["age","age (yrs)","age in years","age yrs","emp age","worker age"],
  sl_no: ["sl no","sl.no","sl. no","s.no","s. no","sno","sr no","sr.no","si no","si.no","serial no","serial number","s no","s.no."],
  bank_account_no: [
    "bank account","account no","bank ac","acc no","account number",
    "bank a/c","bank a/c no","a/c no","bank acc no","bank acc","a/c number",
    "account no.","acc number","bank account number","acct no","acct number",
  ],
  bank_ifsc: ["ifsc","ifsc code","bank ifsc","ifsc no","ifsc no.","bank ifsc code"],
  shift: ["shift","shift name","working shift","shift code","shift type"],
  days_of_month: [
    "days of month","working days","days","month days","days in month",
    "no of days","number of days","total days","days/month","days per month",
  ],
  house_rent_allowance: ["hra","house rent allowance","rent allowance"],
  conveyance: [
    "conveyance","conveyance allowance","travel allowance","ta","t.a",
    "travel allow","conveyance allow","travelling allowance","travel amt",
  ],
  medical: [
    "medical","medical allowance","medical allow","med allow","med amt",
    "medical amt","health allowance","health allow",
  ],
  increment: ["increment","increment amount","salary increment","incr","incr.","increment amt"],
  wages_of_month: ["wages of month","monthly wages","month wages","wages/month"],
  // Payroll fields
  calculate_days: ["calculate days","calc days","calculated days","working days calc","attendance days"],
  actual_attendance: ["actual attendance","att","attendance","actual att","present days","present"],
  day_off: ["day off","days off","weekly off","weekly offs","off days","holiday"],
  cl: ["cl","casual leave","c.l","c l","casual"],
  sl: ["sl","sick leave","s.l","s l","sick"],
  el: ["el","earned leave","e.l","e l","privilege leave","pl","p.l"],
  comp_leave: ["comp leave","compensatory leave","comp off","c off","co"],
  festival_holiday: ["festival holiday","festival","holiday","national holiday","fh"],
  absent_days: ["absent days","absent","absents","absentee","ab","no of absent"],
  payable_days: ["payable days","pay days","days payable","net days"],
  payable_salary: ["payable salary","net salary","salary payable","net pay","net amount","payable","net sal"],
  ot_hours: ["ot hours","ot hrs","overtime hours","overtime hrs","ot","over time hours","o.t. hours"],
  ot_amount: ["ot amount","overtime amount","ot amt","ot pay","overtime pay","o.t. amount"],
  festival_duty_benefit: ["festival duty benefit","festival duty","fdb","fd benefit"],
  festival_holiday_allowance: ["festival holiday allowance","fha","festival allowance","holiday allowance"],
  ifter_days: ["ifter days","iftar days","ifter","iftar","fasting days"],
  ifter_allowance: ["ifter allowance","iftar allowance","ifter allow","iftar allow"],
  special_food: ["special food","special food allowance","extra food","food special"],
  attendance_bonus: ["attendance bonus","att bonus","att. bonus","a bonus","attendance incentive"],
  arrear_others: ["arrear others","arrear","arrears","other arrear","arrear & others","others"],
  absent_deduction: ["absent deduction","absent ded","absent ded.","ab deduction","absence deduction"],
  advance_deduction: ["advance deduction","advance ded","advance ded.","adv deduction","advance","adv ded"],
  tax_deduction: ["tax deduction","tax ded","tax ded.","income tax","tds","i tax","tax"],
  net_payable: [
    "net payable","net pay","net salary","net wages","net amount","net","take home",
    "net sal","net payable amt","final pay","net total",
  ],

  // ── Machines ───────────────────────────────────────────────────────
  code: [
    "code","mc code","machine code","machine no","machine number",
    "mc no","mc_code","machinecode","item code","asset code",
    "equipment code","sl no","si no","serial no","serial number","sr no",
    "id","machine id","asset no","asset number","unit no","unit number",
    "equipment no","plant code","m/c code","m/c no","mach code","mach no",
  ],
  name: [
    "name","name of item","item name","machine name","description",
    "machine description","equipment name","asset name","item","particulars",
    "name of machine","model name","machine type name",
  ],
  machine_type: [
    "type no","type number","type","model","model no","model number",
    "make","manufacturer model","machine type","type of machine",
    "equipment type","asset type","type no.",
  ],
  target_kg: ["target kg","target","production target","daily target","target output","daily output"],
  spindles: ["spindles","spindle count","no of spindles","number of spindles","spindle no"],
  current_status: ["status","condition","machine status","working status","state","operational status"],
  manufacturing_year: [
    "manufacturing year","mfg year","year","year of manufacture",
    "manufacture year","built year","year made","yom","year of mfg",
  ],
  installation_date: [
    "installation date","installed date","comm date","commissioning date",
    "commission date","start date","date of installation","date installed",
    "induction date","purchase date",
  ],
  remarks: ["remarks","notes","comment","comments","note","observation"],
  serial_no: ["serial no","serial number","sr no","sl no","asset serial","serial"],

  // ── Departments ────────────────────────────────────────────────────
  // (code already defined above, name already defined above)
  department_type: ["department type","dept type","type of department"],

  // ── Customers ──────────────────────────────────────────────────────
  // (code, name, phone already defined above)
  gstin: ["gstin","gst no","gst number","gstin no","gstin number"],
  city: ["city","town","location","place"],
  state: ["state","province","region"],
  credit_limit: ["credit limit","credit","limit","outstanding limit"],
  payment_terms_days: ["payment terms","terms","payment days","credit days"],

  // ── Vehicles ───────────────────────────────────────────────────────
  vehicle_no: ["vehicle no","vehicle number","reg no","registration no","plate no","lorry no","truck no"],
  vehicle_type: ["vehicle type","type of vehicle","transport type"],
  capacity_kg: ["capacity","capacity kg","load capacity","weight capacity"],
  driver_name: ["driver","driver name","driver's name","operator"],
  driver_phone: ["driver phone","driver mobile","driver contact","driver no"],

  // ── Yarn counts ────────────────────────────────────────────────────
  count: ["count","yarn count","ne","count ne","count value","ne count"],
  count_value: ["count value","ne value","value"],
  blend: ["blend","fibre","fiber","material","composition"],
  standard_csp: ["standard csp","std csp","csp","csp value"],
  twist_per_meter: ["twist per meter","tpm","twist","twists per meter"],
};

export function fuzzyMatchColumns(
  excelHeaders: string[],
  columnConfigs: ColumnConfig[],
  savedMappings: ImportMapping[] = [],
  minConfidence = 60,
): Map<string, ColumnConfig | null> {
  const result = new Map<string, ColumnConfig | null>();
  const usedFields = new Set<string>();

  for (const header of excelHeaders) {
    const normalizedHeader = normalize(header);

    // 1. Saved mapping takes highest priority
    const saved = savedMappings.find(
      (m) => m.excel_header.toLowerCase() === header.toLowerCase() && m.spinflow_field,
    );
    if (saved && saved.spinflow_field) {
      const matchedCol = columnConfigs.find((c) => c.key === saved.spinflow_field);
      if (matchedCol && !usedFields.has(matchedCol.key)) {
        result.set(header, matchedCol);
        usedFields.add(matchedCol.key);
        continue;
      }
    }

    // 2. Exact alias match (FIELD_ALIASES)
    let exactAliasMatch: ColumnConfig | null = null;
    let exactAliasKey = "";
    for (const [fieldKey, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalize(a) === normalizedHeader)) {
        const col = columnConfigs.find((c) => c.key === fieldKey);
        if (col && !usedFields.has(col.key)) {
          exactAliasMatch = col;
          exactAliasKey = fieldKey;
          break;
        }
      }
    }
    if (exactAliasMatch) {
      result.set(header, exactAliasMatch);
      usedFields.add(exactAliasMatch.key);
      continue;
    }

    // 3. Substring alias match — e.g. "mc code" contains "code"
    let substringMatch: ColumnConfig | null = null;
    let substringScore = 0;
    for (const [fieldKey, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const na = normalize(alias);
        if (
          (normalizedHeader.includes(na) || na.includes(normalizedHeader)) &&
          na.length >= 3
        ) {
          const score = na.length / Math.max(normalizedHeader.length, na.length);
          if (score > substringScore) {
            const col = columnConfigs.find((c) => c.key === fieldKey);
            if (col && !usedFields.has(col.key)) {
              substringScore = score;
              substringMatch = col;
            }
          }
        }
      }
    }
    if (substringMatch && substringScore >= 0.5) {
      result.set(header, substringMatch);
      usedFields.add(substringMatch.key);
      continue;
    }

    // 4. Column config key/label exact match
    const directMatch = columnConfigs.find(
      (c) =>
        !usedFields.has(c.key) &&
        (normalize(c.key.replace(/_/g, " ")) === normalizedHeader ||
          normalize(c.label) === normalizedHeader),
    );
    if (directMatch) {
      result.set(header, directMatch);
      usedFields.add(directMatch.key);
      continue;
    }

    // 5. Levenshtein fuzzy fallback
    let bestMatch: ColumnConfig | null = null;
    let bestScore = Infinity;

    for (const col of columnConfigs) {
      if (usedFields.has(col.key)) continue;
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
    if (bestMatch) usedFields.add(bestMatch.key);
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
    const dmY = /^(\d{2})\/(\d{2})\/(\d{4})$/
    const yMd = /^(\d{4})-(\d{2})-(\d{2})$/
    const dmYMatch = value.match(dmY)
    if (dmYMatch) return `${dmYMatch[3]}-${dmYMatch[2].padStart(2, "0")}-${dmYMatch[1].padStart(2, "0")}`
    if (value.match(yMd)) return value
  }
  return null;
}

export function isValidNumericString(value: any): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return !isNaN(value);
  if (typeof value === "string") {
    return /^-?\d+(\.\d+)?$/.test(value.trim());
  }
  return false;
}

export function validateDateString(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") {
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
