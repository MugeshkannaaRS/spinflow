import { api } from "@/lib/api";
import type { Role } from "@/lib/rbac";

export interface OperatorGroup {
  id: string;
  mill_id?: string;
  name: string;
  emp_id?: string;
  machine_codes: string[];
  is_active: boolean;
}

export interface MachineGroup {
  id: string;
  mill_id?: string;
  name: string;
  description?: string;
  machine_codes: string[];
  is_active: boolean;
}

// Extracts .data array from paginated responses; returns raw data otherwise
function extractList(response: any) {
  if (Array.isArray(response)) return response;
  if (response?.data && Array.isArray(response.data)) return response.data;
  return [];
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api
      .post("/auth/login", new URLSearchParams({ username: email, password }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      .then((r) => {
        const token = r.data?.access_token;
        const u = r.data?.user;
        if (!token || !u?.id) throw new Error("Invalid login response from server");
        return {
          token,
          refreshToken: r.data?.refresh_token,
          user: {
            id: u.id,
            name: u.name ?? "",
            email: u.email ?? "",
            role: (u.role ?? "OPERATOR") as Role,
            millId: u.mill_id || "m1",
            millName: u.mill_name || "SpinFlow Coimbatore Unit-1",
            companyId: u.company_id || undefined,
            mustChangePassword: u.must_change_password ?? false,
          },
        };
      }),
  logout: () => api.post("/auth/logout"),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refresh_token: refreshToken }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .then((r) => r.data),
  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }).then((r) => r.data),
  verifyOtpAndReset: (email: string, otp: string, newPassword: string) =>
    api
      .post("/auth/verify-otp-reset", { email, otp, new_password: newPassword })
      .then((r: any) => r.data),
};

// Production
export const productionApi = {
  getMachines: (params?: Record<string, any>) =>
    api.get("/production/machines", { params }).then((r: any) => extractList(r.data)),
  getMachineSections: (params?: Record<string, any>) =>
    api
      .get("/production/machines/sections", { params })
      .then((r: any) => r.data as { sections: string[] }),
  bulkCancelEntries: (ids: string[]) =>
    api.post("/production/entries/bulk-cancel", { ids }).then((r: any) => r.data),
  getOperatorGroups: (params?: Record<string, any>) =>
    api.get("/production/operator-groups", { params }).then((r: any) => r.data as OperatorGroup[]),
  createOperatorGroup: (data: Partial<OperatorGroup>) =>
    api.post("/production/operator-groups", data).then((r: any) => r.data as OperatorGroup),
  updateOperatorGroup: (id: string, data: Partial<OperatorGroup>) =>
    api.put(`/production/operator-groups/${id}`, data).then((r: any) => r.data as OperatorGroup),
  deleteOperatorGroup: (id: string) =>
    api.delete(`/production/operator-groups/${id}`).then((r: any) => r.data),
  getMachineGroups: (params?: Record<string, any>) =>
    api.get("/production/machine-groups", { params }).then((r: any) => r.data as MachineGroup[]),
  createMachineGroup: (data: Partial<MachineGroup>) =>
    api.post("/production/machine-groups", data).then((r: any) => r.data as MachineGroup),
  updateMachineGroup: (id: string, data: Partial<MachineGroup>) =>
    api.put(`/production/machine-groups/${id}`, data).then((r: any) => r.data as MachineGroup),
  deleteMachineGroup: (id: string) =>
    api.delete(`/production/machine-groups/${id}`).then((r: any) => r.data),
  createMachine: (data: any) => api.post("/production/machines", data).then((r) => r.data),
  updateMachine: (id: string, data: any) =>
    api.put(`/production/machines/${id}`, data).then((r) => r.data),
  getEntries: (params?: Record<string, any>) =>
    api.get("/production/entries", { params }).then((r: any) => r.data),
  createEntry: (data: any) => api.post("/production/entries", data).then((r) => r.data),
  createBulkEntries: (data: any) => api.post("/production/entries/bulk", data).then((r) => r.data),
  getDowntime: () => api.get("/production/downtime").then((r: any) => extractList(r.data)),
  createDowntime: (data: any) => api.post("/production/downtime", data).then((r) => r.data),
  approveEntry: (id: string) => api.put(`/production/entries/${id}/approve`).then((r) => r.data),
  rejectEntry: (id: string) => api.patch(`/production/entries/${id}/reject`).then((r) => r.data),
  updateMachineStatus: (id: string, data: any) =>
    api.patch(`/production/machines/${id}/status`, data).then((r) => r.data),
  getShifts: () => api.get("/production/shifts").then((r: any) => extractList(r.data)),
  createShift: (data: any) => api.post("/production/shifts", data).then((r) => r.data),
  updateShift: (id: string, data: any) => api.patch(`/production/shifts/${id}`, data).then((r) => r.data),
  deleteMachine: (id: string) => api.delete(`/production/machines/${id}`).then((r) => r.data),
  deleteEntry: (id: string) => api.delete(`/production/entries/${id}`).then((r) => r.data),
  updateEntry: (id: string, data: any) =>
    api.patch(`/production/entries/${id}`, data).then((r) => r.data),
  // v2 additions
  getStopCodes: (department?: string) =>
    api
      .get("/production/datalog-stop-codes", { params: department ? { department } : undefined })
      .then((r) => r.data?.data ?? []),
  getAllStopCodes: () => api.get("/production/datalog-stop-codes").then((r) => r.data?.data ?? []),
  createStopCode: (data: {
    code: number;
    name: string;
    category?: string;
    departments?: string[];
  }) => api.post("/production/datalog-stop-codes", data).then((r) => r.data),
  updateStopCode: (
    code: number,
    data: { name?: string; category?: string; departments?: string[]; is_active?: boolean },
  ) => api.put(`/production/datalog-stop-codes/${code}`, data).then((r) => r.data),
  deleteStopCode: (code: number) => api.delete(`/production/datalog-stop-codes/${code}`),
  getPageInit: (millId: string) =>
    api.get("/production/v2/page-init", { params: { mill_id: millId } }).then((r) => r.data),
  getWasteEntries: (params?: Record<string, any>) =>
    api.get("/production/waste-entries", { params }).then((r) => r.data),
  getWasteTypes: (params?: Record<string, any>) =>
    api.get("/production/waste-entries/types", { params }).then((r) => r.data),
  getWasteTypeTemplate: (params: { machine_code?: string; machine_group_id?: string; mill_id?: string }) =>
    api.get("/production/waste-type-templates", { params }).then((r) => r.data),
  upsertWasteTypeTemplate: (data: any) =>
    api.put("/production/waste-type-templates", data).then((r) => r.data),
  createWasteBulk: (data: any, millId?: string) =>
    api
      .post("/production/waste-entries/bulk", data, { params: millId ? { mill_id: millId } : {} })
      .then((r) => r.data),
  approveWasteEntry: (id: string) =>
    api.patch(`/production/waste-entries/${id}/approve`).then((r) => r.data),
  getManpowerCategories: (params?: Record<string, any>) =>
    api.get("/production/manpower-categories", { params }).then((r) => r.data),
  createManpowerCategory: (data: any, millId: string) =>
    api.post(`/production/manpower-categories?mill_id=${millId}`, data).then((r) => r.data),
  updateManpowerCategory: (id: string, data: any) =>
    api.patch(`/production/manpower-categories/${id}`, data).then((r) => r.data),
  deleteManpowerCategory: (id: string) =>
    api.delete(`/production/manpower-categories/${id}`).then((r) => r.data),
  logDatalogDowntime: (data: any, millId: string) =>
    api.post(`/production/downtime/datalog?mill_id=${millId}`, data).then((r) => r.data),
  getRFManpower: (params?: Record<string, any>) =>
    api.get("/production/rf-manpower", { params }).then((r) => r.data),
  upsertRFManpowerBulk: (data: any, millId: string) =>
    api.post(`/production/rf-manpower/bulk?mill_id=${millId}`, data).then((r) => r.data),
  getDowntimeLogs: (params?: Record<string, any>) =>
    api.get("/production/downtime", { params }).then((r: any) => r.data),
  deleteDowntime: (id: string) => api.delete(`/production/downtime/${id}`).then((r) => r.data),
  deleteWasteEntry: (id: string) => api.delete(`/production/waste-entries/${id}`),
  deleteRFManpower: (id: string) => api.delete(`/production/rf-manpower/${id}`),
  // Learner Allocation
  createLearnerAllocation: (data: any) => api.post("/production/learner-allocation", data).then((r) => r.data),
  getLearnerAllocations: (params?: any) => api.get("/production/learner-allocations", { params }).then((r) => r.data),
  getLearnerAllocation: (id: string) => api.get(`/production/learner-allocations/${id}`).then((r) => r.data),
};

