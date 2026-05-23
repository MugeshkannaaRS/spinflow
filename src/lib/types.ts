import type { Role } from "@/lib/rbac";

export interface Machine {
  id: string;
  code: string;
  department: string;
  status: "running" | "idle" | "breakdown";
  efficiency: number;
  targetKg: number;
  producedKg: number;
}

export interface ShiftEntry {
  id: string;
  date: string;
  shift: "A" | "B" | "C";
  machineCode: string;
  department: string;
  operator: string;
  producedKg: number;
  wasteKg: number;
  count: string;
  status: "pending" | "approved" | "rejected";
}

export interface DowntimeLog {
  id: string;
  machineCode: string;
  reason: string;
  startedAt: string;
  durationMin: number;
  resolved: boolean;
}

export interface DashboardKpis {
  productionToday: number;
  productionTarget: number;
  efficiency: number;
  wastePercent: number;
  activeDowntime: number;
  stockValue: number;
  pendingDispatch: number;
  qualityRejection: number;
  trend: Array<{ day: string; produced: number; target: number }>;
  byDept: Array<{ dept: string; efficiency: number }>;
}

export interface QualityTest {
  id: string;
  date: string;
  type: "CSP" | "Count" | "Moisture" | "Uster" | "Strength";
  lotId: string;
  machineCode: string;
  sampleRef: string;
  result: number;
  unit: string;
  standard: number;
  status: "pass" | "fail" | "pending";
  testedBy: string;
}

export interface LotApproval {
  id: string;
  lotNo: string;
  department: string;
  producedKg: number;
  sampleDate: string;
  cspResult: number;
  countResult: number;
  moistureResult: number;
  strengthResult: number;
  status: "pending" | "approved" | "rejected";
  approvedBy: string;
  approvedAt: string;
}

export interface RejectionEntry {
  id: string;
  date: string;
  lotId: string;
  category: string;
  quantityKg: number;
  reason: string;
  disposition: "rework" | "scrap" | "sale";
  notedBy: string;
}

export interface InventoryLot {
  id: string;
  lotNo: string;
  type: "Cone" | "Bag" | "Bale";
  department: string;
  quantity: number;
  unit: string;
  location: string;
  grade: string;
  producedDate: string;
  age: number;
  status: "in-stock" | "transferred" | "dispatched";
}

export interface LegacyStockTransfer {
  id: string;
  date: string;
  lotNo: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  unit: string;
  transferredBy: string;
  status: "pending" | "completed";
}

export interface LegacySalesOrder {
  id: string;
  orderNo: string;
  customer: string;
  date: string;
  deliveryDate: string;
  items: string;
  quantityKg: number;
  value: number;
  status: "pending" | "processing" | "loaded" | "dispatched" | "delivered";
}

export interface DispatchEntry {
  id: string;
  dispatchNo: string;
  date: string;
  orderNo: string;
  customer: string;
  lotNo: string;
  quantityKg: number;
  vehicleNo: string;
  ewayBillNo: string;
  status: "pending" | "loaded" | "gate-out" | "dispatched" | "delivered";
  scannedBy: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  grade: string;
  status: "active" | "inactive";
}

export interface PurchaseEntry {
  id: string;
  date: string;
  invoiceNo: string;
  supplier: string;
  bales: number;
  grossKg: number;
  netKg: number;
  ratePerKg: number;
  moisture: number;
  grade: string;
  status: "pending" | "grn-pending" | "completed";
}

export interface GRN {
  id: string;
  date: string;
  grnNo: string;
  purchaseId: string;
  supplier: string;
  balesReceived: number;
  netKg: number;
  receivedBy: string;
  status: "pending" | "completed";
}

export interface SpareItem {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  location: string;
  vendor: string;
}

export interface IssueNote {
  id: string;
  date: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  issuedTo: string;
  department: string;
  purpose: string;
  issuedBy: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  employee: string;
  department: string;
  shift: "A" | "B" | "C" | "General";
  status: "present" | "absent" | "half-day" | "leave";
  checkIn: string;
  checkOut: string;
}

export interface LeaveRequest {
  id: string;
  employee: string;
  department: string;
  fromDate: string;
  toDate: string;
  type: "casual" | "sick" | "earned" | "other";
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy: string;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
  status: "active" | "inactive";
}

export type PayrollStatus = "draft" | "processing" | "approved" | "paid";

export interface PayrollMonth {
  id: string;
  mill_id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_pf: number;
  total_esic: number;
  processed_by?: string;
  approved_by?: string;
  paid_at?: string;
  created_at?: string;
}

