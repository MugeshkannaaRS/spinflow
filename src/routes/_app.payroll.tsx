import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { payrollApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { IndianRupee, CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { exportApi } from "@/lib/api-service";
import type { PayrollMonth, PayslipEntry } from "@/lib/types";

export const Route = createFileRoute("/_app/payroll")({
  head: () => ({ meta: [{ title: "Payroll — SpinFlow ERP" }] }),
  component: PayrollPage,
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  processing: "secondary",
  approved: "default",
  paid: "default",
};

function PayrollPage() {
  const user = useAuth((s) => s.user);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState("months");

  const summaryQ = useQuery({
    queryKey: ["payroll-summary", user?.millId ?? "", year],
    queryFn: () => payrollApi.getSummary(user!.millId, year),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  if (!user) return null;

  const summaryData = summaryQ.data ?? [];

  return (
    <>
      <Topbar title="Payroll" subtitle="Monthly payroll processing & payslips" />
      <AccessGuard module="payroll">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <Label className="shrink-0">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="months">Monthly Payroll</TabsTrigger>
              <TabsTrigger value="payslips">Payslips</TabsTrigger>
            </TabsList>

            <TabsContent value="months">
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {MONTHS.map((name, idx) => {
                  const m = idx + 1;
                  const pm = summaryData.find((s: any) => s.month === m);
                  return (
                    <Card key={m} className="relative">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{name}</span>
                          {pm ? (
                            <Badge variant={STATUS_COLORS[pm.status] ?? "outline"}>
                              {pm.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline">—</Badge>
                          )}
                        </div>
                        {pm ? (
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Net</span>
                              <span className="font-medium text-foreground">
                                ₹{pm.total_net.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Employees</span>
                              <span>{pm.total_employees}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Not processed</div>
                        )}
                        <div className="mt-3">
                          <MonthSheet
                            millId={user.millId}
                            month={m}
                            year={year}
                            pm={pm}
                            user={user}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="payslips">
              <PayslipsTab millId={user.millId} year={year} />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function MonthSheet({
  millId,
  month,
  year,
  pm,
  user,
}: {
  millId: string;
  month: number;
  year: number;
  pm: any;
  user: any;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const processM = useMutation({
    mutationFn: () => payrollApi.process({ mill_id: millId, month, year }),
    onSuccess: () => {
      toast.success("Payroll processed");
      qc.invalidateQueries({ queryKey: ["payroll-summary"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to process"),
  });

  const approveM = useMutation({
    mutationFn: () => payrollApi.approve(pm?.id),
    onSuccess: () => {
      toast.success("Payroll approved");
      qc.invalidateQueries({ queryKey: ["payroll-summary"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });

  const markPaidM = useMutation({
    mutationFn: () => payrollApi.markPaid(pm?.id),
    onSuccess: () => {
      toast.success("Payroll marked paid");
      qc.invalidateQueries({ queryKey: ["payroll-summary"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to mark paid"),
  });

  const sameUser = pm && user?.id === pm.processed_by;
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (type: string, fn: () => Promise<void>) => {
    setExporting(type);
    try {
      await fn();
      toast.success(`${type} exported`);
    } catch {
      toast.error(`Failed to export ${type}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          {pm ? "Details" : "Process"}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {MONTHS[month - 1]} {year}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {pm ? (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Status</span>
                  <Badge>{pm.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Gross</span>
                  <span>₹{pm.total_gross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deductions</span>
                  <span className="text-destructive">₹{pm.total_deductions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Net</span>
                  <span>₹{pm.total_net.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>PF</span>
                  <span>₹{pm.total_pf.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ESIC</span>
                  <span>₹{pm.total_esic.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Employees</span>
                  <span>{pm.total_employees}</span>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                {pm.status === "draft" && (
                  <Button
                    className="w-full"
                    onClick={() => processM.mutate()}
                    disabled={processM.isPending}
                  >
                    {processM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                    Process Payroll
                  </Button>
                )}
                {pm.status === "processing" && (
                  <>
                    {sameUser ? (
                      <p className="text-xs text-muted-foreground text-center">
                        Cannot approve — you processed this payroll
                      </p>
                    ) : null}
                    <Button
                      className="w-full"
                      onClick={() => approveM.mutate()}
                      disabled={approveM.isPending || sameUser}
                    >
                      {approveM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                      Approve
                    </Button>
                  </>
                )}
                {pm.status === "approved" && (
                  <Button
                    className="w-full"
                    onClick={() => markPaidM.mutate()}
                    disabled={markPaidM.isPending}
                  >
                    {markPaidM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                    Mark Paid
                  </Button>
                )}
                {pm.status === "paid" && (
                  <p className="text-xs text-green-600 text-center font-medium">
                    <CheckCircle2 className="size-3 inline mr-1" />
                    Paid
                  </p>
                )}
              </div>
              <div className="border-t pt-3 mt-2">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Exports</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleExport("PDF", () => exportApi.payrollPdf(pm.id))}
                    disabled={exporting !== null}
                  >
                    {exporting === "PDF" ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <Download className="size-3 mr-1" />
                    )}
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleExport("XLSX", () => exportApi.payrollXlsx(pm.id))}
                    disabled={exporting !== null}
                  >
                    {exporting === "XLSX" ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <Download className="size-3 mr-1" />
                    )}
                    XLSX
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={() => processM.mutate()}
              disabled={processM.isPending}
            >
              {processM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
              Process Payroll
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PayslipsTab({ millId, year }: { millId: string; year: number }) {
  const currentMonth = new Date().getMonth() + 1;
  const [month, setMonth] = useState(String(currentMonth));
  const [dept, setDept] = useState("");

  const monthsQ = useQuery({
    queryKey: ["payroll-summary", millId, year],
    queryFn: () => payrollApi.getSummary(millId, year),
    staleTime: 60_000,
    retry: 1,
  });

  const pm = (monthsQ.data ?? []).find((s: any) => s.month === Number(month));
  const payrollMonthId = pm?.id;

  const payslipsQ = useQuery({
    queryKey: ["payslips", payrollMonthId, dept],
    queryFn: () => payrollApi.getPayslips(payrollMonthId, dept || undefined),
    enabled: !!payrollMonthId,
    staleTime: 60_000,
    retry: 1,
  });

  const payslips = payslipsQ.data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((n, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            <Input
              className="w-40"
              placeholder="Filter dept..."
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!payrollMonthId ? (
          <p className="text-sm text-muted-foreground">Payroll not yet processed for this month</p>
        ) : (
          <DataTable
            tableId="payroll_payslips"
            columns={[
              { key: "employee_code", label: "Emp Code", className: "font-mono text-xs" },
              { key: "employee_name", label: "Name", render: (p: any) => <span className="font-medium">{p.employee_name}</span> },
              { key: "department", label: "Dept", type: "status" },
              { key: "present_days", label: "Present" },
              { key: "overtime_hours", label: "OT Hrs" },
              { key: "gross_wage", label: "Gross", render: (p: any) => `₹${(p.gross_wage ?? 0).toLocaleString()}` },
              { key: "pf_employee", label: "PF", render: (p: any) => `₹${(p.pf_employee ?? 0).toLocaleString()}` },
              { key: "esic_employee", label: "ESIC", render: (p: any) => `₹${(p.esic_employee ?? 0).toLocaleString()}` },
              { key: "net_wage", label: "Net", render: (p: any) => <span className="font-medium">₹{(p.net_wage ?? 0).toLocaleString()}</span> },
              { key: "status", label: "Status", type: "status", render: (p: any) => <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge> },
            ] satisfies ColDef[]}
            data={payslips}
            loading={payslipsQ.isLoading}
            rowKey={(p: any) => p.id}
            exportFilename={`payslips_${month}_${MONTHS[Number(month) - 1]}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