// Quality
export const qualityApi = {
  getTests: () => api.get("/quality/tests").then((r: any) => extractList(r.data)),
  createTest: (data: any) => api.post("/quality/tests", data).then((r) => r.data),
  deleteTest: (id: string) => api.delete(`/quality/tests/${id}`).then((r) => r.data),
  getApprovals: () => api.get("/quality/approvals").then((r: any) => extractList(r.data)),
  approveOrReject: (data: any) => api.post("/quality/approvals/action", data).then((r) => r.data),
  getRejections: () => api.get("/quality/rejections").then((r: any) => extractList(r.data)),
  getLots: () => api.get("/quality/lots").then((r: any) => extractList(r.data)),
};

// Inventory
export const inventoryApi = {
  getLots: () => api.get("/inventory/lots").then((r: any) => extractList(r.data)),
  deleteLot: (id: string) => api.delete(`/inventory/lots/${id}`).then((r) => r.data),
  getTransfers: () => api.get("/inventory/transfers").then((r: any) => extractList(r.data)),
  createTransfer: (data: any) => api.post("/inventory/transfers", data).then((r) => r.data),
  getWarehouses: () => api.get("/inventory/warehouses").then((r: any) => extractList(r.data)),
  createWarehouse: (data: any) => api.post("/inventory/warehouses", data).then((r) => r.data),
  deleteWarehouse: (id: string) => api.delete(`/inventory/warehouses/${id}`).then((r) => r.data),
};

// Dispatch
export const dispatchApi = {
  getOrders: () => api.get("/dispatch/orders").then((r: any) => extractList(r.data)),
  createOrder: (data: any) => api.post("/dispatch/orders", data).then((r) => r.data),
  deleteOrder: (id: string) => api.delete(`/dispatch/orders/${id}`).then((r) => r.data),
  updateStatus: (id: string, data: any) =>
    api.put(`/dispatch/orders/${id}/status`, data).then((r) => r.data),
  getTrips: (params?: Record<string, string | number>) =>
    api.get("/dispatch/trips", { params }).then((r) => r.data),
  createTrip: (data: any) => api.post("/dispatch/trips", data).then((r) => r.data),
  dispatchTrip: (id: string) => api.put(`/dispatch/trips/${id}/dispatch`).then((r) => r.data),
  deliverTrip: (id: string) => api.put(`/dispatch/trips/${id}/deliver`).then((r) => r.data),
  updateDocuments: (id: string, data: any) =>
    api.put(`/dispatch/orders/${id}/documents`, data).then((r) => r.data),
};