export interface PayslipEntry {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  mill_id: string;
  month: number;
  year: number;
  present_days: number;
  absent_days: number;
  half_days: number;
  overtime_hours: number;
  daily_wage: number;
  basic_wage: number;
  overtime_amount: number;
  gross_wage: number;
  pf_employee: number;
  pf_employer: number;
  esic_employee: number;
  esic_employer: number;
  other_deductions: number;
  net_wage: number;
  payment_mode: string;
  payment_ref?: string;
  paid_at?: string;
  status: string;
  remarks?: string;
  employee_name?: string;
  employee_code?: string;
  department?: string;
}

export interface PayrollSummaryRow {
  month: number;
  year: number;
  total_employees: number;
  total_gross: number;
  total_net: number;
  total_pf: number;
  total_esic: number;
  status: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  customer: string;
  type: "sales" | "purchase";
  amount: number;
  gst: number;
  total: number;
  status: "draft" | "posted" | "paid" | "overdue";
}

export interface ReceivableEntry {
  id: string;
  customer: string;
  invoiceNo: string;
  date: string;
  dueDate: string;
  amount: number;
  outstanding: number;
  status: "current" | "overdue" | "paid";
  daysOverdue: number;
}

export interface MaintenanceTask {
  id: string;
  date: string;
  type: "breakdown" | "preventive" | "inspection";
  machineCode: string;
  department: string;
  description: string;
  technician: string;
  status: "open" | "in-progress" | "completed";
  completedAt: string;
  spareUsed: string;
  downtimeMin: number;
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  status: "active" | "inactive";
  lastLogin: string;
  created: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: "login" | "logout" | "create" | "update" | "delete" | "approve" | "reject";
  entity: string;
  entityId: string;
  details: string;
  ip: string;
}

export interface ReportData {
  productionSummary: {
    totalProduced: number;
    totalTarget: number;
    avgEfficiency: number;
    wastePercent: number;
  };
  qualitySummary: { testsConducted: number; passRate: number; failRate: number };
  dispatchSummary: { pending: number; inTransit: number; delivered: number };
  financialSummary: {
    salesTotal: number;
    purchaseTotal: number;
    receivablesOutstanding: number;
    gstCollected: number;
  };
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  module: string;
  created_at: string;
}

export interface MachineBreakdownPayload {
  machine_id: string;
  machine_no: string;
  reason: string;
  timestamp: string;
}

