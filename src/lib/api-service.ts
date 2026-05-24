import { api } from "@/lib/api";
import type { Role } from "@/lib/rbac";

// Extracts .data array from paginated responses; returns raw data otherwise
const extractList = (r: any) => (r.data && Array.isArray(r.data.data) ? r.data.data : r.data);

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
          },
        };
      }),
  logout: () => api.post("/auth/logout"),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refresh_token: refreshToken }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
};

// Production
export const productionApi = {
  getMachines: () => api.get("/production/machines").then(extractList),
  createMachine: (data: any) => api.post("/production/machines", data).then((r) => r.data),
  getEntries: () => api.get("/production/entries").then(extractList),
  createEntry: (data: any) => api.post("/production/entries", data).then((r) => r.data),
  getDowntime: () => api.get("/production/downtime").then(extractList),
  createDowntime: (data: any) => api.post("/production/downtime", data).then((r) => r.data),
  approveEntry: (id: string) => api.put(`/production/entries/${id}/approve`).then((r) => r.data),
  getShifts: () => api.get("/production/shifts").then(extractList),
  createShift: (data: any) => api.post("/production/shifts", data).then((r) => r.data),
};

// Quality
export const qualityApi = {
  getTests: () => api.get("/quality/tests").then(extractList),
  createTest: (data: any) => api.post("/quality/tests", data).then((r) => r.data),
  getApprovals: () => api.get("/quality/approvals").then(extractList),
  approveOrReject: (data: any) => api.post("/quality/approvals/action", data).then((r) => r.data),
  getRejections: () => api.get("/quality/rejections").then(extractList),
};

// Inventory
export const inventoryApi = {
  getLots: () => api.get("/inventory/lots").then(extractList),
  getTransfers: () => api.get("/inventory/transfers").then(extractList),
  createTransfer: (data: any) => api.post("/inventory/transfers", data).then((r) => r.data),
  getWarehouses: () => api.get("/inventory/warehouses").then(extractList),
  createWarehouse: (data: any) => api.post("/inventory/warehouses", data).then((r) => r.data),
};

// Dispatch
export const dispatchApi = {
  getOrders: () => api.get("/dispatch/orders").then(extractList),
  createOrder: (data: any) => api.post("/dispatch/orders", data).then((r) => r.data),
  updateStatus: (id: string, data: any) =>
    api.put(`/dispatch/orders/${id}/status`, data).then((r) => r.data),
};

// Purchase
export const purchaseApi = {
  getPurchases: () => api.get("/purchase/purchases").then(extractList),
  createPurchase: (data: any) => api.post("/purchase/purchases", data).then((r) => r.data),
  getSuppliers: () => api.get("/purchase/suppliers").then(extractList),
  getGRNs: () => api.get("/purchase/grns").then(extractList),
};

// Stores
export const storesApi = {
  getSpares: () => api.get("/stores/spares").then(extractList),
  getIssues: () => api.get("/stores/issues").then(extractList),
  createIssue: (data: any) => api.post("/stores/issues", data).then((r) => r.data),
};

// HR
export const hrApi = {
  getEmployees: () =>
    api.get("/hr/employees").then((r) => ("data" in r.data ? r.data.data : r.data)),
  createEmployee: (data: any) => api.post("/hr/employees", data).then((r) => r.data),
  getAttendance: () =>
    api.get("/hr/attendance").then((r) => ("data" in r.data ? r.data.data : r.data)),
  createAttendance: (data: any) => api.post("/hr/attendance", data).then((r) => r.data),
  createBulkAttendance: (data: any) => api.post("/hr/attendance/bulk", data).then((r) => r.data),
  updateAttendance: (id: string, data: any) =>
    api.patch(`/hr/attendance/${id}`, data).then((r) => r.data),
  getLeaves: () => api.get("/hr/leaves").then((r) => ("data" in r.data ? r.data.data : r.data)),
  createLeave: (data: any) => api.post("/hr/leaves", data).then((r) => r.data),
  approveOrRejectLeave: (data: any) =>
    api.put(`/hr/leaves/${data.id}/action`, data).then((r) => r.data),
};

// Accounts
export const accountsApi = {
  getInvoices: () => api.get("/accounts/invoices").then(extractList),
  getReceivables: () => api.get("/accounts/receivables").then(extractList),
};

// Maintenance
export const maintenanceApi = {
  getTasks: () => api.get("/maintenance/tasks").then(extractList),
  updateStatus: (id: string, data: any) =>
    api.put(`/maintenance/tasks/${id}/status`, data).then((r) => r.data),
};

