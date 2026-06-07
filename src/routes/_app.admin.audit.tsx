import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mastersApi, auditApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FileText, ShieldCheck, Activity, Monitor, Search, X, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — Admin — SpinFlow ERP" }] }),
  component: AuditPage,
});

const ACTION_COLORS: Record<string, string> = {
  login: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  logout: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed_login: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  create: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  approve: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  reject: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  user_deactivated: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  user_activated: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  failed_login: "Failed Login",
  create: "Create",
  update: "Update",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  user_deactivated: "Deactivated",
  user_activated: "Activated",
};

const ENTITIES = [
  "employee", "attendance", "leave", "payroll", "production",
  "dispatch", "quality", "purchase", "stores", "accounts",
  "invoice", "user", "company", "mill", "module",
  "role", "maintenance", "report", "settings",
];

function humanEntity(entity: string): string {
  const labels: Record<string, string> = {
    employee: "Employee", attendance: "Attendance", leave: "Leave",
    payroll: "Payroll", production: "Production", dispatch: "Dispatch",
    quality: "Quality", purchase: "Purchase", stores: "Stores",
    accounts: "Accounts", invoice: "Invoice", user: "User",
    company: "Company", mill: "Mill", module: "Module",
    role: "Role", maintenance: "Maintenance", report: "Report",
    settings: "Settings",
  };
  return labels[entity] || entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTimestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function AuditPage() {
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: companiesData } = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 500, true),
    staleTime: 60_000,
  });

  const logsQ = useQuery({
    queryKey: ["admin-audit-logs", { search, action: actionFilter, entity: entityFilter, date_from: dateFrom, date_to: dateTo }],
    queryFn: () => auditApi.getLogs({
      page: 1,
      page_size: 500,
      search: search || undefined,
      action: actionFilter || undefined,
      entity: entityFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    staleTime: 30_000,
    retry: 1,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const companies = (Array.isArray(companiesData) ? companiesData : []) as any[];
  const logs: any[] = Array.isArray(logsQ.data) ? logsQ.data : [];

  const companyMap = new Map(companies.map((c: any) => [c.id, c.name]));

  const columns: ColDef[] = [
    {
      key: "timestamp",
      label: "Date",
      render: (l: any) => <span className="text-xs whitespace-nowrap">{fmtTimestamp(l.timestamp)}</span>,
    },
    { key: "user_name", label: "User" },
    {
      key: "_company",
      label: "Company",
      render: (l: any) => {
        if (l.entity === "company" && l.entity_id) {
          return companyMap.get(l.entity_id) ?? l.entity_id;
        }
        if (l.details) {
          try {
            const parsed = typeof l.details === "string" ? JSON.parse(l.details) : l.details;
            if (parsed?.company_id) return companyMap.get(parsed.company_id) ?? parsed.company_id;
          } catch {}
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "action",
      label: "Action",
      render: (l: any) => (
        <Badge className={cn("font-medium", ACTION_COLORS[l.action] ?? "bg-gray-100 text-gray-600")}>
          {ACTION_LABELS[l.action] ?? l.action}
        </Badge>
      ),
    },
    {
      key: "entity",
      label: "Module",
      render: (l: any) => humanEntity(l.entity),
    },
    { key: "details", label: "Details", className: "max-w-xs truncate" },
  ];

  const hasAnyFilter = search || actionFilter || entityFilter || dateFrom || dateTo;
  const totalLogs = logs.length;
  const loginActions = logs.filter((l) => l.action === "login" || l.action === "logout" || l.action === "failed_login").length;
  const createActions = logs.filter((l) => l.action === "create").length;
  const approveActions = logs.filter((l) => l.action === "approve" || l.action === "reject").length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View audit trail across all companies
          </p>
        </div>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setActionFilter(""); setEntityFilter(""); setDateFrom(""); setDateTo(""); }}>
            <X className="size-3.5 mr-1" /> Clear Filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input placeholder="Search details, user, entity…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1 w-44">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 w-44">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All modules" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {ENTITIES.map((e) => <SelectItem key={e} value={e}>{humanEntity(e)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 w-40">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1 w-40">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground font-medium">Total Events</div>
            <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {totalLogs}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground font-medium">Auth Events</div>
            <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
              <ShieldCheck className="size-5 text-green-600" />
              {loginActions}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground font-medium">Create Actions</div>
            <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              {createActions}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground font-medium">Approvals</div>
            <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
              <Monitor className="size-5 text-amber-500" />
              {approveActions}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Trail {!logsQ.isLoading && `(${totalLogs})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {logsQ.isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading audit logs…</div>
          ) : logsQ.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-6 text-center">
              <AlertTriangle className="size-8 mx-auto mb-2 text-red-500" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load audit logs.</p>
              <p className="text-xs text-red-500 mt-1 mb-3">{(logsQ.error as any)?.response?.data?.detail ?? (logsQ.error as any)?.message ?? "Request failed"}</p>
              <Button variant="outline" size="sm" onClick={() => logsQ.refetch()}>Retry</Button>
            </div>
          ) : (
            <DataTable
              tableId="admin_audit_logs"
              columns={columns}
              data={logs}
              loading={false}
              rowKey={(l) => l.id ?? l.timestamp}
              exportFilename="admin_audit_logs"
              emptyMessage={hasAnyFilter ? "No audit events match your filters." : "No audit events yet."}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
