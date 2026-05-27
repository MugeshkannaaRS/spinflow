import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export interface ColumnConfig {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "boolean" | "phone" | "email";
  isVisible: boolean;
  isRequired: boolean;
  displayOrder: number;
  groupName?: string;
  placeholder?: string;
  helpText?: string;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string;
  isSearchable: boolean;
  isSortable: boolean;
  isExportable: boolean;
  isImportable: boolean;
  dropdownOptions?: { value: string; label: string }[];
}

export function col(
  key: string,
  label: string,
  type: ColumnConfig["type"] = "text",
  isVisible = true,
  isRequired = false,
  displayOrder = 0,
  groupName?: string,
  opts?: {
    placeholder?: string;
    helpText?: string;
    defaultValue?: string;
    isSearchable?: boolean;
    isSortable?: boolean;
    isExportable?: boolean;
    isImportable?: boolean;
  },
): ColumnConfig {
  return {
    key,
    label,
    type,
    isVisible,
    isRequired,
    displayOrder,
    groupName,
    placeholder: opts?.placeholder,
    helpText: opts?.helpText,
    defaultValue: opts?.defaultValue,
    isSearchable: opts?.isSearchable ?? true,
    isSortable: opts?.isSortable ?? true,
    isExportable: opts?.isExportable ?? true,
    isImportable: opts?.isImportable ?? true,
  };
}