// Purchase
export const purchaseApi = {
  getPurchases: () => api.get("/purchase/purchases").then((r: any) => extractList(r.data)),
  createPurchase: (data: any) => api.post("/purchase/purchases", data).then((r) => r.data),
  deletePurchase: (id: string) => api.delete(`/purchase/purchases/${id}`).then((r) => r.data),
  getSuppliers: () => api.get("/purchase/suppliers").then((r: any) => extractList(r.data)),
  deleteSupplier: (id: string) => api.delete(`/purchase/suppliers/${id}`).then((r) => r.data),
  getGRNs: () => api.get("/purchase/grns").then((r: any) => extractList(r.data)),
  // Cotton imports (L/C consignments)
  getImports: () => api.get("/purchase/imports").then((r: any) => extractList(r.data)),
  createImport: (data: any) => api.post("/purchase/imports", data).then((r) => r.data),
  updateImport: (id: string, data: any) => api.put(`/purchase/imports/${id}`, data).then((r) => r.data),
  deleteImport: (id: string) => api.delete(`/purchase/imports/${id}`).then((r) => r.data),
  // Work orders
  getWorkOrders: () => api.get("/purchase/work-orders").then((r: any) => extractList(r.data)),
  createWorkOrder: (data: any) => api.post("/purchase/work-orders", data).then((r) => r.data),
  updateWorkOrder: (id: string, data: any) => api.put(`/purchase/work-orders/${id}`, data).then((r) => r.data),
  deleteWorkOrder: (id: string) => api.delete(`/purchase/work-orders/${id}`).then((r) => r.data),
};

export const baleApi = {
  getBales: (params?: Record<string, string>) =>
    api.get("/purchase/bales", { params }).then((r) => extractList(r.data)),
  createBale: (data: any) => api.post("/purchase/bales", data).then((r) => r.data),
  getGroup: (data: any) => api.post("/purchase/bales/group", data).then((r) => r.data),
  getStats: () => api.get("/purchase/bales/stats").then((r) => r.data),
};

// Stores
export const storesApi = {
  getSpares: () => api.get("/stores/spares").then((r: any) => extractList(r.data)),
  deleteSpare: (id: string) => api.delete(`/stores/spares/${id}`).then((r) => r.data),
  getIssues: () => api.get("/stores/issues").then((r: any) => extractList(r.data)),
  deleteIssue: (id: string) => api.delete(`/stores/issues/${id}`).then((r) => r.data),
  createIssue: (data: any) => api.post("/stores/issues", data).then((r) => r.data),
  createSpare: (data: any) => api.post("/stores/spares", data).then((r) => r.data),
  updateSpare: (id: string, data: any) => api.put(`/stores/spares/${id}`, data).then((r) => r.data),
  receiveStock: (id: string, data: any) =>
    api.post(`/stores/spares/${id}/receive`, data).then((r) => r.data),
};

// HR
export const hrApi = {
  getEmployees: (params?: Record<string, any>) =>
    api.get("/hr/employees", { params }).then((r) => extractList(r.data)),
  createEmployee: (data: any) => api.post("/hr/employees", data).then((r) => r.data),
  updateEmployee: (id: string, data: any) =>
    api.put(`/hr/employees/${id}`, data).then((r) => r.data),
  deleteEmployee: (id: string) => api.delete(`/hr/employees/${id}`).then((r) => r.data),
  bulkCreateEmployees: (data: any) => api.post("/hr/employees/bulk", data).then((r) => r.data),

  // Attendance
  getAttendance: (params?: Record<string, any>) =>
    api.get("/hr/attendance", { params }).then((r) => extractList(r.data)),
  createAttendance: (data: any) => api.post("/hr/attendance", data).then((r) => r.data),
  createBulkAttendance: (data: any) => api.post("/hr/attendance/bulk", data).then((r) => r.data),
  updateAttendance: (id: string, data: any) =>
    api.patch(`/hr/attendance/${id}`, data).then((r) => r.data),
  bulkImportAttendance: (data: any) =>
    api.post("/hr/attendance/bulk-import", data).then((r) => r.data),
  getAttendanceSummary: (params: Record<string, any>) =>
    api.get("/hr/attendance/summary", { params }).then((r) => r.data),

  // Monthly Payroll
  getPayroll: (params: Record<string, any>) =>
    api.get("/hr/payroll", { params }).then((r) => extractList(r.data)),
  calculatePayroll: (data: any) => api.post("/hr/payroll/calculate", data).then((r) => r.data),
  updatePayroll: (id: string, data: any) => api.put(`/hr/payroll/${id}`, data).then((r) => r.data),
  finalizePayroll: (data: any) => api.post("/hr/payroll/finalize", data).then((r) => r.data),

  // Leaves
  getLeaves: (params?: Record<string, any>) =>
    api.get("/hr/leaves", { params }).then((r) => extractList(r.data)),
  createLeave: (data: any) => api.post("/hr/leaves", data).then((r) => r.data),
  approveOrRejectLeave: (data: any) =>
    api.put(`/hr/leaves/${data.id}/action`, data).then((r) => r.data),
};

// Accounts
export const accountsApi = {
  getInvoices: () => api.get("/accounts/invoices").then((r: any) => extractList(r.data)),
  getReceivables: () => api.get("/accounts/receivables").then((r: any) => extractList(r.data)),
  createInvoice: (data: any) => api.post("/accounts/invoices", data).then((r) => r.data),
  updateInvoice: (id: string, data: any) =>
    api.put(`/accounts/invoices/${id}`, data).then((r) => r.data),
  deleteInvoice: (id: string) => api.delete(`/accounts/invoices/${id}`).then((r) => r.data),
};

