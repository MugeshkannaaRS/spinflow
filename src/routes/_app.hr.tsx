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
import { useState, useMemo, useEffect } from "react";
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
  const user = useAuth((s) => s.user)!;
  const canEdit = canWrite(user.role, "hr");
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "MILL_OWNER";
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
  const user = useAuth((s) => s.user)!;
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");

  const approveM = useMutation({
    mutationFn: () =>
      hrApi.approveOrRejectLeave({
        id: leave.id,
        leave_id: leave.id,
        action: "approved",
        approved_by: user.name,
        remarks,
      }),
  });

  const rejectM = useMutation({
    mutationFn: () =>
      hrApi.approveOrRejectLeave({
        id: leave.id,
        leave_id: leave.id,
        action: "rejected",
        approved_by: user.name,
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
