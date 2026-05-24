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
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
import { useColumnConfig } from "@/hooks/useColumnConfig";
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
} from "lucide-react";

export const Route = createFileRoute("/_app/hr")({
  head: () => ({ meta: [{ title: "HR — SpinFlow ERP" }] }),
  component: HRPage,
});

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

interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
  is_active: boolean;
}

function HRPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "hr");
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "MILL_OWNER";
  const empQ = useQuery({
    queryKey: ["employees"],
    queryFn: hrApi.getEmployees,
    staleTime: 60_000,
    retry: 1,
  });
  const attQ = useQuery({
    queryKey: ["attendance"],
    queryFn: hrApi.getAttendance,
    staleTime: 60_000,
    retry: 1,
  });
  const leaveQ = useQuery({
    queryKey: ["leave-requests"],
    queryFn: hrApi.getLeaves,
    staleTime: 60_000,
    retry: 1,
  });

  const employees: EmployeeRow[] = empQ.data ?? [];
  const attendance: AttendanceRow[] = attQ.data ?? [];
  const leaves: LeaveRow[] = leaveQ.data ?? [];

  const [attFiltered, setAttFiltered] = useState<AttendanceRow[]>([]);
  const [leaveFiltered, setLeaveFiltered] = useState<LeaveRow[]>([]);
  const [empFiltered, setEmpFiltered] = useState<EmployeeRow[]>([]);

  const { visibleKeys: attVk } = useColumnConfig("hr", "attendance");
  const { visibleKeys: leaveVk } = useColumnConfig("hr", "leaves");
  const { visibleKeys: empVk } = useColumnConfig("hr", "employees");

  useEffect(() => {
    setAttFiltered((attQ.data ?? []) as AttendanceRow[]);
  }, [attQ.data]);
  useEffect(() => {
    setLeaveFiltered((leaveQ.data ?? []) as LeaveRow[]);
  }, [leaveQ.data]);
  useEffect(() => {
    setEmpFiltered((empQ.data ?? []) as EmployeeRow[]);
  }, [empQ.data]);

  const activeEmployees = employees.filter((e) => e.is_active).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPresent = attendance.filter(
    (a) => a.date === todayStr && a.status === "present",
  ).length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const todayAbsent = attendance.filter((a) => a.date === todayStr && a.status === "absent").length;

  const attColumns = [
    { key: "date", label: "Date" },
    { key: "employee_name", label: "Employee" },
    { key: "department", label: "Department" },
    { key: "shift", label: "Shift" },
    { key: "status", label: "Status" },
  ];
  const leaveColumns = [
    { key: "employee_name", label: "Employee" },
    { key: "department", label: "Department" },
    { key: "leave_type", label: "Type" },
    { key: "status", label: "Status" },
  ];
  const empColumns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "department", label: "Department" },
    { key: "role", label: "Role" },
    { key: "is_active", label: "Status" },
  ];

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
        subtitle="Attendance, shift allocation, leave management & payroll"
      />
      <AccessGuard module="hr">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Active Employees
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  {activeEmployees}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Present Today
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <UserCheck className="size-5 text-success" />
                  {todayPresent}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Pending Leaves
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <CalendarCheck className="size-5 text-warning" />
                  {pendingLeaves}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Absent Today
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Clock className="size-5 text-destructive" />
                  {todayAbsent}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="attendance">
            <TabsList>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
            </TabsList>

            <TabsContent value="attendance">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Daily Attendance</CardTitle>
                  <div className="flex gap-1">
                    {isAdmin && <ColumnConfigurator module="hr" tableKey="attendance" />}
                    {canEdit && <MarkAttendanceSheet employees={employees} />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={attendance}
                    onFilter={setAttFiltered}
                    columns={attColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {attVk.has("date") && <TableHead>Date</TableHead>}
                          {attVk.has("employee_name") && <TableHead>Employee</TableHead>}
                          {attVk.has("department") && <TableHead>Department</TableHead>}
                          {attVk.has("shift") && <TableHead>Shift</TableHead>}
                          {attVk.has("status") && <TableHead>Status</TableHead>}
                          {attVk.has("check_in") && <TableHead>Check In</TableHead>}
                          {attVk.has("check_out") && <TableHead>Check Out</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attFiltered.map((a) => (
                          <TableRow key={a.id}>
                            {attVk.has("date") && (
                              <TableCell className="text-sm">{a.date}</TableCell>
                            )}
                            {attVk.has("employee_name") && (
                              <TableCell className="font-medium">{a.employee_name}</TableCell>
                            )}
                            {attVk.has("department") && <TableCell>{a.department}</TableCell>}
                            {attVk.has("shift") && (
                              <TableCell>
                                <Badge variant="outline">{a.shift}</Badge>
                              </TableCell>
                            )}
                            {attVk.has("status") && (
                              <TableCell>
                                <Badge
                                  variant={
                                    a.status === "present"
                                      ? "default"
                                      : a.status === "absent"
                                        ? "destructive"
                                        : a.status === "half-day"
                                          ? "secondary"
                                          : "outline"
                                  }
                                >
                                  {a.status}
                                </Badge>
                              </TableCell>
                            )}
                            {attVk.has("check_in") && <TableCell>{a.check_in}</TableCell>}
                            {attVk.has("check_out") && <TableCell>{a.check_out}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leaves">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Leave Requests</CardTitle>
                  <div className="flex gap-1">
                    {isAdmin && <ColumnConfigurator module="hr" tableKey="leaves" />}
                    {canEdit && <NewLeaveDialog employees={employees} />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={leaves}
                    onFilter={setLeaveFiltered}
                    columns={leaveColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {leaveVk.has("employee_name") && <TableHead>Employee</TableHead>}
                          {leaveVk.has("department") && <TableHead>Department</TableHead>}
                          {leaveVk.has("from_date") && <TableHead>From</TableHead>}
                          {leaveVk.has("to_date") && <TableHead>To</TableHead>}
                          {leaveVk.has("leave_type") && <TableHead>Type</TableHead>}
                          {leaveVk.has("reason") && <TableHead>Reason</TableHead>}
                          {leaveVk.has("status") && <TableHead>Status</TableHead>}
                          {leaveVk.has("status") && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leaveFiltered.map((l) => (
                          <TableRow key={l.id}>
                            {leaveVk.has("employee_name") && (
                              <TableCell className="font-medium">{l.employee_name}</TableCell>
                            )}
                            {leaveVk.has("department") && <TableCell>{l.department}</TableCell>}
                            {leaveVk.has("from_date") && (
                              <TableCell className="text-sm">{l.from_date}</TableCell>
                            )}
                            {leaveVk.has("to_date") && (
                              <TableCell className="text-sm">{l.to_date}</TableCell>
                            )}
                            {leaveVk.has("leave_type") && (
                              <TableCell>
                                <Badge variant="outline">{l.leave_type}</Badge>
                              </TableCell>
                            )}
                            {leaveVk.has("reason") && (
                              <TableCell className="max-w-[200px] truncate">{l.reason}</TableCell>
                            )}
                            {leaveVk.has("status") && (
                              <TableCell>
                                <Badge
                                  variant={
                                    l.status === "approved"
                                      ? "default"
                                      : l.status === "rejected"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {l.status}
                                </Badge>
                              </TableCell>
                            )}
                            {leaveVk.has("status") && (
                              <TableCell>
                                {l.status === "pending" && canEdit && (
                                  <LeaveActionDialog leave={l} />
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employees">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Employee Directory</CardTitle>
                  <div className="flex gap-1">
                    {isAdmin && <ColumnConfigurator module="hr" tableKey="employees" />}
                    {canEdit && <ImportEmployeeDialog />}
                    {canEdit && <AddEmployeeSheet />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={employees}
                    onFilter={setEmpFiltered}
                    columns={empColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          {empVk.has("code") && <TableHead>Code</TableHead>}
                          {empVk.has("name") && <TableHead>Name</TableHead>}
                          {empVk.has("department") && <TableHead>Department</TableHead>}
                          {empVk.has("role") && <TableHead>Role</TableHead>}
                          {empVk.has("phone") && <TableHead>Phone</TableHead>}
                          {empVk.has("is_active") && <TableHead>Status</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {empFiltered.map((e) => (
                          <TableRow key={e.id}>
                            {empVk.has("code") && (
                              <TableCell className="font-mono text-xs">{e.code}</TableCell>
                            )}
                            {empVk.has("name") && (
                              <TableCell className="font-medium">{e.name}</TableCell>
                            )}
                            {empVk.has("department") && <TableCell>{e.department}</TableCell>}
                            {empVk.has("role") && <TableCell>{e.role}</TableCell>}
                            {empVk.has("phone") && <TableCell>{e.phone}</TableCell>}
                            {empVk.has("is_active") && (
                              <TableCell>
                                <Badge variant={e.is_active ? "default" : "secondary"}>
                                  {e.is_active ? "active" : "inactive"}
                                </Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

const STATUS_OPTIONS = ["present", "absent", "half-day", "leave"] as const;

function MarkAttendanceSheet({ employees }: { employees: EmployeeRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deptFilter, setDeptFilter] = useState("all");
  const [records, setRecords] = useState<Record<string, string>>({});

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department))].sort(),
    [employees],
  );

  const filteredEmps = useMemo(
    () => (deptFilter === "all" ? employees : employees.filter((e) => e.department === deptFilter)),
    [employees, deptFilter],
  );

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const e of filteredEmps) {
      init[e.id] = "present";
    }
    setRecords(init);
  }, [filteredEmps]);

  const m = useMutation({
    mutationFn: (recs: typeof records) => {
      const payload = {
        attendance_date: date,
        records: Object.entries(recs).map(([employeeId, status]) => ({
          employee_id: employeeId,
          attendance_date: date,
          status,
          in_time: status === "present" ? "08:00" : null,
          out_time: status === "present" ? "17:00" : null,
          overtime_hours: 0,
        })),
      };
      return hrApi.createBulkAttendance(payload);
    },
  });

  const handleSubmit = () => {
    m.mutate(records, {
      onSuccess: () => {
        toast.success(`Attendance marked for ${Object.keys(records).length} employees`);
        qc.invalidateQueries({ queryKey: ["attendance"] });
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
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Mark Attendance</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md max-h-80 overflow-y-auto">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[640px] w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmps.map((emp, i) => (
                    <TableRow key={emp.id}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>
                        <Select
                          value={records[emp.id] ?? "present"}
                          onValueChange={(v) => setRecords((prev) => ({ ...prev, [emp.id]: v }))}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
            {m.isPending ? "Saving…" : "Save Attendance"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

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
        qc.invalidateQueries({ queryKey: ["leave-requests"] });
        setFiles([]);
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New leave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New leave request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => setForm({ ...form, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) => setForm({ ...form, leave_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CL">Casual Leave (CL)</SelectItem>
                  <SelectItem value="SL">Sick Leave (SL)</SelectItem>
                  <SelectItem value="PL">Privilege Leave (PL)</SelectItem>
                  <SelectItem value="LOP">Leave Without Pay (LOP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From date</Label>
              <Input
                type="date"
                value={form.from_date}
                onChange={(e) => setForm({ ...form, from_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>To date</Label>
              <Input
                type="date"
                value={form.to_date}
                onChange={(e) => setForm({ ...form, to_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Reason</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
                rows={3}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Attachment</Label>
              <FileUpload files={files} onFilesChange={setFiles} multiple={false} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
        qc.invalidateQueries({ queryKey: ["leave-requests"] });
        setOpen(false);
        setRemarks("");
      },
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
            <p>
              <strong>Employee:</strong> {leave.employee_name}
            </p>
            <p>
              <strong>Type:</strong> {leave.leave_type}
            </p>
            <p>
              <strong>From:</strong> {leave.from_date} <strong>To:</strong> {leave.to_date}
            </p>
            <p>
              <strong>Reason:</strong> {leave.reason}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks (optional)</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={() => handleAction("rejected")}
            disabled={rejectM.isPending}
          >
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

function downloadEmployeeTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "Employee Code",
      "Full Name",
      "Department",
      "Designation",
      "Shift (A/B/C/General)",
      "Date of Joining (DD/MM/YYYY)",
      "Phone",
      "Daily Wage",
    ],
    ["EMP001", "Ravi Kumar", "Spinning", "Operator", "A", "01/06/2024", "9876543210", "500"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "employee_import_template.xlsx");
}

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

function detectColumn(headers: string[], candidates: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (candidates.some((c) => h.includes(c.toLowerCase()))) {
      return i;
    }
  }
  return null;
}

const VALID_SHIFTS = [
  "A",
  "B",
  "C",
  "General",
  "Morning",
  "Evening",
  "Night",
  "Day",
  "1",
  "2",
  "3",
];

function normalizeShift(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "1" || v === "morning") return "A";
  if (v === "2" || v === "evening") return "B";
  if (v === "3" || v === "night") return "C";
  if (v === "day" || v === "general") return "General";
  if (["a", "b", "c"].includes(v)) return v.toUpperCase();
  return value;
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
  const get = (field: string) =>
    colMap[field] !== undefined ? String(row[colMap[field]] ?? "").trim() : "";
  const employee_code = get("code");
  const full_name = get("name");
  const department = get("department");
  if (!employee_code && !full_name) return null;

  let shift = get("shift");
  if (shift) {
    const normalized = normalizeShift(shift);
    if (!VALID_SHIFTS.includes(normalized)) {
      return {
        employee_code,
        full_name,
        department,
        designation: get("designation"),
        shift,
        date_of_joining: get("doj"),
        phone: get("phone"),
        daily_wage: get("daily_wage"),
        _error: `Invalid shift: ${shift}`,
      };
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
    _error: !employee_code
      ? "Missing employee code"
      : !full_name
        ? "Missing full name"
        : !department
          ? "Missing department"
          : undefined,
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

const ROW_KEY_TO_FIELD: Record<string, string> = {
  employee_code: "code",
  full_name: "name",
  department: "department",
  designation: "designation",
  shift: "shift",
  date_of_joining: "doj",
  phone: "phone",
  daily_wage: "daily_wage",
};

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
    const parsed = rawRows
      .map((row) => parseEmployeeRow(row, colMap))
      .filter((r): r is EmpImportRow => r !== null);
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
    const validated = rows.map((r) => ({
      ...r,
      shift: normalizeShift(r.shift) || "General",
    }));
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
        qc.invalidateQueries({ queryKey: ["employees"] });
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
              if (e.key === "Enter") setEditingCell(null);
              if (e.key === "Escape") setEditingCell(null);
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Employees from Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
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
              <span className="text-sm text-muted-foreground">
                {validCount} valid, {errorCount} errors
              </span>
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
                      const detectedHeader =
                        detectedIdx !== undefined ? headers[detectedIdx] : null;
                      return (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{FIELD_TO_LABEL[field]}</TableCell>
                          <TableCell>
                            <Select
                              value={detectedIdx !== undefined ? String(detectedIdx) : ""}
                              onValueChange={(v) =>
                                setColMap((prev) => ({
                                  ...prev,
                                  [field]: v ? Number(v) : (undefined as any),
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select column..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">(none)</SelectItem>
                                {headers.map((h, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    {h || `Column ${i + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            {detectedHeader ? (
                              <span className="text-green-600 text-sm">&#10003;</span>
                            ) : (
                              <span className="text-muted-foreground">&#8212;</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={applyMapping}>
                  Apply Mapping
                </Button>
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
                      <TableCell
                        className={cn(
                          "max-w-[140px] truncate",
                          r._error ? "text-destructive" : "text-green-600",
                        )}
                        title={r._error}
                      >
                        {r._error || "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && (
                <div className="text-xs text-center text-muted-foreground py-2 border-t">
                  Showing 50 of {rows.length} rows
                </div>
              )}
            </div>
          )}

          {activeTab === "preview" && rows.length === 0 && headers.length > 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No valid data rows found. Check your column mapping.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setFileName("");
              setHeaders([]);
              setColMap({});
              setRows([]);
              setRawRows([]);
              setDirtyCells(new Set());
              setEditingCell(null);
              setActiveTab("mapping");
            }}
          >
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

function AddEmployeeSheet() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    department: "",
    designation: "",
    shift: "General",
    date_of_joining: new Date().toISOString().slice(0, 10),
    phone: "",
    daily_wage: 0,
  });

  const m = useMutation({
    mutationFn: () => hrApi.createEmployee(form),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Employee added");
        qc.invalidateQueries({ queryKey: ["employees"] });
        setOpen(false);
        setForm({
          employee_code: "",
          full_name: "",
          department: "",
          designation: "",
          shift: "General",
          date_of_joining: new Date().toISOString().slice(0, 10),
          phone: "",
          daily_wage: 0,
        });
      },
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
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add Employee</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-4">
          <div className="space-y-1.5">
            <Label>Employee Code *</Label>
            <Input
              value={form.employee_code}
              onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Department *</Label>
            <Select
              value={form.department}
              onValueChange={(v) => setForm({ ...form, department: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Designation *</Label>
            <Input
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date of Joining</Label>
            <Input
              type="date"
              value={form.date_of_joining}
              onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Daily Wage</Label>
            <Input
              type="number"
              min={0}
              value={form.daily_wage}
              onChange={(e) => setForm({ ...form, daily_wage: Number(e.target.value) })}
            />
          </div>
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
