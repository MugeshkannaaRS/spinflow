import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import {
  FileText, Activity, ShieldCheck, Monitor,
  Download, Search, Filter, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — SpinFlow ERP" }] }),
  component: AuditPage,
});

const ENTITY_LABELS: Record<string, string> = {
  employee: "Employee", attendance: "Attendance", leave: "Leave",
  payroll: "Payroll", production: "Production", dispatch: "Dispatch",
  quality: "Quality", purchase: "Purchase", stores: "Stores",
  accounts: "Accounts", invoice: "Invoice", user: "User",
  company: "Company", mill: "Mill", module: "Module",
  role: "Role", maintenance: "Maintenance",
};

function fmtTs(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function humanEntity(entity: string): string {
  return ENTITY_LABELS[entity] || entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_VARIANTS: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  login: "default", logout: "secondary",
  create: "default", update: "secondary",
  delete: "destructive", approve: "default", reject: "destructive",
};

const SEVERITY_BADGE: Record<string, string> = {
  EMERGENCY: "bg-red-100 text-red-700",
  CRITICAL:  "bg-red-100 text-red-600",
  WARNING:   "bg-amber-100 text-amber-700",
  INFO:      "bg-blue-50 text-blue-600",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "SECURITY",      label: "Security" },
  { value: "USER_ACTIVITY", label: "User Activity" },
  { value: "PRODUCTION",    label: "Production" },
  { value: "INVENTORY",     label: "Inventory" },
  { value: "HR",            label: "HR" },
  { value: "PAYROLL",       label: "Payroll" },
  { value: "PURCHASE",      label: "Purchase" },
  { value: "SALES",         label: "Sales" },
  { value: "BILLING",       label: "Billing" },
  { value: "SYSTEM",        label: "System" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severity" },
  { value: "INFO",      label: "Info" },
  { value: "WARNING",   label: "Warning" },
  { value: "CRITICAL",  label: "Critical" },
  { value: "EMERGENCY", label: "Emergency" },
];

const AUDIT_COLS: ColDef[] = [
  {
    key: "timestamp",
    label: "Timestamp",
    render: (l: any) => <span className="text-xs whitespace-nowrap">{fmtTs(l.timestamp)}</span>,
  },
  { key: "user_name", label: "User" },
  { key: "role", label: "Role", type: "status" },
  {
    key: "action",
    label: "Action",
    render: (l: any) => (
      <Badge variant={ACTION_VARIANTS[l.action] || "secondary"}>{l.action}</Badge>
    ),
  },
  {
    key: "entity",
    label: "Entity",
    render: (l: any) => (
      <span>
        {humanEntity(l.entity)}
        {l.entity_name && <span className="text-xs text-gray-600 ml-1">({l.entity_name})</span>}
      </span>
    ),
  },
  {
    key: "category",
    label: "Category",
    render: (l: any) => l.category ? (
      <span className="text-xs text-gray-600">{l.category.replace(/_/g, " ")}</span>
    ) : null,
  },
  {
    key: "severity",
    label: "Severity",
    render: (l: any) => l.severity ? (
      <span className={cn(
        "text-[11px] font-semibold px-1.5 py-0.5 rounded uppercase",
        SEVERITY_BADGE[l.severity] || "bg-gray-100 text-gray-600"
      )}>
        {l.severity}
      </span>
    ) : null,
  },
  { key: "details", label: "Details", className: "max-w-xs truncate" },
  { key: "ip_address", label: "IP", className: "font-mono text-xs" },
];

function AuditPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const pageSize = 50;

  const params: Record<string, any> = {
    page, page_size: pageSize,
    search: search || undefined,
    category: category || undefined,
    severity: severity || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const logsQ = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.get("/audit/logs", { params }).then((r: any) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  const data = logsQ.data;
  const logs: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;

  const totalLogs = total;
  const loginActions = logs.filter((l) => l.action === "login" || l.action === "logout").length;
  const criticalCount = logs.filter((l) => l.severity === "CRITICAL" || l.severity === "EMERGENCY").length;
  const createActions = logs.filter((l) => l.action === "create").length;

  const hasFilters = search || category || severity || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch(""); setCategory(""); setSeverity(""); setDateFrom(""); setDateTo("");
    setPage(1);
  };

  const handleDownload = async (format: "csv" | "xlsx") => {
    try {
      const p = new URLSearchParams();
      p.set("format", format);
      if (search) p.set("search", search);
      if (category) p.set("category", category);
      if (severity) p.set("severity", severity);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);

      const res = await fetch(
        `${API_BASE}/api/v1/audit/logs/export?${p.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <AccessGuard module="audit">
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* KPI cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Events</div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <FileText className="size-5 text-primary" /> {totalLogs}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">Auth Events</div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <ShieldCheck className="size-5 text-green-600" /> {loginActions}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">Creates</div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <Activity className="size-5 text-primary" /> {createActions}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">Critical / Emergency</div>
              <div className={cn("text-2xl font-semibold mt-2 flex items-center gap-2",
                criticalCount > 0 ? "text-red-600" : ""
              )}>
                <Monitor className="size-5 text-amber-500" /> {criticalCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">Audit Trail</CardTitle>
              <div className="flex items-center gap-2">
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" /> Clear filters
                  </button>
                )}
                <button
                  onClick={() => handleDownload("csv")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 text-gray-700"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={() => handleDownload("xlsx")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 text-gray-700"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  placeholder="Search user, entity, details…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-sm w-56"
                />
              </div>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                className="h-8 text-sm border rounded-md px-2 bg-white text-gray-700"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={severity}
                onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                className="h-8 text-sm border rounded-md px-2 bg-white text-gray-700"
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 text-sm border rounded-md px-2 bg-white text-gray-700"
                placeholder="From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-8 text-sm border rounded-md px-2 bg-white text-gray-700"
                placeholder="To"
              />
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <ErrorBoundary inline label="Audit Logs">
            <DataTable
              tableId="audit_logs"
              columns={AUDIT_COLS}
              data={logs}
              loading={logsQ.isLoading}
              rowKey={(l) => l.id ?? l.timestamp}
              exportFilename="audit_logs"
              emptyMessage="No audit events match your filters."
            />
            </ErrorBoundary>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-4 pt-4 border-t">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {pages} ({total} total)
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGuard>
  );
}