export interface LowStockPayload {
  item_id: string;
  item_name: string;
  current_stock: number;
  reorder_level: number;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  gstin?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Mill {
  id: string;
  company_id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Department {
  id: string;
  mill_id: string;
  code: string;
  name: string;
  department_type: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface YarnCount {
  id: string;
  mill_id: string;
  count: string;
  count_value: number;
  blend?: string;
  twist_per_meter?: number;
  standard_csp?: number;
  standard_u_percent?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: string;
  mill_id: string;
  code: string;
  name: string;
  gstin?: string;
  pan?: string;
  billing_address?: string;
  shipping_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  credit_limit: number;
  payment_terms_days: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MasterVehicle {
  id: string;
  mill_id: string;
  vehicle_no: string;
  vehicle_type: string;
  make?: string;
  model?: string;
  capacity_kg?: number;
  driver_name?: string;
  driver_phone?: string;
  driver_license?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Route {
  id: string;
  mill_id: string;
  code: string;
  name: string;
  origin: string;
  destination: string;
  distance_km?: number;
  estimated_hours?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type FGState =
  | "WIP"
  | "QC_PENDING"
  | "SELLABLE"
  | "RESERVED"
  | "QUARANTINE"
  | "DISPATCHED"
  | "DELIVERED";

export type MoveType =
  | "PRODUCTION_IN"
  | "QC_APPROVED"
  | "QC_REJECTED_TO_QUARANTINE"
  | "SALES_RESERVED"
  | "SALES_RESERVATION_RELEASED"
  | "DISPATCH_OUT"
  | "DELIVERY_CONFIRMED"
  | "RETURN_IN"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

export interface StockBalance {
  id: string;
  mill_id: string;
  lot_id: string;
  warehouse_id: string;
  fg_state: FGState;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  qty_quarantine: number;
  weight_on_hand_kg: number;
  weight_reserved_kg: number;
  last_move_at: string | null;
}

export interface StockLedgerEntry {
  id: string;
  mill_id: string;
  lot_id: string | null;
  warehouse_id: string;
  move_type: MoveType;
  qty_in: number;
  qty_out: number;
  weight_in_kg: number;
  weight_out_kg: number;
  ref_doc_type: string | null;
  ref_doc_id: string | null;
  lot_no: string | null;
  yarn_count: string | null;
  warehouse_code: string | null;
  user_id: string;
  shift_id: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface StockSnapshotRow {
  lot_id: string;
  lot_no: string;
  yarn_count: string;
  warehouse_id: string;
  warehouse_code: string;
  fg_state: FGState;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  qty_quarantine: number;
  weight_on_hand_kg: number;
  last_move_at: string | null;
}

export interface SalesOrderLine {
  id: string;
  so_id: string;
  lot_id: string;
  warehouse_id: string;
  bags_ordered: number;
  bags_delivered: number;
  bags_reserved: number;
  weight_kg: number;
  rate_per_kg: number | null;
  line_amount: number | null;
  status: string;
  available_qty: number;
}

export interface SalesOrder {
  id: string;
  mill_id: string;
  so_no: string;
  customer_id: string;
  status: string;
  order_date: string;
  delivery_date: string | null;
  yarn_count: string | null;
  total_bags: number;
  total_weight_kg: number;
  rate_per_kg: number | null;
  total_value: number | null;
  incoterms: string | null;
  notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
  lines: SalesOrderLine[];
}

export interface StockTransfer {
  id: string;
  mill_id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  lot_id: string;
  bags_count: number;
  weight_kg: number;
  notes: string | null;
  created_by: string;
  confirmed_by: string | null;
  completed_by: string | null;
  created_at: string | null;
}

export interface ListResponse<T> {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  data: T[];
}

export type TripStatus =
  | "draft"
  | "loading"
  | "loaded"
  | "in_transit"
  | "arrived"
  | "delivered"
  | "cancelled";
export type TripItemStatus = "pending" | "loaded" | "delivered" | "wrong_destination" | "missing";

export interface Trip {
  id: string;
  mill_id: string;
  trip_no: string;
  sales_order_id?: string;
  vehicle_id?: string;
  vehicle_no?: string;
  driver_name?: string;
  driver_mobile?: string;
  from_warehouse_id: string;
  destination_route_id?: string;
  destination_name?: string;
  customer_id?: string;
  status: TripStatus;
  planned_bags: number;
  loaded_bags: number;
  delivered_bags: number;
  planned_weight_kg: number;
  loaded_weight_kg: number;
  delivered_weight_kg: number;
  loader_id?: string;
  receiver_id?: string;
  loading_started_at?: string;
  loading_completed_at?: string;
  departure_at?: string;
  arrived_at?: string;
  delivered_at?: string;
  pod_confirmed_at?: string;
  pod_confirmed_by?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
  items?: TripItem[];
}

export interface TripItem {
  id: string;
  trip_id: string;
  bag_no: string;
  lot_no: string;
  yarn_count?: string;
  planned_weight_kg: number;
  loaded_weight_kg?: number;
  delivered_weight_kg?: number;
  item_status: TripItemStatus;
  wrong_destination_detected: boolean;
  loader_scan_at?: string;
  receiver_scan_at?: string;
}

export interface TripScanLog {
  id: string;
  trip_id: string;
  scan_type: string;
  result: string;
  scanned_by: string;
  scanned_at?: string;
  device_info?: string;
  ip_address?: string;
}

export interface ScanResult {
  result: string;
  bag_no?: string;
  lot_no?: string;
  yarn_count?: string;
  weight_kg?: number;
  loaded_count?: number;
  delivered_count?: number;
  planned_count?: number;
  trip_complete?: boolean;
  alert?: string;
  expected_route?: string;
  scanned_route?: string;
}

export interface PLStatement {
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  expenses: { payroll: number; other: number; total: number };
  net_profit: number;
  net_margin_pct: number;
  month: number;
  year: number;
}

export interface ReceivablesAgeing {
  buckets: { current: number; days_31_60: number; days_61_90: number; over_90: number };
  total_outstanding: number;
  invoice_count: number;
  oldest_invoice_days: number;
}

export interface GSTSummary {
  output_gst: { cgst: number; sgst: number; igst: number; total: number };
  input_gst: { total: number };
  net_payable: number;
  month: number;
  year: number;
}

export interface MasterMachine {
  id: string;
  code: string;
  name?: string;
  machine_type?: string;
  department: string;
  make?: string;
  model?: string;
  spindles?: number;
  installation_date?: string;
  amc_expiry?: string;
  current_status?: string;
  target_kg: number;
  is_active: boolean;
  created_at?: string;
}

export interface Shift {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location?: string;
  capacity_bags?: number;
  is_active: boolean;
  created_at?: string;
}

export interface InventoryBag {
  id: string;
  mill_id: string;
  lot_id: string;
  bag_no: string;
  lot_no: string;
  yarn_count?: string;
  weight_kg: number;
  qr_code?: string;
  status: string;
  warehouse_id?: string;
  created_at?: string;
  updated_at?: string;
}
