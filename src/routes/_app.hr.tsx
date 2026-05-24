import * as XLSX from "xlsx";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, uploadApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
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
  Upload,
  Download,
  Search,
  Pencil,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

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
  date_of_joining?: string;
  date_of_birth?: string;
  gender?: string;
  grade?: string;
  designation?: string;
  shift?: string;
  section?: string;
  bank_account?: string;
  basic?: number;
  house_rent?: number;
  medical?: number;
  conveyance?: number;
  food_allowance?: number;
  mobile_bill?: number;
  shift_benefit?: number;
  wages?: number;
  increment?: number;
  total_salary?: number;
  days_of_month?: number;
  sl_no?: number;
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

const DEPARTMENTS = [
  "Spinning",
  "Weaving",
  "Processing",
  "Packaging",
  "Maintenance",
  "Stores",
  "Admin",
];
const SHIFTS = ["A", "B", "C", "General"];
const GRADES = ["1", "2", "3", "4", "5", "6"];
const ATTENDANCE_STATUSES = ["P", "A", "H", "CL", "SL", "EL", "OD", "WO"];
const LEAVE_TYPES = ["CL", "SL", "PL", "LOP", "EL"];

function formatDate(d: string | Date): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
  const millId = user?.millId;

  const [tab, setTab] = useState("employees");

  const empQ = useQuery({
    queryKey: ["hr-employees"],
    queryFn: hrApi.getEmployees,
    staleTime: 60_000,
    retry: 1,
  });
  const attQ = useQuery({
    queryKey: ["hr-attendance-all"],
    queryFn: () => hrApi.getAttendance({}),
    staleTime: 60_000,
    retry: 1,
  });
  const leaveQ = useQuery({
    queryKey: ["hr-leaves"],
    queryFn: hrApi.getLeaves,
    staleTime: 60_000,
    retry: 1,
  });

  const employees: EmployeeRow[] = empQ.data ?? [];
  const attendance: AttendanceRow[] = attQ.data ?? [];
  const leaves: LeaveRow[] = leaveQ.data ?? [];

  const activeEmployees = employees.filter((e) => e.is_active).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPresent = attendance.filter((a) => a.date === todayStr && a.status === "present").length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const todayAbsent = attendance.filter((a) => a.date === todayStr && a.status === "absent").length;

  if (!user) return null;

  if (empQ.isLoading)
    return (
      <>
        <Topbar title="Human Resources" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (empQ.isError)
    return (
      <>
        <Topbar title="Human Resources" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Human Resources"
        subtitle="Employees, Attendance, Payroll & Leave Management"
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeRow | null>(null);

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
      if (deptFilter && e.department !== deptFilter) return false;
      if (gradeFilter && e.grade !== gradeFilter) return false;
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      return true;
    });
  }, [employees, search, deptFilter, gradeFilter, statusFilter]);

  const handleEdit = (emp: EmployeeRow) => {
    setEditingEmp(emp);
    setEditOpen(true);
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

  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter((d): d is string => !!d))].sort(), [employees]);
  const grades = useMemo(() => [...new Set(employees.map((e) => e.grade).filter((g): g is string => !!g))].sort(), [employees]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Departments</SelectItem>
            {depts.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Grades</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g} value={g}>Grade {g}</SelectItem>
            ))}
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
        <Button size="sm" variant="outline" onClick={() => {
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(filtered);
          XLSX.utils.book_append_sheet(wb, ws, "Employees");
          XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }}>
          <Download className="size-4 mr-1" />
          Export
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[1200px] w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Sl No</TableHead>
              <TableHead>Emp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Joining Date</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Basic</TableHead>
              <TableHead>Total Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((emp, i) => (
              <TableRow key={emp.id}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-mono text-xs">{emp.code}</TableCell>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>{formatDate(emp.date_of_joining ?? "")}</TableCell>
                <TableCell>{emp.date_of_birth ? calcAge(emp.date_of_birth) : "-"}</TableCell>
                <TableCell>{emp.gender ?? "-"}</TableCell>
                <TableCell>{emp.grade ?? "-"}</TableCell>
                <TableCell>{emp.designation ?? emp.role}</TableCell>
                <TableCell>{emp.department}</TableCell>
                <TableCell>{formatCurrency(emp.basic)}</TableCell>
                <TableCell>{formatCurrency(emp.total_salary)}</TableCell>
                <TableCell>
                  <Badge variant={emp.is_active ? "default" : "secondary"}>
                    {emp.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(emp)} title="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    {canEdit && emp.is_active && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeactivate(emp)} title="Deactivate">
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                  No employees found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editOpen && editingEmp && (
        <EditEmployeeSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          employee={editingEmp}
        />
      )}
    </div>
  );
}