// Maintenance
export const maintenanceApi = {
  getTasks: () => api.get("/maintenance/tasks").then((r: any) => extractList(r.data)),
  updateStatus: (id: string, data: any) =>
    api.put(`/maintenance/tasks/${id}/status`, data).then((r) => r.data),
  deleteTask: (id: string) => api.delete(`/maintenance/tasks/${id}`).then((r) => r.data),
  getSchedules: () =>
    api.get("/maintenance/schedules?page_size=500").then((r: any) => extractList(r.data)),
  deleteSchedule: (id: string) => api.delete(`/maintenance/schedules/${id}`).then((r) => r.data),
  patchSchedule: (id: string, payload: Record<string, any>) =>
    api.patch(`/maintenance/schedules/${id}`, payload).then((r) => r.data),
  markScheduleDone: (id: string) =>
    api.patch(`/maintenance/schedules/${id}/done`).then((r) => r.data),
  bulkCreateSchedules: (data: any) =>
    api.post("/maintenance/schedules/bulk", data).then((r) => r.data),
  getParameters: () => api.get("/maintenance/parameters").then((r: any) => extractList(r.data)),
  bulkCreateParameters: (data: any) =>
    api.post("/maintenance/parameters/bulk", data).then((r) => r.data),
  getManpowerSummary: () =>
    api.get("/maintenance/manpower-summary").then((r) => r.data),
  getDayPlan: (month: number, year: number, section?: string) => {
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (section) params.set("section", section);
    return api.get(`/maintenance/day-plan?${params}`).then((r) => r.data);
  },
  createEntries: (entries: any[]) =>
    api.post("/maintenance/entries", { entries }).then((r) => r.data),
  getEntries: (params: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") p.set(k, String(v)); });
    return api.get(`/maintenance/entries?${p}`).then((r) => r.data);
  },
  deleteEntry: (id: string) =>
    api.delete(`/maintenance/entries/${id}`).then((r) => r.data),
  getActivityConfig: () =>
    api.get("/maintenance/activity-config").then((r) => r.data.data as any[]),
  upsertActivityConfig: (section: string, payload: any) =>
    api.put(`/maintenance/activity-config/${encodeURIComponent(section)}`, payload).then((r) => r.data),
  getHolidays: (year?: number) =>
    api.get(`/maintenance/holidays${year ? `?year=${year}` : ""}`).then((r) => r.data.data as any[]),
  getDeptMap: () =>
    api.get("/maintenance/dept-map").then((r) => r.data as { data: any[]; schedule_departments: string[]; machine_departments: string[] }),
  addDeptMap: (schedule_dept: string, machine_dept: string) =>
    api.post("/maintenance/dept-map", { schedule_dept, machine_dept }).then((r) => r.data),
  deleteDeptMap: (id: string) =>
    api.delete(`/maintenance/dept-map/${id}`).then((r) => r.data),
  getDeptManpower: () =>
    api.get("/maintenance/dept-manpower").then((r) => r.data.data as any[]),
  upsertDeptManpower: (payload: { department: string; persons?: number | null; machines?: number | null; shift_hours?: number | null; leader?: string; notes?: string }) =>
    api.post("/maintenance/dept-manpower", payload).then((r) => r.data),
  deleteDeptManpower: (id: string) =>
    api.delete(`/maintenance/dept-manpower/${id}`).then((r) => r.data),
  upsertHoliday: (payload: { date: string; day_type: string; persons_on_leave?: number; weekly_off?: number; note?: string }) =>
    api.post("/maintenance/holidays", payload).then((r) => r.data),
  deleteHoliday: (id: string) =>
    api.delete(`/maintenance/holidays/${id}`).then((r) => r.data),
};

// Dashboard
export const dashboardApi = {
  getKpis: (millId: string) => api.get(`/dashboard/kpis?mill_id=${millId}`).then((r) => r.data),
  getSummary: () => api.get("/dashboard/summary").then((r) => r.data),
  getSetupStatus: (millId: string) =>
    api.get(`/dashboard/setup-status?mill_id=${millId}`).then((r) => r.data),
};

// Reports
export const reportsApi = {
  getSummary: () =>
    api.get("/reports/summary").then((r) => {
      const d = r.data;
      const ps = d.production_summary ?? {};
      const qs = d.quality_summary ?? {};
      const ds = d.dispatch_summary ?? {};
      const fs = d.financial_summary ?? {};
      const hs = d.hr_summary ?? {};
      const ss = d.stock_summary ?? {};
      return {
        hrSummary: {
          total_employees: hs.total_employees ?? 0,
          present_today: hs.present_today ?? 0,
          pending_leaves: hs.pending_leaves ?? 0,
        },
        stockSummary: {
          total_lots: ss.total_lots ?? 0,
          sellable_stock_kg: ss.sellable_stock_kg ?? 0,
        },
        productionSummary: {
          totalProduced: ps.total_produced ?? 0,
          totalTarget: ps.total_target ?? 0,
          avgEfficiency: ps.avg_efficiency ?? 0,
          wastePercent: ps.waste_percent ?? 0,
        },
        qualitySummary: {
          testsConducted: qs.tests_conducted ?? 0,
          passRate: qs.pass_rate ?? 0,
          failRate: qs.fail_rate ?? 0,
        },
        dispatchSummary: {
          pending: ds.pending ?? 0,
          inTransit: ds.in_transit ?? 0,
          delivered: ds.delivered ?? 0,
        },
        financialSummary: {
          salesTotal: fs.sales_total ?? 0,
          purchaseTotal: fs.purchase_total ?? 0,
          gstCollected: fs.gst_collected ?? 0,
          receivablesOutstanding: fs.receivables_outstanding ?? 0,
        },
      };
    }),
};