// Dashboard
export const dashboardApi = {
  getKpis: (millId: string) => api.get(`/dashboard/kpis?mill_id=${millId}`).then((r) => r.data),
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
      return {
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
  list: () => api.get("/users").then((r) => r.data?.data ?? r.data),
  create: (data: any) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`).then((r) => r.data),
  resetPassword: (id: string, data: any) =>
    api.patch(`/users/${id}/reset-password`, data).then((r) => r.data),
};

// Audit
export const auditApi = {
  getLogs: (params?: any) => api.get("/audit/logs", { params }).then(extractList),
};

// Stock Ledger
export const stockApi = {
  getSnapshot: (params?: Record<string, string>) =>
    api.get("/stock/snapshot", { params }).then((r) => r.data),
  getLotHistory: (lotId: string, limit?: number) =>
    api.get(`/stock/lot/${lotId}/history`, { params: { limit } }).then((r) => r.data),
  getLotBalance: (lotId: string, warehouseId: string) =>
    api
      .get(`/stock/lot/${lotId}/balance`, { params: { warehouse_id: warehouseId } })
      .then((r) => r.data),
};

// Sales Orders
export const salesApi = {
  listOrders: (params?: Record<string, string | number>) =>
    api.get("/sales/orders", { params }).then((r) => r.data),
  createOrder: (data: any) => api.post("/sales/orders", data).then((r) => r.data),
  getOrder: (soId: string) => api.get(`/sales/orders/${soId}`).then((r) => r.data),
  confirmOrder: (soId: string) => api.post(`/sales/orders/${soId}/confirm`).then((r) => r.data),
  cancelOrder: (soId: string, reason: string) =>
    api.post(`/sales/orders/${soId}/cancel`, { reason }).then((r) => r.data),
};

// LoTrac
export const loTracApi = {
  listTrips: (params?: Record<string, string | number>) =>
    api.get("/trips", { params }).then((r) => r.data),
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
    api.get("/payroll/months", { params: { mill_id: millId, year } }).then((r) => r.data),
  process: (data: { mill_id: string; month: number; year: number }) =>
    api.post("/payroll/months/process", data).then((r) => r.data),
  approve: (id: string) => api.post(`/payroll/months/${id}/approve`).then((r) => r.data),
  markPaid: (id: string) => api.post(`/payroll/months/${id}/mark-paid`).then((r) => r.data),
  getPayslips: (id: string, dept?: string) =>
    api
      .get(`/payroll/months/${id}/payslips`, { params: dept ? { department: dept } : {} })
      .then((r) => r.data),
  getEmployeePayslip: (empId: string, month: number, year: number) =>
    api.get(`/payroll/employees/${empId}/payslip`, { params: { month, year } }).then((r) => r.data),
  getSummary: (millId: string, year: number) =>
    api.get("/payroll/summary", { params: { mill_id: millId, year } }).then((r) => r.data),
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

// Masters
export const mastersApi = {
  getCompanies: (page = 1, pageSize = 20) =>
    api.get("/masters/companies", { params: { page, page_size: pageSize } }).then((r) => r.data),
  getCompany: (id: string) => api.get(`/masters/companies/${id}`).then((r) => r.data),
  createCompany: (data: any) => api.post("/masters/companies", data).then((r) => r.data),
  updateCompany: (id: string, data: any) =>
    api.patch(`/masters/companies/${id}`, data).then((r) => r.data),

  getMills: (companyId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/mills", { params: { company_id: companyId, page, page_size: pageSize } })
      .then((r) => r.data),
  getMill: (id: string) => api.get(`/masters/mills/${id}`).then((r) => r.data),
  createMill: (data: any) => api.post("/masters/mills", data).then((r) => r.data),
  updateMill: (id: string, data: any) =>
    api.patch(`/masters/mills/${id}`, data).then((r) => r.data),

  getDepartments: (millId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/departments", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => r.data),
  getDepartment: (id: string) => api.get(`/masters/departments/${id}`).then((r) => r.data),
  createDepartment: (data: any) => api.post("/masters/departments", data).then((r) => r.data),
  updateDepartment: (id: string, data: any) =>
    api.patch(`/masters/departments/${id}`, data).then((r) => r.data),

  getYarnCounts: (millId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/yarn-counts", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => r.data),
  getYarnCount: (id: string) => api.get(`/masters/yarn-counts/${id}`).then((r) => r.data),
  createYarnCount: (data: any) => api.post("/masters/yarn-counts", data).then((r) => r.data),
  updateYarnCount: (id: string, data: any) =>
    api.patch(`/masters/yarn-counts/${id}`, data).then((r) => r.data),

  getCustomers: (millId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/customers", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => r.data),
  getCustomer: (id: string) => api.get(`/masters/customers/${id}`).then((r) => r.data),
  createCustomer: (data: any) => api.post("/masters/customers", data).then((r) => r.data),
  updateCustomer: (id: string, data: any) =>
    api.patch(`/masters/customers/${id}`, data).then((r) => r.data),
  deactivateCustomer: (id: string) => api.delete(`/masters/customers/${id}`).then((r) => r.data),

  getVehicles: (millId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/vehicles", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => r.data),
  getVehicle: (id: string) => api.get(`/masters/vehicles/${id}`).then((r) => r.data),
  createVehicle: (data: any) => api.post("/masters/vehicles", data).then((r) => r.data),
  updateVehicle: (id: string, data: any) =>
    api.patch(`/masters/vehicles/${id}`, data).then((r) => r.data),

  getRoutes: (millId?: string, page = 1, pageSize = 20) =>
    api
      .get("/masters/routes", { params: { mill_id: millId, page, page_size: pageSize } })
      .then((r) => r.data),
  getRoute: (id: string) => api.get(`/masters/routes/${id}`).then((r) => r.data),
  createRoute: (data: any) => api.post("/masters/routes", data).then((r) => r.data),
  updateRoute: (id: string, data: any) =>
    api.patch(`/masters/routes/${id}`, data).then((r) => r.data),
};

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
  productionPdf: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return exportDownload(
      `/exports/production/pdf${qs ? `?${qs}` : ""}`,
      `production_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  },
  productionXlsx: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
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
};

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
    api.get(`/attachments/${entityType}/${entityId}`).then((r) => r.data),
  deleteAttachment: (id: string) => api.delete(`/attachments/${id}`).then((r) => r.data),
};
