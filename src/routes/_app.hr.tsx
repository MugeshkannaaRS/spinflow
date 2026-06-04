import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { validateForm } from "@/lib/formValidation";
import { api } from "@/lib/api";
import { hrApi, uploadApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Plus,
  Users,
  CalendarCheck,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  UserPlus,
  ArrowDownToLine,
  Search,
  Pencil,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Eye,
} from "lucide-react";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useMillMasters } from "@/hooks/useMillConfig";

export const Route = createFileRoute("/_app/hr")({
  head: () => ({ meta: [{ title: "HR — SpinFlow ERP" }] }),
  component: HRPage,
});

// ─── Types ──────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
  is_active: boolean;
  employee_id?: string;
  sl_no?: number;
  date_of_joining?: string;
  date_of_birth?: string;
  dob?: string;
  age?: number;
  gender?: string;
  gen?: string;
  grade?: string;
  designation?: string;
  shift?: string;
  section?: string;
  bank_account?: string;
  bank_account_no?: string;
  basic?: number;
  house_rent?: number;
  medical?: number;
  conveyance?: number;
  food_allowance?: number;
  mobile_bill?: number;
  shift_benefit?: number;
  wages?: number;
  increment?: number;
  wages_of_month?: number;
  total_salary?: number;
  days_of_month?: number;
  [key: string]: any;
}

interface AttendanceRow {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  shift: string;
  date: string;
  status: string;
  check_in: string;
  check_out: string;
  overtime_hours: number;
}

interface LeaveRow {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  approved_by: string;
}

interface PayrollRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  basic: number;
  payable_days: number;
  payable_salary: number;
  ot_hours: number;
  ot_amount: number;
  attendance_bonus: number;
  arrear_others: number;
  shift_amount: number;
  roster_amount: number;
  festival_duty_benefit: number;
  festival_holiday_allowance: number;
  ifter_allowance: number;
  special_food: number;
  mobile_bill: number;
  absent_deduction: number;
  advance_deduction: number;
  tax_deduction: number;
  net_payable: number;
  is_finalized: boolean;
  [key: string]: any;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

// Fallback departments — replaced at runtime by mill-specific data
const DEPARTMENTS_FALLBACK = [
  "Spinning", "Weaving", "Processing", "Packaging",
  "Maintenance", "Stores", "Admin",
];
// Module-level alias used by subcomponents (overridden inside HRPage via dynamic data)
let DEPARTMENTS: string[] = DEPARTMENTS_FALLBACK;
const SHIFTS = ["A", "B", "C", "General"];
const GRADES = ["1", "2", "3", "4", "5", "6"];
const ATTENDANCE_STATUSES = ["P", "A", "H", "CL", "SL", "EL", "OD", "WO"];
const LEAVE_TYPES = ["CL", "SL", "PL", "LOP", "EL"];