// QR System
export const qrApi = {
  generate: (data: any) => api.post("/qr/generate", data).then((r) => r.data),
  scan: (data: any) => api.post("/qr/scan", data).then((r) => r.data),
  verify: (data: any) => api.post("/qr/verify", data).then((r) => r.data),
  getHistory: (entityType: string, entityId: string) =>
    api.get(`/qr/history/${entityType}/${entityId}`).then((r) => r.data),
};

// Users
export const usersApi = {
  list: (params?: any) =>
    api
      .get("/users", { params: params ?? { page: 1, page_size: 100 } })
      .then((r) => extractList(r.data)),
  create: (data: any) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`).then((r) => r.data),
  resetPassword: (id: string, data: any) =>
    api.patch(`/users/${id}/reset-password`, data).then((r) => r.data),
};

// Audit
export const auditApi = {
  getLogs: (params?: any) =>
    api.get("/audit/logs", { params }).then((r: any) => extractList(r.data)),
};

// Stock Ledger
export const stockApi = {
  getSnapshot: (params?: Record<string, string>) =>
    api.get("/stock/snapshot", { params }).then((r) => extractList(r.data)),
  getLotHistory: (lotId: string, limit?: number) =>
    api.get(`/stock/lot/${lotId}/history`, { params: { limit } }).then((r) => extractList(r.data)),
  getLotBalance: (lotId: string, warehouseId: string) =>
    api
      .get(`/stock/lot/${lotId}/balance`, { params: { warehouse_id: warehouseId } })
      .then((r) => r.data),
};

// Sales Orders
export const salesApi = {
  listOrders: (params?: Record<string, string | number>) =>
    api.get("/sales/orders", { params }).then((r) => extractList(r.data)),
  createOrder: (data: any) => api.post("/sales/orders", data).then((r) => r.data),
  getOrder: (soId: string) => api.get(`/sales/orders/${soId}`).then((r) => r.data),
  confirmOrder: (soId: string) => api.post(`/sales/orders/${soId}/confirm`).then((r) => r.data),
  cancelOrder: (soId: string, reason: string) =>
    api.post(`/sales/orders/${soId}/cancel`, { reason }).then((r) => r.data),
};

// LoTrac
export const loTracApi = {
  listTrips: (params?: Record<string, string | number>) =>
    api.get("/trips", { params }).then((r) => extractList(r.data)),
  createTrip: (data: any) => api.post("/trips", data).then((r) => r.data),
  getTrip: (tripId: string) => api.get(`/trips/${tripId}`).then((r) => r.data),
  startLoading: (tripId: string) => api.post(`/trips/${tripId}/start-loading`).then((r) => r.data),
  loaderScan: (tripId: string, qrString: string, deviceInfo?: string) =>
    api
      .post(`/trips/${tripId}/loader-scan`, { qr_string: qrString, device_info: deviceInfo })
      .then((r) => r.data),
  depart: (tripId: string) => api.post(`/trips/${tripId}/depart`).then((r) => r.data),
  receiverScan: (tripId: string, qrString: string, scannedRouteId?: string, deviceInfo?: string) =>
    api
      .post(`/trips/${tripId}/receiver-scan`, {
        qr_string: qrString,
        scanned_route_id: scannedRouteId,
        device_info: deviceInfo,
      })
      .then((r) => r.data),
  confirmPod: (tripId: string, notes?: string) =>
    api.post(`/trips/${tripId}/confirm-pod`, { notes }).then((r) => r.data),
  getScanLog: (tripId: string) => api.get(`/trips/${tripId}/scan-log`).then((r) => r.data),
  generateQr: (bagId: string) => api.post(`/qr/generate/${bagId}`).then((r) => r.data),
};

// Payroll
export const payrollApi = {
  getMonths: (millId: string, year: number) =>
    api
      .get("/payroll/months", { params: { mill_id: millId, year } })
      .then((r) => extractList(r.data)),
  process: (data: { mill_id: string; month: number; year: number }) =>
    api.post("/payroll/months/process", data).then((r) => r.data),
  approve: (id: string) => api.post(`/payroll/months/${id}/approve`).then((r) => r.data),
  markPaid: (id: string) => api.post(`/payroll/months/${id}/mark-paid`).then((r) => r.data),
  getPayslips: (id: string, dept?: string) =>
    api
      .get(`/payroll/months/${id}/payslips`, { params: dept ? { department: dept } : {} })
      .then((r) => extractList(r.data)),
  getEmployeePayslip: (empId: string, month: number, year: number) =>
    api.get(`/payroll/employees/${empId}/payslip`, { params: { month, year } }).then((r) => r.data),
  getSummary: (millId: string, year: number) =>
    api
      .get("/payroll/summary", { params: { mill_id: millId, year } })
      .then((r) => extractList(r.data)),
};

// Finance
export const financeApi = {
  getPL: (millId: string, month: number, year: number) =>
    api.get("/accounts/pl", { params: { mill_id: millId, month, year } }).then((r) => r.data),
  getReceivables: (millId: string) =>
    api.get("/accounts/receivables-ageing", { params: { mill_id: millId } }).then((r) => r.data),
  getPayables: (millId: string) =>
    api.get("/accounts/payables", { params: { mill_id: millId } }).then((r) => r.data),
  getGST: (millId: string, month: number, year: number) =>
    api.get("/accounts/gst", { params: { mill_id: millId, month, year } }).then((r) => r.data),
  getCOGS: (millId: string, dateFrom: string, dateTo: string) =>
    api
      .get("/accounts/cogs", { params: { mill_id: millId, date_from: dateFrom, date_to: dateTo } })
      .then((r) => r.data),
};

// Masters — all list calls default to page_size=1000 so full data always loads
export const mastersApi = {
  getCompanies: (page = 1, pageSize = 1000, includeInactive?: boolean) =>
    api
      .get("/masters/companies", {
        params: { page, page_size: pageSize, include_inactive: includeInactive },
      })
      .then((r) => extractList(r.data)),
  getCompany: (id: string) => api.get(`/masters/companies/${id}`).then((r) => r.data),
  createCompany: (data: any) => api.post("/masters/companies", data).then((r) => r.data),
  updateCompany: (id: string, data: any) =>
    api.patch(`/masters/companies/${id}`, data).then((r) => r.data),

  getMills: (companyId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/mills", {
        params: { company_id: companyId, page, page_size: pageSize, include_inactive: true },
      })
      .then((r) => extractList(r.data)),
  getMill: (id: string) => api.get(`/masters/mills/${id}`).then((r) => r.data),
  createMill: (data: any) => api.post("/masters/mills", data).then((r) => r.data),
  updateMill: (id: string, data: any) =>
    api.patch(`/masters/mills/${id}`, data).then((r) => r.data),

  getDepartments: (millId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/departments", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => extractList(r.data)),
  getDepartment: (id: string) => api.get(`/masters/departments/${id}`).then((r) => r.data),
  createDepartment: (data: any) => api.post("/masters/departments", data).then((r) => r.data),
  updateDepartment: (id: string, data: any) =>
    api.patch(`/masters/departments/${id}`, data).then((r) => r.data),
  deleteDepartment: (id: string) => api.delete(`/masters/departments/${id}`).then((r) => r.data),

  getYarnCounts: (millId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/yarn-counts", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => extractList(r.data)),
  getYarnCount: (id: string) => api.get(`/masters/yarn-counts/${id}`).then((r) => r.data),
  createYarnCount: (data: any) => api.post("/masters/yarn-counts", data).then((r) => r.data),
  updateYarnCount: (id: string, data: any) =>
    api.patch(`/masters/yarn-counts/${id}`, data).then((r) => r.data),
  deleteYarnCount: (id: string) => api.delete(`/masters/yarn-counts/${id}`).then((r) => r.data),

  getCustomers: (millId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/customers", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => extractList(r.data)),
  getCustomer: (id: string) => api.get(`/masters/customers/${id}`).then((r) => r.data),
  createCustomer: (data: any) => api.post("/masters/customers", data).then((r) => r.data),
  updateCustomer: (id: string, data: any) =>
    api.patch(`/masters/customers/${id}`, data).then((r) => r.data),
  deactivateCustomer: (id: string) => api.delete(`/masters/customers/${id}`).then((r) => r.data),

  getVehicles: (millId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/vehicles", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => extractList(r.data)),
  getVehicle: (id: string) => api.get(`/masters/vehicles/${id}`).then((r) => r.data),
  createVehicle: (data: any) => api.post("/masters/vehicles", data).then((r) => r.data),
  updateVehicle: (id: string, data: any) =>
    api.patch(`/masters/vehicles/${id}`, data).then((r) => r.data),
  deleteVehicle: (id: string) => api.delete(`/masters/vehicles/${id}`).then((r) => r.data),

  getRoutes: (millId?: string, page = 1, pageSize = 1000) =>
    api
      .get("/masters/routes", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => extractList(r.data)),
  getRoute: (id: string) => api.get(`/masters/routes/${id}`).then((r) => r.data),
  createRoute: (data: any) => api.post("/masters/routes", data).then((r) => r.data),
  updateRoute: (id: string, data: any) =>
    api.patch(`/masters/routes/${id}`, data).then((r) => r.data),
  deleteRoute: (id: string) => api.delete(`/masters/routes/${id}`).then((r) => r.data),
};

// ── Export helpers ─────────────────────────────────────────────────────────────
function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportDownload(endpoint: string, filename: string) {
  const token = (await import("@/stores/auth")).useAuth.getState().token;
  const API_BASE = (await import("@/lib/api")).api.defaults.baseURL || "/api/v1";
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Export download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  downloadBlob(url, filename);
  URL.revokeObjectURL(url);
}

export const exportApi = {
  productionPdf: (
    dateFrom?: string,
    dateTo?: string,
    operatorGroupId?: string,
    machineGroupId?: string,
  ) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (machineGroupId) params.set("machine_group_id", machineGroupId);
    else if (operatorGroupId) params.set("operator_group_id", operatorGroupId);
    const qs = params.toString();
    return exportDownload(
      `/exports/production/pdf${qs ? `?${qs}` : ""}`,
      `production_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  },
  productionXlsx: (
    dateFrom?: string,
    dateTo?: string,
    operatorGroupId?: string,
    machineGroupId?: string,
  ) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (machineGroupId) params.set("machine_group_id", machineGroupId);
    else if (operatorGroupId) params.set("operator_group_id", operatorGroupId);
    const qs = params.toString();
    return exportDownload(
      `/exports/production/xlsx${qs ? `?${qs}` : ""}`,
      `production_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  payrollPdf: (payrollMonthId: string, employeeId?: string) => {
    const params = new URLSearchParams({ payroll_month_id: payrollMonthId });
    if (employeeId) params.set("employee_id", employeeId);
    return exportDownload(
      `/exports/payroll/pdf?${params.toString()}`,
      `payroll_${payrollMonthId.slice(0, 8)}.pdf`,
    );
  },
  payrollXlsx: (payrollMonthId: string) => {
    return exportDownload(
      `/exports/payroll/xlsx?payroll_month_id=${payrollMonthId}`,
      `payroll_${payrollMonthId.slice(0, 8)}.xlsx`,
    );
  },
  dispatchPdf: (status?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/dispatch/pdf${qs ? `?${qs}` : ""}`,
      `dispatch_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  },
  gstXlsx: (month: number, year: number) => {
    return exportDownload(
      `/exports/gst/xlsx?month=${month}&year=${year}`,
      `gst_${year}_${String(month).padStart(2, "0")}.xlsx`,
    );
  },
  qualityXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/quality/xlsx${qs ? `?${qs}` : ""}`,
      `quality_tests_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  maintenanceXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/maintenance/xlsx${qs ? `?${qs}` : ""}`,
      `maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  purchaseXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/purchase/xlsx${qs ? `?${qs}` : ""}`,
      `purchase_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  dispatchXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/dispatch/xlsx${qs ? `?${qs}` : ""}`,
      `dispatch_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  storesXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/stores/xlsx${qs ? `?${qs}` : ""}`,
      `spare_issues_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  inventoryXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/inventory/xlsx${qs ? `?${qs}` : ""}`,
      `inventory_lots_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
  attendanceXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/attendance/xlsx${qs ? `?${qs}` : ""}`,
      `attendance_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },

  // JSON endpoints — used by ExportDateRangeButton for CSV / PDF client-side generation
  productionJson: (dateFrom?: string, dateTo?: string, operatorGroupId?: string, machineGroupId?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (operatorGroupId) p.set("operator_group_id", operatorGroupId);
    if (machineGroupId) p.set("machine_group_id", machineGroupId);
    return api.get(`/exports/production/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  qualityJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/quality/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  maintenanceJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/maintenance/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  purchaseJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/purchase/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  dispatchJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/dispatch/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  storesJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/stores/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
  inventoryJson: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return api.get(`/exports/inventory/json${p.toString() ? `?${p}` : ""}`).then((r) => r.data);
  },
};