const DEFAULT_CONFIGS: Record<string, ColumnConfig[]> = {
  hr_employees: [
    col("sl_no", "Sl No", "number", true, false, 1, "Personal"),
    col("employee_id", "Emp ID", "text", true, true, 2, "Personal"),
    col("name", "Full Name", "text", true, true, 3, "Personal"),
    col("gen", "Gender (Full)", "text", true, false, 4, "Personal"),
    col("gender", "Gender", "dropdown", true, false, 5, "Personal"),
    col("grade", "Grade", "number", true, false, 6, "Personal"),
    col("designation", "Designation", "text", true, false, 7, "Job"),
    col("section", "Section", "text", true, false, 8, "Job"),
    col("department", "Department", "dropdown", true, true, 9, "Job"),
    col("joining_date", "Joining Date", "date", true, false, 10, "Job"),
    col("dob", "DOB", "date", true, false, 11, "Personal"),
    col("age", "Age", "number", true, false, 12, "Personal"),
    col("phone", "Phone", "phone", true, false, 13, "Personal"),
    col("bank_account_no", "Bank A/C No", "text", true, false, 14, "Personal"),
    col("basic", "Basic", "number", true, false, 15, "Salary"),
    col("house_rent", "House Rent", "number", true, false, 16, "Salary"),
    col("medical", "Medical", "number", true, false, 17, "Salary"),
    col("conveyance", "Conveyance", "number", true, false, 18, "Salary"),
    col("food_allowance", "Food Allow", "number", true, false, 19, "Salary"),
    col("wages", "Wages", "number", true, false, 20, "Salary"),
    col("increment", "Increment", "number", true, false, 21, "Salary"),
    col("total_salary", "Total Salary", "number", true, false, 22, "Salary"),
    col("mobile_bill", "Mobile Bill", "number", true, false, 23, "Salary"),
    col("shift_benefit", "Shift Benefit", "number", true, false, 24, "Salary"),
    col("days_of_month", "Days/Month", "number", true, false, 25, "Salary", {defaultValue: "30"}),
    col("is_active", "Status", "text", true, false, 26, "Personal"),
  ],
  hr_attendance: [
    col("date", "Date", "date", true, true, 1),
    col("employee", "Employee", "text", true, true, 2),
    col("department", "Department", "dropdown", true, false, 3),
    col("shift", "Shift", "dropdown", true, false, 4),
    col("status", "Status", "dropdown", true, false, 5),
    col("check_in", "Check In", "text", true, false, 6),
    col("check_out", "Check Out", "text", true, false, 7),
  ],
  hr_leaves: [
    col("employee", "Employee", "text", true, true, 1),
    col("department", "Department", "dropdown", true, false, 2),
    col("from_date", "From", "date", true, true, 3),
    col("to_date", "To", "date", true, true, 4),
    col("type", "Type", "dropdown", true, true, 5),
    col("reason", "Reason", "text", true, false, 6),
    col("status", "Status", "dropdown", true, false, 7),
  ],
  hr_payroll: [
    col("employee_id", "Emp ID", "text", true, false, 1),
    col("name", "Name", "text", true, false, 2),
    col("basic", "Basic", "number", true, false, 3, "Salary"),
    col("payable_days", "Payable Days", "number", true, false, 4, "Salary"),
    col("payable_salary", "Payable Salary", "number", true, false, 5, "Salary"),
    col("ot_hours", "OT Hours", "number", true, false, 6, "Salary"),
    col("ot_amount", "OT Amount", "number", true, false, 7, "Salary"),
    col("attendance_bonus", "Att. Bonus", "number", true, false, 8, "Salary"),
    col("arrear_others", "Arrear", "number", true, false, 9, "Salary"),
    col("shift_amount", "Shift Amt", "number", true, false, 10, "Salary"),
    col("roster_amount", "Roster Amt", "number", true, false, 11, "Salary"),
    col("absent_deduction", "Absent Ded.", "number", true, false, 12, "Deductions"),
    col("advance_deduction", "Adv. Ded.", "number", true, false, 13, "Deductions"),
    col("tax_deduction", "Tax Ded.", "number", true, false, 14, "Deductions"),
    col("net_payable", "Net Payable", "number", true, false, 15, "Summary"),
  ],
  production_entries: [
    col("date", "Date", "date", true, true, 1),
    col("shift", "Shift", "dropdown", true, true, 2),
    col("machine_code", "Machine", "dropdown", true, true, 3),
    col("department", "Department", "dropdown", true, true, 4),
    col("operator", "Operator", "text", true, false, 5),
    col("count", "Count/Yarn", "dropdown", true, false, 6),
    col("produced_kg", "Produced (kg)", "number", true, false, 7),
    col("waste_kg", "Waste (kg)", "number", true, false, 8),
    col("stoppage_mins", "Stoppage min", "number", true, false, 9),
    col("stoppage_reason", "Stoppage Reason", "text", true, false, 10),
    col("machine_status", "Status", "dropdown", true, false, 11),
  ],
  production_downtime: [
    col("machine_code", "Machine", "text", true, false, 1),
    col("reason", "Reason", "text", true, false, 2),
    col("started_at", "Started", "date", true, false, 3),
    col("duration_min", "Duration", "number", true, false, 4),
    col("resolved", "Resolved", "boolean", true, false, 5),
  ],
  quality_tests: [
    col("date", "Date", "date", true, true, 1),
    col("type", "Type", "dropdown", true, true, 2),
    col("lot_id", "Lot ID", "text", true, false, 3),
    col("machine_code", "Machine", "dropdown", true, false, 4),
    col("sample_ref", "Sample Ref", "text", true, false, 5),
    col("result", "Result", "number", true, false, 6),
    col("unit", "Unit", "text", true, false, 7),
    col("standard", "Standard", "number", true, false, 8),
    col("status", "Status", "dropdown", true, false, 9),
    col("tested_by", "Tested By", "text", true, false, 10),
  ],
  quality_approvals: [
    col("lot_no", "Lot No", "text", true, false, 1),
    col("department", "Department", "dropdown", true, false, 2),
    col("produced_kg", "Produced (kg)", "number", true, false, 3),
    col("csp_result", "CSP", "number", true, false, 4),
    col("count_result", "Count", "number", true, false, 5),
    col("moisture_result", "Moisture", "number", true, false, 6),
    col("strength_result", "Strength", "number", true, false, 7),
    col("status", "Status", "dropdown", true, false, 8),
  ],
  inventory_lots: [
    col("lot_no", "Lot No", "text", true, false, 1),
    col("type", "Type", "dropdown", true, false, 2),
    col("department", "Department", "dropdown", true, false, 3),
    col("quantity", "Quantity", "number", true, false, 4),
    col("unit", "Unit", "text", true, false, 5),
    col("location", "Location", "text", true, false, 6),
    col("grade", "Grade", "text", true, false, 7),
    col("produced_date", "Produced Date", "date", true, false, 8),
    col("age", "Age (d)", "number", true, false, 9),
    col("status", "Status", "dropdown", true, false, 10),
  ],
  inventory_warehouses: [
    col("code", "Code", "text", true, false, 1),
    col("name", "Name", "text", true, false, 2),
    col("location", "Location", "text", true, false, 3),
    col("capacity_bags", "Capacity (bags)", "number", true, false, 4),
    col("is_active", "Status", "boolean", true, false, 5),
  ],
  dispatch_trips: [
    col("trip_no", "Trip No", "text", true, false, 1),
    col("date", "Date", "date", true, true, 2),
    col("vehicle_no", "Vehicle", "text", true, false, 3),
    col("driver_name", "Driver", "text", true, false, 4),
    col("customer", "Customer", "text", true, false, 5),
    col("lot_no", "Lot", "text", true, false, 6),
    col("planned_weight_kg", "Planned (kg)", "number", true, false, 7),
    col("loaded_weight_kg", "Loaded (kg)", "number", true, false, 8),
    col("delivered_weight_kg", "Delivered (kg)", "number", true, false, 9),
    col("status", "Status", "dropdown", true, false, 10),
  ],
  dispatch_sales_orders: [
    col("so_no", "Order No", "text", true, false, 1),
    col("customer", "Customer", "text", true, false, 2),
    col("order_date", "Date", "date", true, false, 3),
    col("delivery_date", "Delivery Date", "date", true, false, 4),
    col("yarn_count", "Count", "text", true, false, 5),
    col("total_bags", "Bags", "number", true, false, 6),
    col("total_weight_kg", "Qty (kg)", "number", true, false, 7),
    col("total_value", "Value", "number", true, false, 8),
    col("status", "Status", "dropdown", true, false, 9),
  ],
  stores_spares: [
    col("code", "Code", "text", true, false, 1),
    col("name", "Name", "text", true, false, 2),
    col("category", "Category", "dropdown", true, false, 3),
    col("stock", "Stock", "number", true, false, 4),
    col("min_stock", "Min Stock", "number", true, false, 5),
    col("unit", "Unit", "text", true, false, 6),
    col("location", "Location", "text", true, false, 7),
    col("vendor", "Vendor", "text", true, false, 8),
    col("is_active", "Status", "boolean", true, false, 9),
  ],
  stores_issues: [
    col("date", "Date", "date", true, true, 1),
    col("item_code", "Item Code", "text", true, false, 2),
    col("item_name", "Item Name", "text", true, false, 3),
    col("quantity", "Quantity", "number", true, false, 4),
    col("issued_to", "Issued To", "text", true, false, 5),
    col("department", "Department", "dropdown", true, false, 6),
    col("purpose", "Purpose", "text", true, false, 7),
    col("issued_by", "Issued By", "text", true, false, 8),
  ],
  maintenance_tasks: [
    col("date", "Date", "date", true, true, 1),
    col("type", "Type", "dropdown", true, false, 2),
    col("machine_code", "Machine", "dropdown", true, false, 3),
    col("department", "Department", "dropdown", true, false, 4),
    col("description", "Description", "text", true, false, 5),
    col("technician", "Technician", "text", true, false, 6),
    col("status", "Status", "dropdown", true, false, 7),
    col("spare_used", "Spare Used", "text", true, false, 8),
    col("downtime_min", "Downtime (min)", "number", true, false, 9),
  ],
  maintenance_schedules: [
    col("machine_code", "Machine", "text", true, false, 1),
    col("type", "Type", "dropdown", true, false, 2),
    col("frequency_days", "Frequency (days)", "number", true, false, 3),
    col("last_done", "Last Done", "date", true, false, 4),
    col("next_due", "Next Due", "date", true, false, 5),
    col("description", "Description", "text", true, false, 6),
    col("is_active", "Active", "boolean", true, false, 7),
  ],
  accounts_invoices: [
    col("invoice_no", "Invoice No", "text", true, false, 1),
    col("date", "Date", "date", true, false, 2),
    col("customer", "Customer", "text", true, false, 3),
    col("type", "Type", "dropdown", true, false, 4),
    col("amount", "Amount", "number", true, false, 5),
    col("gst", "GST", "number", true, false, 6),
    col("total", "Total", "number", true, false, 7),
    col("status", "Status", "dropdown", true, false, 8),
  ],
  accounts_gst: [
    col("month", "Month", "number", true, false, 1),
    col("year", "Year", "number", true, false, 2),
    col("output_cgst", "Output CGST", "number", true, false, 3),
    col("output_sgst", "Output SGST", "number", true, false, 4),
    col("output_igst", "Output IGST", "number", true, false, 5),
    col("input_total", "Input GST", "number", true, false, 6),
    col("net_payable", "Net Payable", "number", true, false, 7),
  ],
  masters_departments: [
    col("code", "Code", "text", true, true, 1),
    col("name", "Name", "text", true, true, 2),
    col("department_type", "Type", "dropdown", true, false, 3),
    col("is_active", "Active", "boolean", true, false, 4),
  ],
  masters_machines: [
    col("code", "Code", "text", true, true, 1),
    col("name", "Name", "text", true, false, 2),
    col("machine_type", "Type", "text", true, false, 3),
    col("department", "Department", "dropdown", true, true, 4),
    col("target_kg", "Target (kg)", "number", true, false, 5),
    col("spindles", "Spindles", "number", true, false, 6),
    col("current_status", "Status", "text", true, false, 7),
    col("is_active", "Active", "boolean", true, false, 8),
  ],
  masters_customers: [
    col("code", "Code", "text", true, true, 1),
    col("name", "Name", "text", true, true, 2),
    col("gstin", "GSTIN", "text", true, false, 3),
    col("city", "City", "text", true, false, 4),
    col("phone", "Phone", "phone", true, false, 5),
    col("credit_limit", "Credit Limit", "number", true, false, 6),
    col("is_active", "Active", "boolean", true, false, 7),
  ],
  masters_vehicles: [
    col("vehicle_no", "Vehicle No", "text", true, true, 1),
    col("vehicle_type", "Type", "dropdown", true, false, 2),
    col("capacity_kg", "Capacity (kg)", "number", true, false, 3),
    col("driver_name", "Driver", "text", true, false, 4),
    col("driver_phone", "Driver Phone", "phone", true, false, 5),
    col("is_active", "Active", "boolean", true, false, 6),
  ],
  masters_shifts: [
    col("code", "Code", "text", true, true, 1),
    col("name", "Name", "text", true, false, 2),
    col("start_time", "Start Time", "text", true, false, 3),
    col("end_time", "End Time", "text", true, false, 4),
  ],
  masters_yarn_counts: [
    col("count", "Count", "text", true, true, 1),
    col("count_value", "Value", "number", true, false, 2),
    col("blend", "Blend", "text", true, false, 3),
    col("standard_csp", "Std CSP", "number", true, false, 4),
    col("twist_per_meter", "Twist/m", "number", true, false, 5),
    col("is_active", "Active", "boolean", true, false, 6),
  ],
};