function formatDate(d: string | Date): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCurrency(n: number | undefined | null): string {
  const val = n ?? 0;
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcAge(dob: string): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Main Page ──────────────────────────────────────────────────────────────────

function HRPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "hr");
  const { millId } = useActiveMill();
  const { data: millMasters } = useMillMasters();
  // Update module-level DEPARTMENTS so subcomponents pick up dynamic values
  if (millMasters?.department_names?.length) {
    DEPARTMENTS = millMasters.department_names;
  }
  const GRADES_DYN = (millMasters?.grade?.length ? millMasters.grade : GRADES);
  const SHIFTS_DYN = (millMasters?.shift?.length ? millMasters.shift : SHIFTS);
  const qc = useQueryClient();

  const [tab, setTab] = useState("employees");

  const empQ = useQuery({
    queryKey: ["hr-employees", millId],
    queryFn: () => hrApi.getEmployees({ page_size: 1000, mill_id: millId }),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const attQ = useQuery({
    queryKey: ["hr-attendance-all", millId],
    queryFn: () => hrApi.getAttendance({ mill_id: millId }),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const leaveQ = useQuery({
    queryKey: ["hr-leaves", millId],
    queryFn: () => hrApi.getLeaves({ mill_id: millId }),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const employees: EmployeeRow[] = Array.isArray(empQ.data) ? empQ.data : (empQ.data?.data ?? []);
  const attendance: AttendanceRow[] = Array.isArray(attQ.data) ? attQ.data : (attQ.data?.data ?? []);
  const leaves: LeaveRow[] = Array.isArray(leaveQ.data) ? leaveQ.data : (leaveQ.data?.data ?? []);

  const activeEmployees = employees.filter((e) => e.is_active).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPresent = attendance.filter((a) => a.date === todayStr && a.status === "present").length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const todayAbsent = attendance.filter((a) => a.date === todayStr && a.status === "absent").length;

  if (!user) return null;

  if (empQ.isLoading)
    return (
      <>
        <PageHeader title="Human Resources" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (empQ.isError)
    return (
      <>
        <PageHeader title="Human Resources" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Human Resources"
        subtitle="Employees, Attendance, Payroll & Leave Management"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["hr-employees"] })}
        isRefreshing={empQ.isFetching}
      />
      <AccessGuard module="hr">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Active Employees</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  {activeEmployees}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Present Today</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <UserCheck className="size-5 text-success" />
                  {todayPresent}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Pending Leaves</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <CalendarCheck className="size-5 text-warning" />
                  {pendingLeaves}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Absent Today</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Clock className="size-5 text-destructive" />
                  {todayAbsent}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="payroll">Payroll</TabsTrigger>
              <TabsTrigger value="leaves">Leaves</TabsTrigger>
            </TabsList>

            <TabsContent value="employees">
              <EmployeesTab employees={employees} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="attendance">
              <AttendanceTab employees={employees} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="payroll">
              <PayrollTab employees={employees} canEdit={canEdit} millId={millId!} userRole={user.role} />
            </TabsContent>

            <TabsContent value="leaves">
              <LeavesTab employees={employees} leaves={leaves} canEdit={canEdit} user={user} />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════════

function EmployeesTab({ employees, canEdit }: { employees: EmployeeRow[]; canEdit: boolean }) {
  const empColConfig = useColumnConfig("hr_employees");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeRow | null>(null);
  const [detailEmp, setDetailEmp] = useState<EmployeeRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const COLUMN_GROUPS: { key: string; label: string; columns: string[] }[] = [
    { key: "personal", label: "Personal", columns: ["sl_no", "code", "name", "dob", "age", "gender"] },
    { key: "job", label: "Job", columns: ["department", "designation", "section", "grade"] },
    { key: "salary", label: "Salary", columns: ["basic", "wages", "total_salary"] },
    { key: "allowances", label: "Allowances", columns: ["house_rent", "medical", "conveyance", "food_allowance", "mobile_bill", "increment", "shift_benefit"] },
    { key: "monthly", label: "Monthly", columns: ["joining_date", "bank_account_no", "days_of_month"] },
  ];

  const stored = typeof window !== "undefined" ? localStorage.getItem("hr-column-groups") : null;
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set(stored ? JSON.parse(stored) : ["personal", "job", "salary"]));

  useEffect(() => {
    localStorage.setItem("hr-column-groups", JSON.stringify([...visibleGroups]));
  }, [visibleGroups]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.name?.toLowerCase().includes(q) &&
          !e.code?.toLowerCase().includes(q) &&
          !e.department?.toLowerCase().includes(q) &&
          !e.designation?.toLowerCase().includes(q)
        )
          return false;
      }
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (gradeFilter !== "all" && e.grade !== gradeFilter) return false;
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      return true;
    });
  }, [employees, search, deptFilter, gradeFilter, statusFilter]);

  const handleEdit = (emp: EmployeeRow) => {
    setEditingEmp(emp);
    setEditOpen(true);
  };

  const handleView = (emp: EmployeeRow) => {
    setDetailEmp(emp);
    setDetailOpen(true);
  };

  const handleDeactivate = async (emp: EmployeeRow) => {
    if (!confirm(`Deactivate ${emp.name}?`)) return;
    try {
      await hrApi.updateEmployee(emp.id, { is_active: false });
      toast.success("Employee deactivated");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
    } catch {
      toast.error("Failed to deactivate employee");
    }
  };

  const currencyRender = (v: number | undefined | null) =>
    v != null ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : "—";

  const dateRender = (d: string | undefined | null) => d ? formatDate(d) : "—";

  const alwaysCols: ColDef<EmployeeRow>[] = [
    { key: "sl_no", label: empColConfig.getLabel('sl_no'), className: "w-14", render: (e) => <span className="text-xs text-muted-foreground">{e.sl_no ?? e.employee_id ?? ""}</span> },
    { key: "code", label: empColConfig.getLabel('code'), className: "font-mono text-xs", render: (e) => <span className="font-mono text-xs">{e.code || ""}</span> },
    { key: "name", label: empColConfig.getLabel('name'), render: (e) => <span className="font-medium">{e.name || ""}</span> },
    { key: "department", label: empColConfig.getLabel('department') },
    { key: "designation", label: empColConfig.getLabel('designation'), render: (e) => e.designation ?? e.role ?? "—" },
    { key: "grade", label: empColConfig.getLabel('grade'), render: (e) => e.grade ?? "—" },
    { key: "gen", label: empColConfig.getLabel('gen'), render: (e) => e.gen ?? "—" },
    { key: "basic", label: empColConfig.getLabel('basic'), type: "number", render: (e) => currencyRender(e.basic) },
    { key: "wages", label: empColConfig.getLabel('wages'), type: "number", render: (e) => currencyRender(e.wages) },
    { key: "total_salary", label: empColConfig.getLabel('total_salary'), type: "number", render: (e) => currencyRender(e.total_salary) },
    { key: "is_active", label: empColConfig.getLabel('is_active') || "Status", type: "status", render: (e) => <StatusBadge status={e.is_active ? "active" : "inactive"} /> },
  ];

  const groupColMap: Record<string, ColDef<EmployeeRow>[]> = {
    allowances: [
      { key: "house_rent", label: empColConfig.getLabel('house_rent'), type: "number", render: (e) => currencyRender(e.house_rent) },
      { key: "medical", label: empColConfig.getLabel('medical'), type: "number", render: (e) => currencyRender(e.medical) },
      { key: "conveyance", label: empColConfig.getLabel('conveyance'), type: "number", render: (e) => currencyRender(e.conveyance) },
      { key: "food_allowance", label: empColConfig.getLabel('food_allowance'), type: "number", render: (e) => currencyRender(e.food_allowance) },
      { key: "mobile_bill", label: empColConfig.getLabel('mobile_bill'), type: "number", render: (e) => currencyRender(e.mobile_bill) },
      { key: "increment", label: empColConfig.getLabel('increment'), type: "number", render: (e) => currencyRender(e.increment) },
      { key: "shift_benefit", label: empColConfig.getLabel('shift_benefit'), type: "number", render: (e) => currencyRender(e.shift_benefit) },
    ],
    monthly: [
      { key: "joining_date", label: empColConfig.getLabel('joining_date'), type: "date", render: (e) => dateRender(e.date_of_joining) },
      { key: "dob", label: empColConfig.getLabel('dob'), type: "date", render: (e) => dateRender(e.dob) },
      { key: "age", label: empColConfig.getLabel('age'), type: "number", render: (e) => e.age ?? (e.date_of_birth ? calcAge(e.date_of_birth) : "—") },
      { key: "gender", label: empColConfig.getLabel('gender') },
      { key: "section", label: empColConfig.getLabel('section') },
      { key: "bank_account_no", label: empColConfig.getLabel('bank_account_no') },
      { key: "days_of_month", label: empColConfig.getLabel('days_of_month'), type: "number", render: (e) => e.days_of_month ?? 26 },
    ],
  };

  const groupColumns = useMemo(() => {
    const cols: ColDef<EmployeeRow>[] = [];
    COLUMN_GROUPS.forEach((g) => {
      if (visibleGroups.has(g.key) && groupColMap[g.key]) {
        cols.push(...groupColMap[g.key]);
      }
    });
    return cols;
  }, [visibleGroups]);

  const dataTableColumns = useMemo(() => [...alwaysCols, ...groupColumns], [groupColumns]);

  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter((d): d is string => !!d))].sort(), [employees]);
  const grades = useMemo(() => [...new Set(employees.map((e) => e.grade).filter((g): g is string => !!g))].sort(), [employees]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {depts.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {grades.map((g) => (<SelectItem key={g} value={g}>Grade {g}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {canEdit && <AddEmployeeSheet employees={employees} />}
        {canEdit && <ImportEmployeeDialog />}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings2 className="size-4 mr-1" />
              Groups
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="end">
            <p className="text-xs font-medium text-muted-foreground mb-2">Column Groups</p>
            <div className="space-y-2">
              {COLUMN_GROUPS.map((g) => (
                <label key={g.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={visibleGroups.has(g.key)}
                    onCheckedChange={() => {
                      const next = new Set(visibleGroups);
                      if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                      setVisibleGroups(next);
                    }}
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <DataTable
        tableId="hr_employees"
        columns={dataTableColumns}
        data={filtered}
        loading={false}
        rowKey={(e) => e.id}
        onRowClick={handleView}
        exportFilename="hr_employees"
        actions={(e) => (
          <div className="flex gap-1">
            {canEdit && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(e)} title="Edit">
                <Pencil className="size-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleView(e)} title="View">
              <Eye className="size-3.5" />
            </Button>
            {canEdit && e.is_active && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeactivate(e)} title="Deactivate">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      />

      {editOpen && editingEmp && (
        <EditEmployeeSheet open={editOpen} onOpenChange={setEditOpen} employee={editingEmp} />
      )}
      {detailOpen && detailEmp && (
        <EmployeeDetailSheet open={detailOpen} onOpenChange={setDetailOpen} employee={detailEmp} />
      )}
    </div>
  );
}

// ─── Employee Detail Sheet ───────────────────────────────────────────────────────

interface CustomValueItem {
  field_name: string;
  field_type: string;
  value: string | null;
}

function EmployeeDetailSheet({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (v: boolean) => void; employee: EmployeeRow }) {
  const { millId } = useActiveMill();
  const empColConfig = useColumnConfig("hr_employees");
  const [payrollTab, setPayrollTab] = useState("personal");

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const { data: payrollData } = useQuery({
    queryKey: ["hr-payroll-employee", employee.id, curMonth, curYear, millId],
    queryFn: () => hrApi.getPayroll({ employee_id: employee.id, month: curMonth, year: curYear, mill_id: millId }).then((r: any) => r.data?.[0]),
    enabled: open,
    staleTime: 30_000,
  });

  const { data: empDetail } = useQuery({
    queryKey: ["hr-employee-detail", employee.id],
    queryFn: () => api.get(`/hr/employees/${employee.id}`).then((r: any) => r.data),
    enabled: open && !!employee.id,
    staleTime: 30_000,
  });

  const customValues: CustomValueItem[] = empDetail?.custom_values ?? [];

  const Field = ({ label, value }: { label: string; value: string | number | undefined | null }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "-"}</p>
    </div>
  );

  const Currency = ({ label, value }: { label: string; value: number | undefined | null }) => (
    <Field label={label} value={value != null ? formatCurrency(value) : "₹0.00"} />
  );

  const p = payrollData as any;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{employee.name}</SheetTitle>
          <p className="text-xs text-muted-foreground">{employee.code} · {employee.department}</p>
        </SheetHeader>
        <div className="flex gap-2 border-b pb-2 mt-4">
          <button type="button" onClick={() => setPayrollTab("personal")} className={cn("px-3 py-1 text-sm rounded", payrollTab === "personal" ? "bg-primary text-primary-foreground" : "bg-muted")}>Personal Info</button>
          <button type="button" onClick={() => setPayrollTab("salary")} className={cn("px-3 py-1 text-sm rounded", payrollTab === "salary" ? "bg-primary text-primary-foreground" : "bg-muted")}>Salary Structure</button>
          <button type="button" onClick={() => setPayrollTab("monthly")} className={cn("px-3 py-1 text-sm rounded", payrollTab === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted")}>Monthly Data</button>
          {customValues.length > 0 && (
            <button type="button" onClick={() => setPayrollTab("custom")} className={cn("px-3 py-1 text-sm rounded", payrollTab === "custom" ? "bg-primary text-primary-foreground" : "bg-muted")}>Additional Info</button>
          )}
        </div>

        {payrollTab === "personal" && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <Field label={empColConfig.getLabel('sl_no')} value={employee.sl_no} />
            <Field label={empColConfig.getLabel('employee_id')} value={employee.employee_id ?? employee.code} />
            <Field label={empColConfig.getLabel('name')} value={employee.name} />
            <Field label={empColConfig.getLabel('dob')} value={employee.dob ? formatDate(employee.dob) : employee.date_of_birth ? formatDate(employee.date_of_birth) : "-"} />
            <Field label={empColConfig.getLabel('age')} value={employee.age ?? (employee.date_of_birth ? calcAge(employee.date_of_birth) : "-")} />
            <Field label={empColConfig.getLabel('gender')} value={employee.gender ?? "-"} />
            <Field label={empColConfig.getLabel('grade')} value={employee.grade ?? "-"} />
            <Field label={empColConfig.getLabel('gen')} value={employee.gen ?? "-"} />
            <Field label={empColConfig.getLabel('joining_date')} value={employee.date_of_joining ? formatDate(employee.date_of_joining) : "-"} />
            <Field label={empColConfig.getLabel('section')} value={employee.section ?? "-"} />
            <Field label={empColConfig.getLabel('department')} value={employee.department ?? "-"} />
            <Field label={empColConfig.getLabel('designation')} value={employee.designation ?? employee.role ?? "-"} />
            <Field label={empColConfig.getLabel('phone')} value={employee.phone ?? "-"} />
            <Field label={empColConfig.getLabel('bank_account_no')} value={employee.bank_account_no ?? employee.bank_account ?? "-"} />
            <Field label={empColConfig.getLabel('shift')} value={employee.shift ?? "General"} />
          </div>
        )}

        {payrollTab === "salary" && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <Currency label={empColConfig.getLabel('basic')} value={employee.basic} />
            <Currency label={empColConfig.getLabel('house_rent')} value={employee.house_rent} />
            <Currency label={empColConfig.getLabel('medical')} value={employee.medical} />
            <Currency label={empColConfig.getLabel('conveyance')} value={employee.conveyance} />
            <Currency label={empColConfig.getLabel('food_allowance')} value={employee.food_allowance} />
            <Currency label={empColConfig.getLabel('wages')} value={employee.wages} />
            <Currency label={empColConfig.getLabel('increment')} value={employee.increment} />
            <Currency label={empColConfig.getLabel('total_salary')} value={employee.total_salary} />
            <Currency label={empColConfig.getLabel('mobile_bill')} value={employee.mobile_bill} />
            <Currency label={empColConfig.getLabel('shift_benefit')} value={employee.shift_benefit} />
            <Field label={empColConfig.getLabel('days_of_month')} value={employee.days_of_month ?? 26} />
            <Currency label={empColConfig.getLabel('wages_of_month')} value={employee.wages_of_month} />
          </div>
        )}

        {payrollTab === "custom" && customValues.length > 0 && (
          <div className="py-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Additional Information</p>
            <div className="grid grid-cols-2 gap-4">
              {customValues.map((cv) => (
                <Field key={cv.field_name} label={cv.field_name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} value={cv.value} />
              ))}
            </div>
          </div>
        )}

        {payrollTab === "monthly" && (
          <div className="space-y-4 py-4">
            {p ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label={empColConfig.getLabel('days_of_month')} value={p.days_of_month} />
                  <Field label={empColConfig.getLabel('calculate_days')} value={p.calculate_days} />
                  <Field label={empColConfig.getLabel('actual_attendance')} value={p.actual_attendance} />
                  <Field label={empColConfig.getLabel('day_off')} value={p.day_off} />
                  <Field label={empColConfig.getLabel('cl')} value={p.cl} />
                  <Field label={empColConfig.getLabel('sl')} value={p.sl} />
                  <Field label={empColConfig.getLabel('el')} value={p.el} />
                  <Field label={empColConfig.getLabel('comp_leave')} value={p.comp_leave} />
                  <Field label={empColConfig.getLabel('festival_holiday')} value={p.festival_holiday} />
                  <Field label={empColConfig.getLabel('absent_days')} value={p.absent_days} />
                  <Field label={empColConfig.getLabel('payable_days')} value={p.payable_days} />
                  <Field label={empColConfig.getLabel('payable_salary')} value={p.payable_salary != null ? formatCurrency(p.payable_salary) : "-"} />
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-3">
                  <Field label={empColConfig.getLabel('ot_hours')} value={p.ot_hours} />
                  <Field label={empColConfig.getLabel('ot_amount')} value={p.ot_amount != null ? formatCurrency(p.ot_amount) : "-"} />
                  <Field label={empColConfig.getLabel('attendance_bonus')} value={p.attendance_bonus != null ? formatCurrency(p.attendance_bonus) : "-"} />
                  <Field label={empColConfig.getLabel('festival_duty_benefit')} value={p.festival_duty_benefit != null ? formatCurrency(p.festival_duty_benefit) : "-"} />
                  <Field label={empColConfig.getLabel('festival_holiday_allowance')} value={p.festival_holiday_allowance != null ? formatCurrency(p.festival_holiday_allowance) : "-"} />
                  <Field label={empColConfig.getLabel('ifter_days')} value={p.ifter_days} />
                  <Field label={empColConfig.getLabel('ifter_allowance')} value={p.ifter_allowance != null ? formatCurrency(p.ifter_allowance) : "-"} />
                  <Field label={empColConfig.getLabel('special_food')} value={p.special_food != null ? formatCurrency(p.special_food) : "-"} />
                  <Field label={empColConfig.getLabel('arrear_others')} value={p.arrear_others != null ? formatCurrency(p.arrear_others) : "-"} />
                  <Field label={empColConfig.getLabel('shift_qty')} value={p.shift_qty} />
                  <Field label={empColConfig.getLabel('shift_amount')} value={p.shift_amount != null ? formatCurrency(p.shift_amount) : "-"} />
                  <Field label={empColConfig.getLabel('roster_qty')} value={p.roster_qty} />
                  <Field label={empColConfig.getLabel('roster_amount')} value={p.roster_amount != null ? formatCurrency(p.roster_amount) : "-"} />
                  <Field label={empColConfig.getLabel('absent_deduction')} value={p.absent_deduction != null ? formatCurrency(p.absent_deduction) : "-"} />
                  <Field label={empColConfig.getLabel('advance_deduction')} value={p.advance_deduction != null ? formatCurrency(p.advance_deduction) : "-"} />
                  <Field label={empColConfig.getLabel('tax_deduction')} value={p.tax_deduction != null ? formatCurrency(p.tax_deduction) : "-"} />
                </div>
                <Separator />
                <div className="flex justify-between items-center p-3 bg-muted rounded-md">
                  <span className="text-sm font-semibold">{empColConfig.getLabel('net_payable')}</span>
                  <span className="text-lg font-bold text-primary">{p.net_payable != null ? formatCurrency(p.net_payable) : "-"}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No payroll data for current month. Calculate payroll in the Payroll tab.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Add Employee Sheet ─────────────────────────────────────────────────────────

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

function AddEmployeeSheet({ employees }: { employees: EmployeeRow[] }) {
  const empColConfig = useColumnConfig("hr_employees");
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const millId = user?.millId ?? "";
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"personal" | "job" | "salary">("personal");

  const [form, setForm] = useState({
    sl_no: 0,
    employee_id: "",
    employee_code: "",
    full_name: "",
    date_of_birth: "",
    age: 0,
    gender: "",
    grade: "",
    gen: "",
    date_of_joining: new Date().toISOString().slice(0, 10),
    designation: "",
    section: "",
    department: "",
    shift: "General",
    phone: "",
    bank_account: "",
    basic: 0,
    house_rent: 0,
    medical: 0,
    conveyance: 0,
    food_allowance: 0,
    mobile_bill: 0,
    shift_benefit: 0,
    wages: 0,
    increment: 0,
    days_of_month: 30,
  });

  const nextSlNo = employees.length > 0 ? Math.max(...employees.map((e) => e.sl_no ?? 0)) + 1 : 1;

  const totalSalary = form.basic + form.house_rent + form.medical + form.conveyance +
    form.food_allowance + form.mobile_bill + form.shift_benefit;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm((prev) => ({ ...prev, age: form.date_of_birth ? calcAge(form.date_of_birth) : 0 }));
  }, [form.date_of_birth]);

  useEffect(() => {
    if (open) {
      setSection("personal");
      setForm({
        sl_no: nextSlNo,
        employee_id: "",
        employee_code: "",
        full_name: "",
        date_of_birth: "",
        age: 0,
        gender: "",
        grade: "",
        gen: "",
        date_of_joining: new Date().toISOString().slice(0, 10),
        designation: "",
        section: "",
        department: "",
        shift: "General",
        phone: "",
        bank_account: "",
        basic: 0,
        house_rent: 0,
        medical: 0,
        conveyance: 0,
        food_allowance: 0,
        mobile_bill: 0,
        shift_benefit: 0,
        wages: 0,
        increment: 0,
        days_of_month: 30,
      });
      setErrors({});
    }
  }, [open]);

  const validate = (): boolean => {
    const errs = validateForm(form, {
      full_name: { required: true, minLength: 2 },
      department: { required: true },
      phone: { pattern: /^\+?\d{0,15}$/, patternMessage: "Invalid phone number" },
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const m = useMutation({
    mutationFn: () =>
      hrApi.createEmployee({
        mill_id: millId,
        employee_code: form.employee_code || `EMP-${Date.now()}`,
        full_name: form.full_name,
        sl_no: form.sl_no,
        employee_id: form.employee_id || null,
        department: form.department,
        designation: form.designation || null,
        section: form.section || null,
        shift: form.shift,
        date_of_joining: form.date_of_joining || null,
        dob: form.date_of_birth || null,
        gen: form.gen || null,
        age: form.age || null,
        gender: form.gender || null,
        grade: form.grade || null,
        phone: form.phone || null,
        bank_account_no: form.bank_account || null,
        basic: form.basic,
        house_rent: form.house_rent,
        medical: form.medical,
        conveyance: form.conveyance,
        food_allowance: form.food_allowance,
        wages: form.wages,
        increment: form.increment,
        mobile_bill: form.mobile_bill,
        shift_benefit: form.shift_benefit,
        total_salary: totalSalary,
        days_of_month: form.days_of_month,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Employee added");
        qc.invalidateQueries({ queryKey: ["hr-employees"] });
        setOpen(false);
      },
      onError: () => toast.error("Failed to add employee"),
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4 mr-1" />
          Add Employee
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Employee</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="flex gap-2 border-b pb-2">
            <button type="button" onClick={() => setSection("personal")} className={cn("px-3 py-1 text-sm rounded", section === "personal" ? "bg-primary text-primary-foreground" : "bg-muted")}>Personal Info</button>
            <button type="button" onClick={() => setSection("job")} className={cn("px-3 py-1 text-sm rounded", section === "job" ? "bg-primary text-primary-foreground" : "bg-muted")}>Job Info</button>
            <button type="button" onClick={() => setSection("salary")} className={cn("px-3 py-1 text-sm rounded", section === "salary" ? "bg-primary text-primary-foreground" : "bg-muted")}>Salary</button>
          </div>

          {section === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('sl_no')}</Label>
                  <Input value={form.sl_no} onChange={(e) => setForm({ ...form, sl_no: Number(e.target.value) })} type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('employee_id')}</Label>
                  <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('name')}{empColConfig.isRequired('name') && <span className="text-destructive">*</span>}</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('dob')}</Label>
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('age')}</Label>
                  <Input value={form.age} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('gender')}</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('grade')}</Label>
                  <Input type="number" min={0} max={99} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('gen')}</Label>
                  <Select value={form.gen} onValueChange={(v) => setForm({ ...form, gen: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('joining_date')}</Label>
                <Input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
              </div>
            </div>
          )}

          {section === "job" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('designation')}</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('section')}</Label>
                  <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('department')}{empColConfig.isRequired('department') && <span className="text-destructive">*</span>}</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger className={errors.department ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                  </SelectContent>
                </Select>
                {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('shift')}</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('phone')}</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('bank_account_no')}</Label>
                <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
              </div>
            </div>
          )}

          {section === "salary" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('basic')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.basic} onChange={(e) => setForm({ ...form, basic: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('house_rent')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.house_rent} onChange={(e) => setForm({ ...form, house_rent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('medical')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.medical} onChange={(e) => setForm({ ...form, medical: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('conveyance')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('food_allowance')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.food_allowance} onChange={(e) => setForm({ ...form, food_allowance: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('wages')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.wages} onChange={(e) => setForm({ ...form, wages: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('increment')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.increment} onChange={(e) => setForm({ ...form, increment: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('mobile_bill')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.mobile_bill} onChange={(e) => setForm({ ...form, mobile_bill: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('shift_benefit')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.shift_benefit} onChange={(e) => setForm({ ...form, shift_benefit: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('days_of_month')}</Label>
                  <Input type="number" min={1} max={31} value={form.days_of_month} onChange={(e) => setForm({ ...form, days_of_month: Number(e.target.value) })} />
                </div>
              </div>
              <div className="bg-muted p-3 rounded-md">
                <Label>{empColConfig.getLabel('total_salary')} (auto-calculated)</Label>
                <p className="text-lg font-bold text-primary mt-1">{formatCurrency(totalSalary)}</p>
                <p className="text-xs text-muted-foreground mt-1">Basic + House Rent + Medical + Conveyance + Food Allowance + Mobile Bill + Shift Benefit</p>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Save Employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Edit Employee Sheet ────────────────────────────────────────────────────────

function EditEmployeeSheet({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeRow;
}) {
  const empColConfig = useColumnConfig("hr_employees");
  const qc = useQueryClient();
  const [section, setSection] = useState<"personal" | "job" | "salary">("personal");
  const [form, setForm] = useState({
    sl_no: employee.sl_no ?? 0,
    employee_id: employee.employee_id ?? "",
    employee_code: employee.code ?? "",
    full_name: employee.name ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    age: employee.date_of_birth ? calcAge(employee.date_of_birth) : employee.age ?? 0,
    gender: employee.gender ?? "",
    grade: employee.grade ?? "",
    gen: employee.gen ?? "",
    date_of_joining: employee.date_of_joining ?? "",
    designation: employee.designation ?? employee.role ?? "",
    section: employee.section ?? "",
    department: employee.department ?? "",
    shift: employee.shift ?? "General",
    phone: employee.phone ?? "",
    bank_account: employee.bank_account_no ?? employee.bank_account ?? "",
    basic: employee.basic ?? 0,
    house_rent: employee.house_rent ?? 0,
    medical: employee.medical ?? 0,
    conveyance: employee.conveyance ?? 0,
    food_allowance: employee.food_allowance ?? 0,
    mobile_bill: employee.mobile_bill ?? 0,
    shift_benefit: employee.shift_benefit ?? 0,
    wages: employee.wages ?? 0,
    increment: employee.increment ?? 0,
    days_of_month: employee.days_of_month ?? 30,
  });

  const totalSalary = form.basic + form.house_rent + form.medical + form.conveyance +
    form.food_allowance + form.mobile_bill + form.shift_benefit;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm((prev) => ({ ...prev, age: form.date_of_birth ? calcAge(form.date_of_birth) : 0 }));
  }, [form.date_of_birth]);

  useEffect(() => {
    if (open) setSection("personal");
  }, [open]);

  const validate = (): boolean => {
    const errs = validateForm(form, {
      full_name: { required: true, minLength: 2 },
      department: { required: true },
      phone: { pattern: /^\+?\d{0,15}$/, patternMessage: "Invalid phone number" },
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const m = useMutation({
    mutationFn: () =>
      hrApi.updateEmployee(employee.id, {
        employee_code: form.employee_code,
        full_name: form.full_name,
        sl_no: form.sl_no,
        employee_id: form.employee_id || null,
        department: form.department,
        designation: form.designation || null,
        section: form.section || null,
        shift: form.shift,
        date_of_joining: form.date_of_joining || null,
        dob: form.date_of_birth || null,
        gen: form.gen || null,
        age: form.age || null,
        gender: form.gender || null,
        grade: form.grade || null,
        phone: form.phone || null,
        bank_account_no: form.bank_account || null,
        basic: form.basic,
        house_rent: form.house_rent,
        medical: form.medical,
        conveyance: form.conveyance,
        food_allowance: form.food_allowance,
        wages: form.wages,
        increment: form.increment,
        mobile_bill: form.mobile_bill,
        shift_benefit: form.shift_benefit,
        total_salary: totalSalary,
        days_of_month: form.days_of_month,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Employee updated");
        qc.invalidateQueries({ queryKey: ["hr-employees"] });
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to update employee"),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Employee — {employee.name}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="flex gap-2 border-b pb-2">
            <button type="button" onClick={() => setSection("personal")} className={cn("px-3 py-1 text-sm rounded", section === "personal" ? "bg-primary text-primary-foreground" : "bg-muted")}>Personal Info</button>
            <button type="button" onClick={() => setSection("job")} className={cn("px-3 py-1 text-sm rounded", section === "job" ? "bg-primary text-primary-foreground" : "bg-muted")}>Job Info</button>
            <button type="button" onClick={() => setSection("salary")} className={cn("px-3 py-1 text-sm rounded", section === "salary" ? "bg-primary text-primary-foreground" : "bg-muted")}>Salary</button>
          </div>

          {section === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('sl_no')}</Label>
                  <Input value={form.sl_no} onChange={(e) => setForm({ ...form, sl_no: Number(e.target.value) })} type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('employee_id')}</Label>
                  <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('name')}{empColConfig.isRequired('name') && <span className="text-destructive">*</span>}</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('dob')}</Label>
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('age')}</Label>
                  <Input value={form.age} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('gender')}</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('grade')}</Label>
                  <Input type="number" min={0} max={99} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('gen')}</Label>
                  <Select value={form.gen} onValueChange={(v) => setForm({ ...form, gen: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('joining_date')}</Label>
                <Input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
              </div>
            </div>
          )}

          {section === "job" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('designation')}</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('section')}</Label>
                  <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('department')}{empColConfig.isRequired('department') && <span className="text-destructive">*</span>}</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger className={errors.department ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                  </SelectContent>
                </Select>
                {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('shift')}</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('phone')}</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{empColConfig.getLabel('bank_account_no')}</Label>
                <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
              </div>
            </div>
          )}

          {section === "salary" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('basic')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.basic} onChange={(e) => setForm({ ...form, basic: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('house_rent')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.house_rent} onChange={(e) => setForm({ ...form, house_rent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('medical')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.medical} onChange={(e) => setForm({ ...form, medical: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('conveyance')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('food_allowance')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.food_allowance} onChange={(e) => setForm({ ...form, food_allowance: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('wages')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.wages} onChange={(e) => setForm({ ...form, wages: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('increment')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.increment} onChange={(e) => setForm({ ...form, increment: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('mobile_bill')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.mobile_bill} onChange={(e) => setForm({ ...form, mobile_bill: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('shift_benefit')}</Label>
                  <Input type="number" min={0} step={0.01} value={form.shift_benefit} onChange={(e) => setForm({ ...form, shift_benefit: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{empColConfig.getLabel('days_of_month')}</Label>
                  <Input type="number" min={1} max={31} value={form.days_of_month} onChange={(e) => setForm({ ...form, days_of_month: Number(e.target.value) })} />
                </div>
              </div>
              <div className="bg-muted p-3 rounded-md">
                <Label>{empColConfig.getLabel('total_salary')} (auto-calculated)</Label>
                <p className="text-lg font-bold text-primary mt-1">{formatCurrency(totalSalary)}</p>
                <p className="text-xs text-muted-foreground mt-1">Basic + House Rent + Medical + Conveyance + Food Allowance + Mobile Bill + Shift Benefit</p>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Update Employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ImportEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="size-4 mr-1" />
        Import Excel
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="hr_employees"
        endpoint="/hr/employees/bulk"
        importMillId={millId ?? undefined}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["hr-employees"] });
        }}
        title="Import Employees"
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

function AttendanceTab({ employees, canEdit }: { employees: EmployeeRow[]; canEdit: boolean }) {
  const { millId } = useActiveMill();
  const attColConfig = useColumnConfig("hr_attendance");
  const now = new Date();
  const today = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [deptFilter, setDeptFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [mobileCardEmp, setMobileCardEmp] = useState<EmployeeRow | null>(null);
  const [mobileCardOpen, setMobileCardOpen] = useState(false);

  const { data: attendanceData, isLoading, refetch } = useQuery({
    queryKey: ["hr-attendance", month, year, deptFilter, millId],
    queryFn: () => hrApi.getAttendance({ month, year, mill_id: millId, department: deptFilter !== "all" ? deptFilter : undefined }),
    staleTime: 60_000,
  });

  const attendanceRows: AttendanceRow[] = Array.isArray(attendanceData) ? attendanceData : (attendanceData?.data ?? []);
  const days = daysInMonth(month, year);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (shiftFilter !== "all" && e.shift !== shiftFilter) return false;
      return true;
    });
  }, [employees, deptFilter, shiftFilter]);

  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(), [employees]);
  const shifts = useMemo(() => [...new Set(employees.map((e) => e.shift).filter((s): s is string => !!s))].sort(), [employees]);

  const getStatus = (empId: string, day: number): string => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const rec = attendanceRows.find((a) => a.employee_id === empId && a.date === dateStr);
    return rec?.status ? rec.status.charAt(0).toUpperCase() : "";
  };

  const getOtHours = (empId: string, day: number): number => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const rec = attendanceRows.find((a) => a.employee_id === empId && a.date === dateStr);
    return rec?.overtime_hours ?? 0;
  };

  const calcTotals = (empId: string) => {
    let present = 0, absent = 0, cl = 0, sl = 0, el = 0, ot = 0;
    for (let d = 1; d <= days; d++) {
      const s = getStatus(empId, d);
      if (s === "P") present++;
      else if (s === "A") absent++;
      else if (s === "CL") cl++;
      else if (s === "SL") sl++;
      else if (s === "EL") el++;
      ot += getOtHours(empId, d);
    }
    return { present, absent, cl, sl, el, ot };
  };

  const updateCellStatus = async (empId: string, day: number, status: string) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      await hrApi.createAttendance({ employee_id: empId, attendance_date: dateStr, status });
      refetch();
      toast.success("Attendance updated");
    } catch {
      toast.error("Failed to update attendance");
    }
  };

  const cycleStatus = (empId: string, day: number, current: string) => {
    const order = ["P", "A", "H", "L", ""];
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    if (next) updateCellStatus(empId, day, next);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "P": return "bg-green-100 text-green-700";
      case "A": return "bg-red-100 text-red-700";
      case "H": return "bg-blue-100 text-blue-700";
      case "L": return "bg-yellow-100 text-yellow-700";
      case "CL": return "bg-yellow-100 text-yellow-700";
      case "SL": return "bg-orange-100 text-orange-700";
      case "EL": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-50 text-gray-400";
    }
  };

  const isToday = (d: number) => {
    return d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
  };

  const dayLetters = ["S", "M", "T", "W", "T", "F", "S"];

  const dayOfWeek = (d: number) => {
    return dayLetters[new Date(year, month - 1, d).getDay()];
  };

  const dayTotals = (day: number) => {
    let p = 0, a = 0, h = 0, l = 0;
    for (const emp of filteredEmployees) {
      const s = getStatus(emp.id, day);
      if (s === "P") p++;
      else if (s === "A") a++;
      else if (s === "H") h++;
      else if (s === "L" || s === "CL" || s === "SL" || s === "EL") l++;
    }
    return { present: p, absent: a, holiday: h, leave: l };
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading attendance…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2023, 2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {depts.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={shiftFilter} onValueChange={setShiftFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shifts</SelectItem>
            {shifts.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        {canEdit && (
          <Button size="sm" style={{ backgroundColor: "#3b82f6", color: "#ffffff" }}>
            <ClipboardCheck className="size-4 mr-1" />
            <MarkAttendanceSheet employees={filteredEmployees} month={month} year={year} onSuccess={refetch} />
          </Button>
        )}
        {canEdit && <ImportAttendanceDialog month={month} year={year} onSuccess={refetch} />}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-md overflow-x-auto">
        <Table className="min-w-[900px] w-full text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]" style={{ left: 0 }}>
                {attColConfig.getLabel('employee')}
              </TableHead>
              <TableHead className="sticky bg-background z-10 min-w-[120px]" style={{ left: "160px" }}>
                {attColConfig.getLabel('department')}
              </TableHead>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                <TableHead
                  key={d}
                  className={cn(
                    "text-center w-[52px] min-w-[52px] p-1",
                    isToday(d) && "bg-brand-50 border-brand-200",
                  )}
                >
                  <div className="text-xs font-semibold">{d}</div>
                  <div className="text-[10px] text-muted-foreground">{dayOfWeek(d)}</div>
                </TableHead>
              ))}
              <TableHead className="text-center min-w-[50px]">P</TableHead>
              <TableHead className="text-center min-w-[50px]">A</TableHead>
              <TableHead className="text-center min-w-[50px]">CL</TableHead>
              <TableHead className="text-center min-w-[50px]">SL</TableHead>
              <TableHead className="text-center min-w-[50px]">EL</TableHead>
              <TableHead className="text-center min-w-[60px]">OT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(filteredEmployees ?? []).map((emp) => {
              if (!emp) return null;
              const totals = calcTotals(emp.id);
              return (
                <TableRow key={emp.id}>
                  <TableCell
                    className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap text-sm"
                    style={{ left: 0 }}
                  >
                    {emp.name}
                  </TableCell>
                  <TableCell
                    className="sticky bg-background z-10 text-xs"
                    style={{ left: "160px" }}
                  >
                    {emp.department}
                  </TableCell>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const status = getStatus(emp.id, d);
                    return (
                      <TableCell
                        key={d}
                        className={cn(
                          "text-center p-0",
                          isToday(d) && "bg-brand-50/50",
                        )}
                        style={{ width: 44, height: 32 }}
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            className={cn(
                              "w-full h-full text-[11px] font-medium rounded cursor-pointer border-0",
                              statusColor(status),
                            )}
                            onClick={() => cycleStatus(emp.id, d, status)}
                            title="Click to cycle: P → A → H → L"
                          >
                            {status || "－"}
                          </button>
                        ) : (
                          <span className={cn("text-[11px] font-medium", statusColor(status))}>
                            {status || "－"}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-medium text-green-600 text-xs">{totals.present}</TableCell>
                  <TableCell className="text-center text-red-500 text-xs">{totals.absent}</TableCell>
                  <TableCell className="text-center text-xs">{totals.cl}</TableCell>
                  <TableCell className="text-center text-xs">{totals.sl}</TableCell>
                  <TableCell className="text-center text-xs">{totals.el}</TableCell>
                  <TableCell className="text-center text-xs">{totals.ot.toFixed(1)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {filteredEmployees.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0 bg-background z-10 font-semibold text-xs" style={{ left: 0 }}>Total</TableCell>
                <TableCell className="sticky bg-background z-10" style={{ left: "160px" }} />
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const dt = dayTotals(d);
                  return (
                    <TableCell key={d} className={cn("text-center p-1", isToday(d) && "bg-brand-50/50")}>
                      <div className="text-[9px] text-green-600">{dt.present}</div>
                      <div className="text-[9px] text-red-500">{dt.absent}</div>
                    </TableCell>
                  );
                })}
                <TableCell colSpan={6} />
              </TableRow>
            </TableFooter>
          )}
          {filteredEmployees.length === 0 && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={days + 9} className="text-center text-muted-foreground py-8">
                  No employees found for the selected filters
                </TableCell>
              </TableRow>
            </TableBody>
          )}
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {(filteredEmployees ?? []).map((emp) => {
          if (!emp) return null;
          const totals = calcTotals(emp.id);
          return (
            <Card
              key={emp.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                setMobileCardEmp(emp);
                setMobileCardOpen(true);
              }}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.department}</p>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <span className="text-green-600 font-medium">P:{totals.present} </span>
                    <span className="text-red-500 font-medium">A:{totals.absent} </span>
                    <span className="text-yellow-600 font-medium">L:{totals.cl + totals.sl + totals.el}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredEmployees.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No employees found</p>
        )}
      </div>

      {/* Mobile detail modal */}
      <Sheet open={mobileCardOpen} onOpenChange={setMobileCardOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{mobileCardEmp?.name}</SheetTitle>
          </SheetHeader>
          {mobileCardEmp && (
            <div className="py-4">
              <p className="text-xs text-muted-foreground mb-4">{mobileCardEmp.department}</p>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const status = getStatus(mobileCardEmp.id, d);
                  return (
                    <div
                      key={d}
                      className={cn(
                        "text-center p-1 rounded text-xs",
                        isToday(d) ? "bg-brand-50 border border-brand-200" : "bg-gray-50",
                      )}
                    >
                      <div className="text-[10px] text-muted-foreground">{d}</div>
                      <div className={cn("font-medium", statusColor(status))}>
                        {status || "－"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Mark Attendance Sheet (Bulk) ───────────────────────────────────────────────

function MarkAttendanceSheet({
  employees,
  month,
  year,
  onSuccess,
}: {
  employees: EmployeeRow[];
  month: number;
  year: number;
  onSuccess: () => void;
}) {
  const attColConfig = useColumnConfig("hr_attendance");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, { status: string; ot_hours: number }>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, { status: string; ot_hours: number }> = {};
      for (const emp of employees) {
        init[emp.id] = { status: "present", ot_hours: 0 };
      }
      setRecords(init);
    }
  }, [open, employees]);

  const m = useMutation({
    mutationFn: () => {
      const payload = {
        attendance_date: date,
        records: Object.entries(records).map(([employeeId, rec]) => ({
          employee_id: employeeId,
          attendance_date: date,
          status: rec.status,
          in_time: rec.status === "present" ? "08:00" : null,
          out_time: rec.status === "present" ? "17:00" : null,
          overtime_hours: rec.ot_hours,
        })),
      };
      return hrApi.createBulkAttendance(payload);
    },
  });

  const handleSubmit = () => {
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Attendance marked for ${Object.keys(records).length} employees`);
        qc.invalidateQueries({ queryKey: ["hr-attendance"] });
        onSuccess();
        setOpen(false);
      },
      onError: () => toast.error("Failed to mark attendance"),
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <ClipboardCheck className="size-4 mr-1" />
          Mark Attendance
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Mark Attendance</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5">
              <Label>{attColConfig.getLabel('date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-md max-h-[60vh] overflow-y-auto">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[500px] w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>{attColConfig.getLabel('employee')}</TableHead>
                    <TableHead>{attColConfig.getLabel('department')}</TableHead>
                    <TableHead>{attColConfig.getLabel('status')}</TableHead>
                    <TableHead>OT Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employees ?? []).map((emp, i) => emp ? (
                    <TableRow key={emp.id ?? i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>
                        <Select
                          value={records[emp.id]?.status ?? "present"}
                          onValueChange={(v) => setRecords((prev) => ({ ...prev, [emp.id]: { ...prev[emp.id], status: v } }))}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="half-day">Half Day</SelectItem>
                            <SelectItem value="leave">Leave</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          className="w-20 h-8"
                          value={records[emp.id]?.ot_hours ?? 0}
                          onChange={(e) =>
                            setRecords((prev) => ({
                              ...prev,
                              [emp.id]: { ...prev[emp.id], ot_hours: Number(e.target.value) },
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : null)}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={m.isPending}>
            {m.isPending ? "Saving…" : "Save All"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Import Attendance Dialog ──────────────────────────────────────────────────

function ImportAttendanceDialog({ month, year, onSuccess }: { month: number; year: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="size-4 mr-1" />
        Import Excel
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="hr_attendance"
        endpoint="/hr/attendance/bulk-import"
        onSuccess={() => onSuccess()}
        title="Import Attendance"
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — MONTHLY PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

function PayrollTab({ employees, canEdit, millId, userRole }: { employees: EmployeeRow[]; canEdit: boolean; millId: string; userRole: string }) {
  const payrollColConfig = useColumnConfig("hr_payroll");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [localPayroll, setLocalPayroll] = useState<PayrollRow[]>([]);
  const editRef = useRef<HTMLInputElement>(null);

  const { data: payrollData, isLoading, refetch } = useQuery({
    queryKey: ["hr-payroll", month, year],
    queryFn: () => hrApi.getPayroll({ month, year, mill_id: millId }),
    staleTime: 60_000,
  });

  const payroll: PayrollRow[] = Array.isArray(payrollData) ? payrollData : (payrollData?.data ?? []);

  useEffect(() => {
    if (payroll.length > 0) {
      setLocalPayroll(payroll);
    }
  }, [payroll]);

  const recalcNetPayable = (row: PayrollRow): number => {
    return (row.payable_salary ?? 0) + (row.ot_amount ?? 0) + (row.attendance_bonus ?? 0) +
      (row.arrear_others ?? 0) + (row.shift_amount ?? 0) + (row.roster_amount ?? 0) +
      (row.festival_duty_benefit ?? 0) + (row.festival_holiday_allowance ?? 0) +
      (row.ifter_allowance ?? 0) + (row.special_food ?? 0) + (row.mobile_bill ?? 0) -
      (row.absent_deduction ?? 0) - (row.advance_deduction ?? 0) - (row.tax_deduction ?? 0);
  };

  const isFinalized = payroll.length > 0 && payroll.some((r) => r.is_finalized);

  const calcPayrollM = useMutation({
    mutationFn: () => hrApi.calculatePayroll({ month, year, mill_id: millId }),
    onSuccess: () => {
      toast.success("Payroll calculated");
      refetch();
    },
    onError: () => toast.error("Failed to calculate payroll"),
  });

  const finalizeM = useMutation({
    mutationFn: () => hrApi.finalizePayroll({ month, year, mill_id: millId }),
    onSuccess: () => {
      toast.success("Payroll finalized");
      refetch();
    },
    onError: () => toast.error("Failed to finalize payroll"),
  });

  const updatePayrollM = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => hrApi.updatePayroll(id, data),
    onSuccess: () => {
      toast.success("Payroll entry updated");
      refetch();
    },
    onError: () => toast.error("Failed to update payroll"),
  });

  const handleCellEdit = (id: string, field: string, value: number) => {
    setLocalPayroll((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        updated.net_payable = recalcNetPayable(updated);
        return updated;
      }),
    );
  };

  const commitCellEdit = async (id: string, field: string) => {
    const row = localPayroll.find((r) => r.id === id);
    if (!row) return;
    updatePayrollM.mutate({ id, data: { [field]: row[field], net_payable: row.net_payable } });
  };

  const editableFields = [
    { key: "ot_hours", label: payrollColConfig.getLabel("ot_hours") },
    { key: "ot_amount", label: payrollColConfig.getLabel("ot_amount") },
    { key: "attendance_bonus", label: payrollColConfig.getLabel("attendance_bonus") },
    { key: "arrear_others", label: payrollColConfig.getLabel("arrear_others") },
    { key: "shift_amount", label: payrollColConfig.getLabel("shift_amount") },
    { key: "roster_amount", label: payrollColConfig.getLabel("roster_amount") },
    { key: "festival_duty_benefit", label: "Festival Allow." },
    { key: "absent_deduction", label: payrollColConfig.getLabel("absent_deduction") },
    { key: "advance_deduction", label: payrollColConfig.getLabel("advance_deduction") },
    { key: "tax_deduction", label: payrollColConfig.getLabel("tax_deduction") },
  ];

  const canFinalize = userRole === "MILL_OWNER" || userRole === "ACCOUNTANT" || userRole === "SUPER_ADMIN";

  const displayData = localPayroll.length > 0 ? localPayroll : payroll;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="space-y-1">
          <Label className="text-xs">Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => calcPayrollM.mutate()} disabled={calcPayrollM.isPending}>
            {calcPayrollM.isPending ? "Calculating…" : "Calculate Payroll"}
          </Button>
        )}
        {canFinalize && canEdit && (
          <Button size="sm" variant="destructive" onClick={() => {
            if (confirm("Finalize this month's payroll? This action may be irreversible.")) finalizeM.mutate();
          }} disabled={finalizeM.isPending || isFinalized}>
            {finalizeM.isPending ? "Finalizing…" : "Finalize Month"}
          </Button>
        )}
        {isFinalized && <Badge variant="default" className="bg-green-600">Finalized</Badge>}
        {!isFinalized && payroll.length > 0 && <Badge variant="secondary">Draft</Badge>}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-4">Loading payroll…</div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[1400px] w-full text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10">{payrollColConfig.getLabel('employee_id')}</TableHead>
                <TableHead className="sticky left-[80px] bg-background z-10 min-w-[120px]">{payrollColConfig.getLabel('name')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('basic')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('payable_days')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('payable_salary')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('ot_hours')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('ot_amount')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('attendance_bonus')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('arrear_others')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('shift_amount')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('roster_amount')}</TableHead>
                <TableHead className="text-right">Festival Allow.</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('absent_deduction')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('advance_deduction')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('tax_deduction')}</TableHead>
                <TableHead className="text-right">{payrollColConfig.getLabel('net_payable')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(displayData ?? []).map((row, i) => row ? (
                <TableRow key={row.id ?? i} className={row.is_finalized ? "bg-green-50" : ""}>
                  <TableCell className="sticky left-0 bg-background z-10 font-mono">{row.employee_code}</TableCell>
                  <TableCell className="sticky left-[80px] bg-background z-10 font-medium">{row.employee_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.basic)}</TableCell>
                  <TableCell className="text-right">{row.payable_days ?? "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.payable_salary ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.ot_hours ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "ot_hours"}
                      onStart={() => setEditingCell({ id: row.id, field: "ot_hours" })}
                      onChange={(v) => handleCellEdit(row.id, "ot_hours", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "ot_hours"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.ot_amount ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "ot_amount"}
                      onStart={() => setEditingCell({ id: row.id, field: "ot_amount" })}
                      onChange={(v) => handleCellEdit(row.id, "ot_amount", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "ot_amount"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.attendance_bonus ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "attendance_bonus"}
                      onStart={() => setEditingCell({ id: row.id, field: "attendance_bonus" })}
                      onChange={(v) => handleCellEdit(row.id, "attendance_bonus", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "attendance_bonus"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(row.arrear_others ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.shift_amount ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "shift_amount"}
                      onStart={() => setEditingCell({ id: row.id, field: "shift_amount" })}
                      onChange={(v) => handleCellEdit(row.id, "shift_amount", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "shift_amount"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.roster_amount ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "roster_amount"}
                      onStart={() => setEditingCell({ id: row.id, field: "roster_amount" })}
                      onChange={(v) => handleCellEdit(row.id, "roster_amount", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "roster_amount"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.festival_duty_benefit ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "festival_duty_benefit"}
                      onStart={() => setEditingCell({ id: row.id, field: "festival_duty_benefit" })}
                      onChange={(v) => handleCellEdit(row.id, "festival_duty_benefit", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "festival_duty_benefit"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.absent_deduction ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "absent_deduction"}
                      onStart={() => setEditingCell({ id: row.id, field: "absent_deduction" })}
                      onChange={(v) => handleCellEdit(row.id, "absent_deduction", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "absent_deduction"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.advance_deduction ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "advance_deduction"}
                      onStart={() => setEditingCell({ id: row.id, field: "advance_deduction" })}
                      onChange={(v) => handleCellEdit(row.id, "advance_deduction", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "advance_deduction"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.tax_deduction ?? 0}
                      editing={editingCell?.id === row.id && editingCell?.field === "tax_deduction"}
                      onStart={() => setEditingCell({ id: row.id, field: "tax_deduction" })}
                      onChange={(v) => handleCellEdit(row.id, "tax_deduction", v)}
                      onCommit={() => { setEditingCell(null); commitCellEdit(row.id, "tax_deduction"); }}
                      editRef={editRef}
                      disabled={row.is_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.net_payable)}</TableCell>
                </TableRow>
              ) : null)}
              {displayData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={16} className="text-center text-muted-foreground py-8">
                    No payroll data. Click "Calculate Payroll" to generate.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EditableCell({
  value,
  editing,
  onStart,
  onChange,
  onCommit,
  editRef,
  disabled,
}: {
  value: number;
  editing: boolean;
  onStart: () => void;
  onChange: (v: number) => void;
  onCommit: () => void;
  editRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) {
  if (disabled) return <span>{formatCurrency(value)}</span>;

  if (editing) {
    return (
      <input
        ref={editRef}
        type="number"
        step={0.01}
        className="w-full h-full px-1 text-right text-xs border-0 ring-1 ring-primary outline-none bg-white"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCommit();
        }}
        autoFocus
      />
    );
  }

  return (
    <span className="cursor-pointer hover:bg-muted px-1 rounded" onClick={onStart} title="Click to edit">
      {formatCurrency(value)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — LEAVES (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════════

function LeavesTab({
  employees,
  leaves,
  canEdit,
  user,
}: {
  employees: EmployeeRow[];
  leaves: LeaveRow[];
  canEdit: boolean;
  user: any;
}) {
  const leaveColConfig = useColumnConfig("hr_leaves");
  const qc = useQueryClient();
  const [leaveFilter, setLeaveFilter] = useState("all");

  const filteredLeaves = useMemo(() => {
    if (leaveFilter === "all") return leaves;
    return leaves.filter((l) => l.status === leaveFilter);
  }, [leaves, leaveFilter]);

  const leaveBalances = useMemo(() => {
    const balances: Record<string, { CL: number; SL: number; EL: number; PL: number }> = {};
    for (const emp of employees) {
      balances[emp.id] = { CL: 12, SL: 10, EL: 15, PL: 20 };
    }
    for (const l of leaves) {
      if (l.status === "approved" && balances[l.employee_id]) {
        const days = Math.max(1, Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const lt = l.leave_type as keyof (typeof balances)[string];
        if (balances[l.employee_id][lt] !== undefined) {
          balances[l.employee_id][lt] = Math.max(0, balances[l.employee_id][lt] - days);
        }
      }
    }
    return balances;
  }, [employees, leaves]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Select value={leaveFilter} onValueChange={setLeaveFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {canEdit && <NewLeaveDialog employees={employees} />}
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[1000px] w-full">
          <TableHeader>
            <TableRow>
              <TableHead>{leaveColConfig.getLabel('employee')}</TableHead>
              <TableHead>{leaveColConfig.getLabel('department')}</TableHead>
              <TableHead>{leaveColConfig.getLabel('from_date')}</TableHead>
              <TableHead>{leaveColConfig.getLabel('to_date')}</TableHead>
              <TableHead>{leaveColConfig.getLabel('type')}</TableHead>
              <TableHead className="max-w-xs">{leaveColConfig.getLabel('reason')}</TableHead>
              <TableHead>{leaveColConfig.getLabel('status')}</TableHead>
              <TableHead className="w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(filteredLeaves ?? []).map((l, i) => l ? (
              <TableRow key={l.id ?? i}>
                <TableCell className="font-medium">{l.employee_name}</TableCell>
                <TableCell>{l.department}</TableCell>
                <TableCell>{formatDate(l.from_date)}</TableCell>
                <TableCell>{formatDate(l.to_date)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{l.leave_type}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate" title={l.reason}>{l.reason}</TableCell>
                <TableCell>
                  <StatusBadge status={l.status} />
                </TableCell>
                <TableCell>
                  {l.status === "pending" && canEdit ? (
                    <LeaveActionDialog leave={l} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ) : null)}
            {filteredLeaves.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No leave requests found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table className="min-w-[600px] w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>{leaveColConfig.getLabel('employee')}</TableHead>
                  <TableHead className="text-center">CL</TableHead>
                  <TableHead className="text-center">SL</TableHead>
                  <TableHead className="text-center">EL</TableHead>
                  <TableHead className="text-center">PL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(employees ?? []).slice(0, 20).map((emp, i) => {
                  if (!emp) return null;
                  const bal = leaveBalances[emp.id];
                  return (
                    <TableRow key={emp.id ?? i}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-center">{bal?.CL ?? "-"}</TableCell>
                      <TableCell className="text-center">{bal?.SL ?? "-"}</TableCell>
                      <TableCell className="text-center">{bal?.EL ?? "-"}</TableCell>
                      <TableCell className="text-center">{bal?.PL ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {employees.length > 20 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs">
                      Showing 20 of {employees.length} employees
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── New Leave Dialog ───────────────────────────────────────────────────────────

function NewLeaveDialog({ employees }: { employees: EmployeeRow[] }) {
  const leaveColConfig = useColumnConfig("hr_leaves");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "CL" as string,
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await hrApi.createLeave(form);
      if (files.length > 0) {
        await Promise.all(files.map((f) => uploadApi.upload("leave", entry.id, f.file)));
      }
      return entry;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Leave request submitted");
        qc.invalidateQueries({ queryKey: ["hr-leaves"] });
        setFiles([]);
        setOpen(false);
      },
      onError: () => toast.error("Failed to submit leave"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New Leave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Leave Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{leaveColConfig.getLabel('employee')}{leaveColConfig.isRequired('employee') && <span className="text-destructive">*</span>}</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).filter((emp) => emp?.id).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name ?? "—"} ({emp.code ?? ""})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{leaveColConfig.getLabel('type')}{leaveColConfig.isRequired('type') && <span className="text-destructive">*</span>}</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CL">Casual Leave (CL)</SelectItem>
                  <SelectItem value="SL">Sick Leave (SL)</SelectItem>
                  <SelectItem value="EL">Earned Leave (EL)</SelectItem>
                  <SelectItem value="PL">Privilege Leave (PL)</SelectItem>
                  <SelectItem value="LOP">Leave Without Pay (LOP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{leaveColConfig.getLabel('from_date')}{leaveColConfig.isRequired('from_date') && <span className="text-destructive">*</span>}</Label>
              <Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>{leaveColConfig.getLabel('to_date')}{leaveColConfig.isRequired('to_date') && <span className="text-destructive">*</span>}</Label>
              <Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{leaveColConfig.getLabel('reason')}{leaveColConfig.isRequired('reason') && <span className="text-destructive">*</span>}</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required rows={3} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Attachment</Label>
              <FileUpload files={files} onFilesChange={setFiles} multiple={false} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !form.employee_id || !form.reason}>
              {m.isPending ? "Saving…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Leave Action Dialog (Approve/Reject) ───────────────────────────────────────

function LeaveActionDialog({ leave }: { leave: LeaveRow }) {
  const leaveColConfig = useColumnConfig("hr_leaves");
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");

  const approveM = useMutation({
    mutationFn: () =>
      hrApi.approveOrRejectLeave({
        id: leave.id,
        leave_id: leave.id,
        action: "approved",
        approved_by: user?.name ?? "",
        remarks,
      }),
  });

  const rejectM = useMutation({
    mutationFn: () =>
      hrApi.approveOrRejectLeave({
        id: leave.id,
        leave_id: leave.id,
        action: "rejected",
        approved_by: user?.name ?? "",
        remarks,
      }),
  });

  const handleAction = (action: "approved" | "rejected") => {
    const m = action === "approved" ? approveM : rejectM;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Leave ${action}`);
        qc.invalidateQueries({ queryKey: ["hr-leaves"] });
        setOpen(false);
        setRemarks("");
      },
      onError: () => toast.error("Failed to update leave"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="text-success h-7 text-xs">
            <CheckCircle2 className="size-3 mr-1" />
            Approve
          </Button>
          <Button size="sm" variant="outline" className="text-destructive h-7 text-xs">
            <XCircle className="size-3 mr-1" />
            Reject
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave Action</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm space-y-1">
            <p><strong>Employee:</strong> {leave.employee_name}</p>
            <p><strong>Type:</strong> {leave.leave_type}</p>
            <p><strong>From:</strong> {formatDate(leave.from_date)} <strong>To:</strong> {formatDate(leave.to_date)}</p>
            <p><strong>Reason:</strong> {leave.reason}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{leaveColConfig.getLabel('reason')} (optional)</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={() => handleAction("rejected")} disabled={rejectM.isPending}>
            {rejectM.isPending ? "…" : "Reject"}
          </Button>
          <Button onClick={() => handleAction("approved")} disabled={approveM.isPending}>
            {approveM.isPending ? "…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
