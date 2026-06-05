import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mastersApi, auditApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldCheck, Activity, Monitor } from "lucide-react";

export const Route = createFileRoute("/_app/admin/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — Admin — SpinFlow ERP" }] }),
  component: AuditPage,
});

const ACTION_VARIANTS: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  login: "default",
  logout: "secondary",
  create: "default",
  update: "secondary",
  delete: "destructive",
  approve: "default",
  reject: "destructive",
};

function fmtTimestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

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

function AuditPage() {
  const user = useAuth((s) => s.user);

  const { data: companiesData } = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });

  const logsQ = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () => auditApi.getLogs({ page: 1, page_size: 500 }),
    staleTime: 60_000,
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
    { key: "user_name", label: "User ID" },
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
        <Badge variant={ACTION_VARIANTS[l.action] || "secondary"}>{l.action}</Badge>
      ),
    },
    {
      key: "entity",
      label: "Module",
      render: (l: any) => humanEntity(l.entity),
    },
    { key: "details", label: "Details", className: "max-w-xs truncate" },
  ];

  if (logsQ.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading audit logs…</div>
    );
  }

  if (logsQ.isError) {
    return (
      <div className="p-6 text-sm text-destructive">Failed to load audit logs.</div>
    );
  }

  const totalLogs = logs.length;
  const loginActions = logs.filter((l) => l.action === "login" || l.action === "logout").length;
  const createActions = logs.filter((l) => l.action === "create").length;
  const approveActions = logs.filter((l) => l.action === "approve" || l.action === "reject").length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View audit trail across all companies
        </p>
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
          <CardTitle className="text-base">Audit Trail ({totalLogs})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            tableId="admin_audit_logs"
            columns={columns}
            data={logs}
            loading={logsQ.isLoading}
            rowKey={(l) => l.id ?? l.timestamp}
            exportFilename="admin_audit_logs"
            emptyMessage="No audit events yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