export const adminApi = {
  getRoleConfig: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/role-config`).then((r) => r.data),
  updateRoleConfig: (companyId: string, data: any) =>
    api.post(`/admin/companies/${companyId}/role-config`, data).then((r) => r.data),
  getRoleModules: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/role-modules`).then((r) => r.data),
  updateRoleModules: (companyId: string, data: any) =>
    api.post(`/admin/companies/${companyId}/role-modules`, data).then((r) => r.data),
  getPermissionSets: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/permission-sets`).then((r) => r.data),
  createPermissionSet: (companyId: string, data: any) =>
    api.post(`/admin/companies/${companyId}/permission-sets`, data).then((r) => r.data),
  updatePermissionSet: (companyId: string, psId: string, data: any) =>
    api.put(`/admin/companies/${companyId}/permission-sets/${psId}`, data).then((r) => r.data),
  getApprovalWorkflows: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/approval-workflows`).then((r) => r.data),
  createApprovalWorkflow: (companyId: string, data: any) =>
    api.post(`/admin/companies/${companyId}/approval-workflows`, data).then((r) => r.data),
  getApprovalRequests: (params?: any) =>
    api.get("/approval-requests", { params }).then((r) => r.data),
  createApprovalRequest: (data: any) => api.post("/approval-requests", data).then((r) => r.data),
  actionApprovalRequest: (id: string, data: any) =>
    api.put(`/approval-requests/${id}/action`, data).then((r) => r.data),
  getPendingApprovals: () => api.get("/approval-requests/pending").then((r) => r.data),
  getHealthStatus: () => api.get("/admin/health/status").then((r) => r.data),
  getHealthHistory: (days?: number) =>
    api.get("/admin/health/history", { params: { days: days ?? 7 } }).then((r) => r.data),
  getIncidents: (params?: any) => api.get("/admin/incidents", { params }).then((r) => r.data),
  createIncident: (data: any) => api.post("/admin/incidents", data).then((r) => r.data),
  updateIncident: (id: string, data: any) => api.patch(`/admin/incidents/${id}`, data).then((r) => r.data),
  getBackups: () => api.get("/admin/backups").then((r) => r.data),
  triggerBackup: () => api.post("/admin/backup").then((r) => r.data),
  restoreBackup: (id: string) => api.post(`/admin/backup/${id}/restore`).then((r) => r.data),
  resetColumnConfig: (table: string, millId: string) =>
    api.delete("/ui-config/columns", { params: { table, mill_id: millId } }).then((r) => r.data),
  getCompanyGrowth: (params?: any) =>
    api.get("/admin/analytics/company-growth", { params }).then((r) => r.data),
  getModuleAdoption: () => api.get("/admin/analytics/module-adoption").then((r) => r.data),
  getRetentionCohort: (params?: any) =>
    api.get("/admin/analytics/retention-cohort", { params }).then((r) => r.data),
  getMrrBreakdown: () => api.get("/admin/analytics/mrr-breakdown").then((r) => r.data),
  getCommandCenterKpi: () => api.get("/admin/command-center/kpi").then((r) => r.data),
  getFastestGrowing: () => api.get("/admin/command-center/fastest-growing").then((r) => r.data),
  getHealthScores: () => api.get("/admin/command-center/health-scores").then((r) => r.data),
  getCompanyModules: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/modules`).then((r) => r.data),
  updateCompanyModules: (companyId: string, modules: Record<string, boolean>) =>
    api.put(`/admin/companies/${companyId}/modules`, { modules }).then((r) => r.data),
  createCompanyModules: (companyId: string, modules: string[]) =>
    api
      .put(`/admin/companies/${companyId}/modules`, {
        modules: Object.fromEntries(modules.map((m) => [m, true])),
      })
      .then((r) => r.data),
  getMillSettings: (millId: string) =>
    api.get(`/admin/mills/${millId}/settings`).then((r) => r.data),
  updateMillSettings: (millId: string, settings: Record<string, any>) =>
    api.put(`/admin/mills/${millId}/settings`, settings).then((r) => r.data),
  getUserModules: (userId: string) => api.get(`/admin/users/${userId}/modules`).then((r) => r.data),
  updateUserModules: (userId: string, modules: Record<string, boolean>) =>
    api.put(`/admin/users/${userId}/modules`, { modules }).then((r) => r.data),
  suspendCompany: (companyId: string, status: "active" | "suspended") =>
    api.post(`/admin/companies/${companyId}/status`, { status }).then((r) => r.data),
  archiveCompany: (companyId: string) =>
    api.post(`/admin/companies/${companyId}/archive`).then((r) => r.data),
  restoreCompany: (companyId: string) =>
    api.post(`/admin/companies/${companyId}/restore`).then((r) => r.data),
  permanentDeleteCompany: (companyId: string, confirmCode: string) =>
    api
      .post(
        `/admin/companies/${companyId}/delete`,
        {},
        { headers: { "X-Confirm-Code": confirmCode } },
      )
      .then((r) => r.data),
  getCompanyDetail: (companyId: string) =>
    api.get(`/admin/companies/${companyId}/detail`).then((r) => r.data),
  getCompanyStats: () =>
    api.get("/admin/company-stats").then((r) => {
      const stats: any[] = Array.isArray(r.data) ? r.data : [];
      return {
        total_companies: stats.length,
        active_companies: stats.filter((s: any) => true).length,
        total_mills: stats.reduce((a: number, s: any) => a + (s.mill_count ?? 0), 0),
        total_users: stats.reduce((a: number, s: any) => a + (s.user_count ?? 0), 0),
        active_users: stats.reduce((a: number, s: any) => a + (s.active_user_count ?? 0), 0),
        company_stats: stats,
      };
    }),
  getBillingSummary: () => api.get("/admin/billing/summary").then((r) => r.data),
  getSubscriptions: (params?: any) =>
    api.get("/admin/billing/subscriptions", { params }).then((r) => r.data),
  getCompanyBillingDetail: (companyId: string) =>
    api.get(`/admin/billing/subscriptions/${companyId}`).then((r) => r.data),
  getBillingInvoices: (params?: any) =>
    api.get("/admin/billing/invoices", { params }).then((r) => r.data),
  getBillingPayments: (params?: any) =>
    api.get("/admin/billing/payments", { params }).then((r) => r.data),
  getBillingAnalytics: () => api.get("/admin/billing/analytics").then((r) => r.data),

  // Per-user module access overrides (UserModuleAccess)
  getUserModuleAccess: (userId: string) =>
    api.get(`/admin/users/${userId}/module-access`).then((r) => r.data),
  updateUserModuleAccess: (userId: string, overrides: { module: string; access_level: string }[]) =>
    api.put(`/admin/users/${userId}/module-access`, overrides).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------
export const notificationsApi = {
  getAll: (params?: { page?: number; page_size?: number; unread_only?: boolean }) =>
    api.get("/notifications", { params }).then((r) => r.data),
  getUnreadCount: () => api.get("/notifications/unread-count").then((r) => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/mark-all-read").then((r) => r.data),
  archive: (id: string) => api.post(`/notifications/${id}/archive`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Alerts API (Wave 4B Operations Center)
// ---------------------------------------------------------------------------
export const alertsApi = {
  // Alert events
  getAlerts: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    category?: string;
    severity?: string;
  }) => api.get("/alerts", { params }).then((r) => r.data),

  getAlert: (id: string) => api.get(`/alerts/${id}`).then((r) => r.data),

  getTimeline: (id: string) => api.get(`/alerts/${id}/timeline`).then((r) => r.data),

  getOpsCenterSummary: () => api.get("/alerts/ops-center").then((r) => r.data),

  getSummary: () => api.get("/alerts/summary").then((r) => r.data),

  acknowledge: (id: string, notes?: string) =>
    api.post(`/alerts/${id}/acknowledge`, { notes }).then((r) => r.data),

  acknowledgeAll: () => api.post("/alerts/acknowledge-all").then((r) => r.data),

  dismiss: (id: string) => api.patch(`/alerts/${id}/dismiss`).then((r) => r.data),

  resolve: (id: string, notes?: string) =>
    api.post(`/alerts/${id}/resolve`, { notes }).then((r) => r.data),

  // Alert rules
  getRules: (activeOnly = true) =>
    api.get("/alerts/rules", { params: { active_only: activeOnly } }).then((r) => r.data),

  createRule: (data: {
    name: string;
    category: string;
    condition_type: string;
    severity?: string;
    threshold_value?: number;
    threshold_unit?: string;
    target_roles?: string[];
    cooldown_minutes?: number;
    description?: string;
  }) => api.post("/alerts/rules", data).then((r) => r.data),

  updateRule: (
    id: string,
    data: {
      name?: string;
      is_active?: boolean;
      severity?: string;
      threshold_value?: number;
      cooldown_minutes?: number;
    },
  ) => api.patch(`/alerts/rules/${id}`, data).then((r) => r.data),

  deleteRule: (id: string) => api.delete(`/alerts/rules/${id}`).then((r) => r.data),

  seedRules: (companyId?: string) =>
    api
      .post("/alerts/seed", null, { params: companyId ? { company_id: companyId } : undefined })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Upload API
// ---------------------------------------------------------------------------
export const uploadApi = {
  upload: (entityType: string, entityId: string, file: File) => {
    const fd = new FormData();
    fd.append("entity_type", entityType);
    fd.append("entity_id", entityId);
    fd.append("file", file);
    return api
      .post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  listAttachments: (entityType: string, entityId: string) =>
    api.get(`/attachments/${entityType}/${entityId}`).then((r) => extractList(r.data)),
  deleteAttachment: (id: string) => api.delete(`/attachments/${id}`).then((r) => r.data),
};