export interface UseColumnConfigReturn {
  getLabel: (key: string) => string;
  getConfig: (key: string) => ColumnConfig | undefined;
  getVisibleColumns: () => ColumnConfig[];
  getGroup: (groupName: string) => ColumnConfig[];
  getOptions: (key: string) => { value: string; label: string }[];
  isRequired: (key: string) => boolean;
  isVisible: (key: string) => boolean;
  isLoading: boolean;
  columns: ColumnConfig[];
}

export function useColumnConfig(tableName: string): UseColumnConfigReturn {
  const user = useAuth((s) => s.user);
  const millId = user?.millId ?? "default";

  const query = useQuery({
    queryKey: ["column-config", tableName, millId],
    queryFn: async () => {
      const res = await api.get("/ui-config/columns", {
        params: { table: tableName },
      });
      return res.data.columns as any[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const serverColumns: ColumnConfig[] = (query.data ?? []).map((c: any) => ({
    key: c.key,
    label: c.label,
    type: c.type ?? "text",
    isVisible: c.is_visible ?? true,
    isRequired: c.is_required ?? false,
    displayOrder: c.display_order ?? 0,
    groupName: c.group_name,
    placeholder: c.placeholder,
    helpText: c.help_text,
    minValue: c.min_value,
    maxValue: c.max_value,
    defaultValue: c.default_value,
    isSearchable: c.is_searchable ?? true,
    isSortable: c.is_sortable ?? true,
    isExportable: c.is_exportable ?? true,
    isImportable: c.is_importable ?? true,
    dropdownOptions: c.dropdown_options,
  }));

  const defaults = DEFAULT_CONFIGS[tableName] ?? [];
  const columns = (serverColumns.length > 0 && !query.isLoading) ? serverColumns : defaults;
  const sorted = [...columns].sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    getLabel: (key: string) => columns.find((c) => c.key === key)?.label ?? key,
    getConfig: (key: string) => columns.find((c) => c.key === key),
    getVisibleColumns: () => sorted.filter((c) => c.isVisible),
    getGroup: (groupName: string) => sorted.filter((c) => c.groupName === groupName),
    getOptions: (key: string) => columns.find((c) => c.key === key)?.dropdownOptions ?? [],
    isRequired: (key: string) => columns.find((c) => c.key === key)?.isRequired ?? false,
    isVisible: (key: string) => columns.find((c) => c.key === key)?.isVisible ?? true,
    isLoading: query.isLoading,
    columns,
  };
}