// ─── Add Employee Sheet ─────────────────────────────────────────────────────────

const GENDERS = ["Male", "Female", "Other"];

function AddEmployeeSheet({ employees }: { employees: EmployeeRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"personal" | "job" | "salary">("personal");

  const [form, setForm] = useState({
    sl_no: 0,
    employee_code: "",
    full_name: "",
    date_of_birth: "",
    age: 0,
    gender: "",
    grade: "",
    date_of_joining: new Date().toISOString().slice(0, 10),
    designation: "",
    section: "",
    department: "",
    shift: "General",
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
    days_of_month: 26,
  });

  const nextSlNo = employees.length > 0 ? Math.max(...employees.map((e) => e.sl_no ?? 0)) + 1 : 1;

  const totalSalary = form.basic + form.house_rent + form.medical + form.conveyance +
    form.food_allowance + form.wages + form.increment + form.mobile_bill + form.shift_benefit;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm((prev) => ({ ...prev, age: form.date_of_birth ? calcAge(form.date_of_birth) : 0 }));
  }, [form.date_of_birth]);

  useEffect(() => {
    if (open) {
      setSection("personal");
      setForm({
        sl_no: nextSlNo,
        employee_code: "",
        full_name: "",
        date_of_birth: "",
        age: 0,
        gender: "",
        grade: "",
        date_of_joining: new Date().toISOString().slice(0, 10),
        designation: "",
        section: "",
        department: "",
        shift: "General",
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
        days_of_month: 26,
      });
      setErrors({});
    }
  }, [open]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.full_name) errs.full_name = "Full name is required";
    if (!form.date_of_joining) errs.date_of_joining = "Joining date is required";
    if (!form.designation) errs.designation = "Designation is required";
    if (form.basic <= 0) errs.basic = "Basic salary must be > 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const m = useMutation({
    mutationFn: () =>
      hrApi.createEmployee({
        sl_no: form.sl_no,
        employee_code: form.employee_code,
        full_name: form.full_name,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        grade: form.grade || null,
        date_of_joining: form.date_of_joining,
        designation: form.designation,
        section: form.section || null,
        department: form.department,
        shift: form.shift,
        bank_account: form.bank_account || null,
        basic: form.basic,
        house_rent: form.house_rent,
        medical: form.medical,
        conveyance: form.conveyance,
        food_allowance: form.food_allowance,
        mobile_bill: form.mobile_bill,
        shift_benefit: form.shift_benefit,
        wages: form.wages,
        increment: form.increment,
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
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Employee</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="flex gap-2 border-b pb-2">
            <button type="button" onClick={() => setSection("personal")} className={cn("px-3 py-1 text-sm rounded", section === "personal" ? "bg-primary text-primary-foreground" : "bg-muted")}>Personal</button>
            <button type="button" onClick={() => setSection("job")} className={cn("px-3 py-1 text-sm rounded", section === "job" ? "bg-primary text-primary-foreground" : "bg-muted")}>Job</button>
            <button type="button" onClick={() => setSection("salary")} className={cn("px-3 py-1 text-sm rounded", section === "salary" ? "bg-primary text-primary-foreground" : "bg-muted")}>Salary</button>
          </div>

          {section === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sl No</Label>
                  <Input value={form.sl_no} onChange={(e) => setForm({ ...form, sl_no: Number(e.target.value) })} type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Employee ID</Label>
                  <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>DOB</Label>
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input value={form.age} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Joining Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} className={errors.date_of_joining ? "border-destructive" : ""} />
                {errors.date_of_joining && <p className="text-xs text-destructive">{errors.date_of_joining}</p>}
              </div>
            </div>
          )}

          {section === "job" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Designation <span className="text-destructive">*</span></Label>
                <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className={errors.designation ? "border-destructive" : ""} />
                {errors.designation && <p className="text-xs text-destructive">{errors.designation}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Department <span className="text-destructive">*</span></Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Enter department name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Account No.</Label>
                  <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {section === "salary" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Basic <span className="text-destructive">*</span></Label>
                  <Input type="number" min={0} value={form.basic} onChange={(e) => setForm({ ...form, basic: Number(e.target.value) })} className={errors.basic ? "border-destructive" : ""} />
                  {errors.basic && <p className="text-xs text-destructive">{errors.basic}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>House Rent</Label>
                  <Input type="number" min={0} value={form.house_rent} onChange={(e) => setForm({ ...form, house_rent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Medical</Label>
                  <Input type="number" min={0} value={form.medical} onChange={(e) => setForm({ ...form, medical: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Conveyance</Label>
                  <Input type="number" min={0} value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Food Allowance</Label>
                  <Input type="number" min={0} value={form.food_allowance} onChange={(e) => setForm({ ...form, food_allowance: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile Bill</Label>
                  <Input type="number" min={0} value={form.mobile_bill} onChange={(e) => setForm({ ...form, mobile_bill: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shift Benefit</Label>
                  <Input type="number" min={0} value={form.shift_benefit} onChange={(e) => setForm({ ...form, shift_benefit: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Increment</Label>
                  <Input type="number" min={0} value={form.increment} onChange={(e) => setForm({ ...form, increment: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Total Salary</Label>
                  <Input value={formatCurrency(totalSalary)} readOnly className="bg-muted font-semibold" />
                </div>
                <div className="space-y-1.5">
                  <Label>Days of Month</Label>
                  <Input type="number" min={1} max={31} value={form.days_of_month} onChange={(e) => setForm({ ...form, days_of_month: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="submit" disabled={m.isPending || Object.keys(errors).length > 0}>
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
  const qc = useQueryClient();
  const [section, setSection] = useState<"personal" | "job" | "salary">("personal");
  const [form, setForm] = useState({
    sl_no: employee.sl_no ?? 0,
    employee_code: employee.code ?? "",
    full_name: employee.name ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    age: employee.date_of_birth ? calcAge(employee.date_of_birth) : 0,
    gender: employee.gender ?? "",
    grade: employee.grade ?? "",
    date_of_joining: employee.date_of_joining ?? "",
    designation: employee.designation ?? employee.role ?? "",
    section: employee.section ?? "",
    department: employee.department ?? "",
    shift: employee.shift ?? "General",
    bank_account: employee.bank_account ?? "",
    basic: employee.basic ?? 0,
    house_rent: employee.house_rent ?? 0,
    medical: employee.medical ?? 0,
    conveyance: employee.conveyance ?? 0,
    food_allowance: employee.food_allowance ?? 0,
    mobile_bill: employee.mobile_bill ?? 0,
    shift_benefit: employee.shift_benefit ?? 0,
    wages: employee.wages ?? 0,
    increment: employee.increment ?? 0,
    days_of_month: employee.days_of_month ?? 26,
  });

  const totalSalary = form.basic + form.house_rent + form.medical + form.conveyance +
    form.food_allowance + form.wages + form.increment + form.mobile_bill + form.shift_benefit;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm((prev) => ({ ...prev, age: form.date_of_birth ? calcAge(form.date_of_birth) : 0 }));
  }, [form.date_of_birth]);

  useEffect(() => {
    if (open) setSection("personal");
  }, [open]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.full_name) errs.full_name = "Full name is required";
    if (!form.date_of_joining) errs.date_of_joining = "Joining date is required";
    if (!form.designation) errs.designation = "Designation is required";
    if (form.basic <= 0) errs.basic = "Basic salary must be > 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const m = useMutation({
    mutationFn: () =>
      hrApi.updateEmployee(employee.id, {
        sl_no: form.sl_no,
        employee_code: form.employee_code,
        full_name: form.full_name,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        grade: form.grade || null,
        date_of_joining: form.date_of_joining,
        designation: form.designation,
        section: form.section || null,
        department: form.department,
        shift: form.shift,
        bank_account: form.bank_account || null,
        basic: form.basic,
        house_rent: form.house_rent,
        medical: form.medical,
        conveyance: form.conveyance,
        food_allowance: form.food_allowance,
        mobile_bill: form.mobile_bill,
        shift_benefit: form.shift_benefit,
        wages: form.wages,
        increment: form.increment,
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
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Employee — {employee.name}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="flex gap-2 border-b pb-2">
            <button type="button" onClick={() => setSection("personal")} className={cn("px-3 py-1 text-sm rounded", section === "personal" ? "bg-primary text-primary-foreground" : "bg-muted")}>Personal</button>
            <button type="button" onClick={() => setSection("job")} className={cn("px-3 py-1 text-sm rounded", section === "job" ? "bg-primary text-primary-foreground" : "bg-muted")}>Job</button>
            <button type="button" onClick={() => setSection("salary")} className={cn("px-3 py-1 text-sm rounded", section === "salary" ? "bg-primary text-primary-foreground" : "bg-muted")}>Salary</button>
          </div>

          {section === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sl No</Label>
                  <Input value={form.sl_no} onChange={(e) => setForm({ ...form, sl_no: Number(e.target.value) })} type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Employee ID</Label>
                  <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>DOB</Label>
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input value={form.age} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (<SelectItem key={g} value={g}>Grade {g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Joining Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} className={errors.date_of_joining ? "border-destructive" : ""} />
                {errors.date_of_joining && <p className="text-xs text-destructive">{errors.date_of_joining}</p>}
              </div>
            </div>
          )}

          {section === "job" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Designation <span className="text-destructive">*</span></Label>
                <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className={errors.designation ? "border-destructive" : ""} />
                {errors.designation && <p className="text-xs text-destructive">{errors.designation}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Department <span className="text-destructive">*</span></Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Account No.</Label>
                  <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {section === "salary" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Basic <span className="text-destructive">*</span></Label>
                  <Input type="number" min={0} value={form.basic} onChange={(e) => setForm({ ...form, basic: Number(e.target.value) })} className={errors.basic ? "border-destructive" : ""} />
                  {errors.basic && <p className="text-xs text-destructive">{errors.basic}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>House Rent</Label>
                  <Input type="number" min={0} value={form.house_rent} onChange={(e) => setForm({ ...form, house_rent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Medical</Label>
                  <Input type="number" min={0} value={form.medical} onChange={(e) => setForm({ ...form, medical: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Conveyance</Label>
                  <Input type="number" min={0} value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Food Allowance</Label>
                  <Input type="number" min={0} value={form.food_allowance} onChange={(e) => setForm({ ...form, food_allowance: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile Bill</Label>
                  <Input type="number" min={0} value={form.mobile_bill} onChange={(e) => setForm({ ...form, mobile_bill: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shift Benefit</Label>
                  <Input type="number" min={0} value={form.shift_benefit} onChange={(e) => setForm({ ...form, shift_benefit: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Increment</Label>
                  <Input type="number" min={0} value={form.increment} onChange={(e) => setForm({ ...form, increment: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Total Salary</Label>
                  <Input value={formatCurrency(totalSalary)} readOnly className="bg-muted font-semibold" />
                </div>
                <div className="space-y-1.5">
                  <Label>Days of Month</Label>
                  <Input type="number" min={1} max={31} value={form.days_of_month} onChange={(e) => setForm({ ...form, days_of_month: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="submit" disabled={m.isPending || Object.keys(errors).length > 0}>
              {m.isPending ? "Saving…" : "Update Employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Import Employee Dialog (Excel) ─────────────────────────────────────────────

const FIELD_CANDIDATES: Record<string, string[]> = {
  code: ["code", "emp code", "employee code", "id", "emp id"],
  name: ["name", "full name", "employee name", "emp name"],
  department: ["department", "dept", "division"],
  designation: ["designation", "position", "title", "post"],
  shift: ["shift", "shift type", "work shift"],
  doj: ["doj", "date of joining", "joining date", "join date", "start date"],
  phone: ["phone", "mobile", "contact", "phone no", "mobile no"],
  daily_wage: ["daily wage", "wage", "salary", "daily salary", "per day"],
};

const VALID_SHIFTS = ["A", "B", "C", "General", "Morning", "Evening", "Night", "Day", "1", "2", "3"];

function normalizeShift(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "1" || v === "morning") return "A";
  if (v === "2" || v === "evening") return "B";
  if (v === "3" || v === "night") return "C";
  if (v === "day" || v === "general") return "General";
  if (["a", "b", "c"].includes(v)) return v.toUpperCase();
  return value;
}

function detectColumn(headers: string[], candidates: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (candidates.some((c) => h.includes(c.toLowerCase()))) return i;
  }
  return null;
}

interface EmpImportRow {
  employee_code: string;
  full_name: string;
  department: string;
  designation: string;
  shift: string;
  date_of_joining: string;
  phone: string;
  daily_wage: string;
  _error?: string;
}

function parseEmployeeRow(row: any[], colMap: Record<string, number>): EmpImportRow | null {
  const get = (field: string) => (colMap[field] !== undefined ? String(row[colMap[field]] ?? "").trim() : "");
  const employee_code = get("code");
  const full_name = get("name");
  const department = get("department");
  if (!employee_code && !full_name) return null;

  let shift = get("shift");
  if (shift) {
    const normalized = normalizeShift(shift);
    if (!VALID_SHIFTS.includes(normalized)) {
      return { employee_code, full_name, department, designation: get("designation"), shift, date_of_joining: get("doj"), phone: get("phone"), daily_wage: get("daily_wage"), _error: `Invalid shift: ${shift}` };
    }
    shift = normalized;
  }

  return {
    employee_code,
    full_name,
    department,
    designation: get("designation"),
    shift,
    date_of_joining: get("doj"),
    phone: get("phone"),
    daily_wage: get("daily_wage"),
    _error: !employee_code ? "Missing employee code" : !full_name ? "Missing full name" : !department ? "Missing department" : undefined,
  };
}

function recalcError(row: EmpImportRow): string | undefined {
  if (!row.employee_code) return "Missing employee code";
  if (!row.full_name) return "Missing full name";
  if (!row.department) return "Missing department";
  if (row.shift) {
    const normalized = normalizeShift(row.shift);
    if (!VALID_SHIFTS.includes(normalized)) return `Invalid shift: ${row.shift}`;
  }
  return undefined;
}

const FIELD_TO_LABEL: Record<string, string> = {
  code: "Employee Code",
  name: "Full Name",
  department: "Department",
  designation: "Designation",
  shift: "Shift",
  doj: "Date of Joining",
  phone: "Phone",
  daily_wage: "Daily Wage",
};

function downloadEmployeeTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Employee Code", "Full Name", "Department", "Designation", "Shift (A/B/C/General)", "Date of Joining (DD/MM/YYYY)", "Phone", "Daily Wage"],
    ["EMP001", "Ravi Kumar", "Spinning", "Operator", "A", "01/06/2024", "9876543210", "500"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "employee_import_template.xlsx");
}

function ImportEmployeeDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<EmpImportRow[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [activeTab, setActiveTab] = useState<"mapping" | "preview">("mapping");
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: (items: any[]) => hrApi.bulkCreateEmployees({ items }),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const hdrs = (raw[0] ?? []).map((h: any) => String(h ?? "").trim());
      setHeaders(hdrs);

      const auto: Record<string, number> = {};
      for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
        const idx = detectColumn(hdrs, candidates);
        if (idx !== null) auto[field] = idx;
      }
      setColMap(auto);
      setRawRows(raw.slice(1));
      setRows([]);
      setDirtyCells(new Set());
      setEditingCell(null);
      setActiveTab("mapping");
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function applyMapping() {
    const parsed = rawRows.map((row) => parseEmployeeRow(row, colMap)).filter((r): r is EmpImportRow => r !== null);
    setRows(parsed);
    setDirtyCells(new Set());
    setEditingCell(null);
    setActiveTab("preview");
  }

  function updateCell(rowIdx: number, field: keyof EmpImportRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const updated = { ...next[rowIdx], [field]: value as any };
      updated._error = recalcError(updated);
      next[rowIdx] = updated;
      return next;
    });
    setDirtyCells((prev) => {
      const next = new Set(prev);
      next.add(`${rowIdx}:${field}`);
      return next;
    });
  }

  async function handleConfirm() {
    const validated = rows.map((r) => ({ ...r, shift: normalizeShift(r.shift) || "General" }));
    const valid = validated.filter((r) => !r._error);
    if (!valid.length) return;
    const items = valid.map((r) => ({
      employee_code: r.employee_code,
      full_name: r.full_name,
      department: r.department,
      designation: r.designation,
      shift: normalizeShift(r.shift) || "General",
      date_of_joining: r.date_of_joining || null,
      phone: r.phone || null,
      daily_wage: r.daily_wage ? parseFloat(r.daily_wage) : null,
    }));
    try {
      const res = await m.mutateAsync(items);
      if (res.errors?.length) {
        toast.error(`Import failed: ${res.errors[0]}`);
      } else {
        toast.success(`${res.created} employee(s) imported successfully`);
        qc.invalidateQueries({ queryKey: ["hr-employees"] });
        setOpen(false);
        setFileName("");
        setHeaders([]);
        setColMap({});
        setRows([]);
        setRawRows([]);
        setDirtyCells(new Set());
        setEditingCell(null);
        setActiveTab("mapping");
      }
    } catch {
      toast.error("Failed to import employees");
    }
  }

  const validCount = rows.filter((r) => !r._error).length;
  const errorCount = rows.filter((r) => !!r._error).length;

  function renderEditableCell(rowIdx: number, field: keyof EmpImportRow, value: string) {
    const isEditing = editingCell?.row === rowIdx && editingCell?.field === field;
    const isDirty = dirtyCells.has(`${rowIdx}:${field}`);

    if (isEditing) {
      return (
        <TableCell key={`edit-${rowIdx}-${field}`} className="p-0">
          <input
            ref={editInputRef}
            value={value}
            onChange={(e) => updateCell(rowIdx, field, e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingCell(null);
            }}
            autoFocus
            className="w-full h-full px-2 py-1 text-xs border-0 ring-1 ring-primary outline-none bg-white"
          />
        </TableCell>
      );
    }

    return (
      <TableCell
        key={`cell-${rowIdx}-${field}`}
        className={cn("cursor-pointer max-w-[160px] truncate", isDirty && "bg-yellow-100")}
        title={value}
        onClick={() => setEditingCell({ row: rowIdx, field })}
      >
        {value}
      </TableCell>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4 mr-1" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Employees from Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={downloadEmployeeTemplate}>
              <Download className="size-4 mr-1" />
              Download Template
            </Button>
            <label className="cursor-pointer">
              <Button size="sm" asChild>
                <span>
                  <Upload className="size-4 mr-1" />
                  {fileName ? fileName : "Choose File"}
                </span>
              </Button>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
            {activeTab === "preview" && rows.length > 0 && (
              <span className="text-sm text-muted-foreground">{validCount} valid, {errorCount} errors</span>
            )}
          </div>

          {activeTab === "mapping" && headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Column Mapping</p>
              <div className="border rounded-md">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Excel Column</TableHead>
                      <TableHead className="w-10">Detected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(FIELD_CANDIDATES).map(([field]) => {
                      const detectedIdx = colMap[field];
                      const detectedHeader = detectedIdx !== undefined ? headers[detectedIdx] : null;
                      return (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{FIELD_TO_LABEL[field]}</TableCell>
                          <TableCell>
                            <Select value={detectedIdx !== undefined ? String(detectedIdx) : ""} onValueChange={(v) => setColMap((prev) => ({ ...prev, [field]: v ? Number(v) : (undefined as any) }))}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select column..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">(none)</SelectItem>
                                {headers.map((h, i) => (
                                  <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            {detectedHeader ? <span className="text-green-600 text-sm">&#10003;</span> : <span className="text-muted-foreground">&#8212;</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={applyMapping}>Apply Mapping</Button>
              </div>
            </div>
          )}

          {activeTab === "preview" && rows.length > 0 && (
            <div className="border rounded-md max-h-80 overflow-auto">
              <Table className="min-w-[960px] w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>DOJ</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Daily Wage</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className={r._error ? "bg-destructive/10" : ""}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {renderEditableCell(i, "employee_code", r.employee_code)}
                      {renderEditableCell(i, "full_name", r.full_name)}
                      {renderEditableCell(i, "department", r.department)}
                      {renderEditableCell(i, "designation", r.designation)}
                      {renderEditableCell(i, "shift", r.shift)}
                      {renderEditableCell(i, "date_of_joining", r.date_of_joining)}
                      {renderEditableCell(i, "phone", r.phone)}
                      {renderEditableCell(i, "daily_wage", r.daily_wage)}
                      <TableCell className={cn("max-w-[140px] truncate", r._error ? "text-destructive" : "text-green-600")} title={r._error}>
                        {r._error || "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && (
                <div className="text-xs text-center text-muted-foreground py-2 border-t">Showing 50 of {rows.length} rows</div>
              )}
            </div>
          )}

          {activeTab === "preview" && rows.length === 0 && headers.length > 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No valid data rows found. Check your column mapping.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); setFileName(""); setHeaders([]); setColMap({}); setRows([]); setRawRows([]); setDirtyCells(new Set()); setEditingCell(null); setActiveTab("mapping"); }}>
            Cancel
          </Button>
          {activeTab === "preview" && (
            <Button onClick={handleConfirm} disabled={validCount === 0 || m.isPending}>
              {m.isPending ? "Importing…" : `Import ${validCount} Employee(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

function AttendanceTab({ employees, canEdit }: { employees: EmployeeRow[]; canEdit: boolean }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [deptFilter, setDeptFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");

  const { data: attendanceData, isLoading, refetch } = useQuery({
    queryKey: ["hr-attendance", month, year, deptFilter],
    queryFn: () => hrApi.getAttendance({ month, year, department: deptFilter || undefined }),
  });

  const attendanceRows: AttendanceRow[] = attendanceData ?? [];
  const days = daysInMonth(month, year);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (deptFilter && e.department !== deptFilter) return false;
      if (shiftFilter && e.shift !== shiftFilter) return false;
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

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading attendance…</div>;

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
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Departments</SelectItem>
            {depts.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={shiftFilter} onValueChange={setShiftFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Shifts</SelectItem>
            {shifts.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        {canEdit && <MarkAttendanceSheet employees={filteredEmployees} month={month} year={year} onSuccess={refetch} />}
        {canEdit && <ImportAttendanceDialog month={month} year={year} onSuccess={refetch} />}
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[800px] w-full text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">Employee</TableHead>
              <TableHead className="sticky left-[140px] bg-background z-10 min-w-[80px]">Dept</TableHead>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                <TableHead key={d} className="text-center w-8 min-w-[28px] p-1">{d}</TableHead>
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
            {filteredEmployees.map((emp) => {
              const totals = calcTotals(emp.id);
              return (
                <TableRow key={emp.id}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap">{emp.name}</TableCell>
                  <TableCell className="sticky left-[140px] bg-background z-10">{emp.department}</TableCell>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const status = getStatus(emp.id, d);
                    return (
                      <TableCell key={d} className="text-center p-1">
                        {canEdit ? (
                          <Select value={status} onValueChange={(v) => updateCellStatus(emp.id, d, v)}>
                            <SelectTrigger className={cn("h-6 w-8 p-0 text-[10px]", status === "P" ? "text-green-600" : status === "A" ? "text-red-500" : "")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ATTENDANCE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn(status === "P" ? "text-green-600" : status === "A" ? "text-red-500" : "")}>{status || "-"}</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-medium text-green-600">{totals.present}</TableCell>
                  <TableCell className="text-center text-red-500">{totals.absent}</TableCell>
                  <TableCell className="text-center">{totals.cl}</TableCell>
                  <TableCell className="text-center">{totals.sl}</TableCell>
                  <TableCell className="text-center">{totals.el}</TableCell>
                  <TableCell className="text-center">{totals.ot.toFixed(1)}</TableCell>
                </TableRow>
              );
            })}
            {filteredEmployees.length === 0 && (
              <TableRow>
                <TableCell colSpan={days + 9} className="text-center text-muted-foreground py-8">
                  No employees found for the selected filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
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
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-md max-h-[60vh] overflow-y-auto">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[500px] w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OT Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp, i) => (
                    <TableRow key={emp.id}>
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
                  ))}
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
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const rows = json.slice(1).filter((r: any[]) => r[0]).map((r: any[]) => ({
        employee_code: String(r[0] ?? "").trim(),
        date: r[1] ? String(r[1]).trim() : "",
        status: String(r[2] ?? "").trim().charAt(0).toUpperCase(),
        ot_hours: parseFloat(r[3]) || 0,
      }));
      return hrApi.bulkImportAttendance({ month, year, records: rows });
    },
  });

  const handleImport = async () => {
    try {
      await m.mutateAsync();
      toast.success("Attendance imported");
      qc.invalidateQueries({ queryKey: ["hr-attendance"] });
      onSuccess();
      setOpen(false);
      setFile(null);
    } catch {
      toast.error("Failed to import attendance");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4 mr-1" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Attendance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload an Excel file with columns: Employee Code, Date, Status (P/A/H/CL/SL/EL/OD/WO), OT Hours
          </p>
          <label className="cursor-pointer block">
            <Button size="sm" asChild variant="outline" className="w-full">
              <span><Upload className="size-4 mr-1" />{file ? file.name : "Choose Excel File"}</span>
            </Button>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={handleImport} disabled={!file || m.isPending}>
            {m.isPending ? "Importing…" : "Import Attendance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — MONTHLY PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

function PayrollTab({ employees, canEdit, millId, userRole }: { employees: EmployeeRow[]; canEdit: boolean; millId: string; userRole: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [localPayroll, setLocalPayroll] = useState<PayrollRow[]>([]);
  const editRef = useRef<HTMLInputElement>(null);

  const { data: payrollData, isLoading, refetch } = useQuery({
    queryKey: ["hr-payroll", month, year],
    queryFn: () => hrApi.getPayroll({ month, year, mill_id: millId }),
  });

  const payroll: PayrollRow[] = payrollData ?? [];

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
    { key: "ot_hours", label: "OT Hours" },
    { key: "ot_amount", label: "OT Amt" },
    { key: "attendance_bonus", label: "Att. Bonus" },
    { key: "arrear_others", label: "Arrear" },
    { key: "shift_amount", label: "Shift Amt" },
    { key: "roster_amount", label: "Roster Amt" },
    { key: "festival_duty_benefit", label: "Festival Allow." },
    { key: "absent_deduction", label: "Absent Ded." },
    { key: "advance_deduction", label: "Adv. Ded." },
    { key: "tax_deduction", label: "Tax Ded." },
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
                <TableHead className="sticky left-0 bg-background z-10">Emp ID</TableHead>
                <TableHead className="sticky left-[80px] bg-background z-10 min-w-[120px]">Name</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Payable Days</TableHead>
                <TableHead className="text-right">Payable Salary</TableHead>
                <TableHead className="text-right">OT Hours</TableHead>
                <TableHead className="text-right">OT Amount</TableHead>
                <TableHead className="text-right">Att. Bonus</TableHead>
                <TableHead className="text-right">Arrear</TableHead>
                <TableHead className="text-right">Shift Amt</TableHead>
                <TableHead className="text-right">Roster Amt</TableHead>
                <TableHead className="text-right">Festival Allow.</TableHead>
                <TableHead className="text-right">Absent Ded.</TableHead>
                <TableHead className="text-right">Adv. Ded.</TableHead>
                <TableHead className="text-right">Tax Ded.</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((row) => (
                <TableRow key={row.id} className={row.is_finalized ? "bg-green-50" : ""}>
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
              ))}
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
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="max-w-xs">Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeaves.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.employee_name}</TableCell>
                <TableCell>{l.department}</TableCell>
                <TableCell>{formatDate(l.from_date)}</TableCell>
                <TableCell>{formatDate(l.to_date)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{l.leave_type}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate" title={l.reason}>{l.reason}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>
                    {l.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {l.status === "pending" && canEdit ? (
                    <LeaveActionDialog leave={l} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
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
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-center">CL</TableHead>
                  <TableHead className="text-center">SL</TableHead>
                  <TableHead className="text-center">EL</TableHead>
                  <TableHead className="text-center">PL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.slice(0, 20).map((emp) => {
                  const bal = leaveBalances[emp.id];
                  return (
                    <TableRow key={emp.id}>
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
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leave Type <span className="text-destructive">*</span></Label>
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
              <Label>From date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>To date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
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
            <Label>Remarks (optional)</Label>
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
