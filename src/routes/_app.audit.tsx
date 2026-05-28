import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api-service";
import { Topbar } from "@/components/layout/Topbar";
import { AccessGuard } from "@/components/AccessGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { FileText, Activity, ShieldCheck, Monitor } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — SpinFlow ERP" }] }),
  component: AuditPage,
});

const ENTITY_LABELS: Record<string, string> = {
  employee: "Employee",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  production: "Production",
  dispatch: "Dispatch",
  quality: "Quality",
  purchase: "Purchase",
  stores: "Stores",
  accounts: "Accounts",
  invoice: "Invoice",
  user: "User",
  company: "Company",
  mill: "Mill",
  module: "Module",
  role: "Role",
  maintenance: "Maintenance",
  report: "Report",
  settings: "Settings",
};

function fmtAuditTimestamp(ts: string): string {
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
  login: "default",
  logout: "secondary",
  create: "default",
  update: "secondary",
  delete: "destructive",
  approve: "default",
  reject: "destructive",
};

const AUDIT_COLS: ColDef[] = [
  {
    key: "timestamp",
    label: "Timestamp",
    type: "date",
    render: (l: any) => <span className="text-xs whitespace-nowrap">{fmtAuditTimestamp(l.timestamp)}</span>,
  },
  { key: "user_name", label: "User" },
  { key: "role", label: "Role", type: "status" },
  {
    key: "action",
    label: "Action",
    type: "status",
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
        {l.entity_id && <span className="font-mono text-xs text-muted-foreground ml-1">#{l.entity_id}</span>}
      </span>
    ),
  },
  { key: "details", label: "Details", className: "max-w-xs truncate" },
  { key: "ip_address", label: "IP Address", className: "font-mono text-xs" },
];

function AuditPage() {
  const logsQ = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditApi.getLogs(),
    staleTime: 60_000,
    retry: 1,
  });
  const logs: any[] = logsQ.data ?? [];

  if (logsQ.isLoading)
    return (
      <>
        <Topbar title="Audit Logs" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (logsQ.isError)
    return (
      <>
        <Topbar title="Audit Logs" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  const totalLogs = logs.length;
  const loginActions = logs.filter((l) => l.action === "login" || l.action === "logout").length;
  const createActions = logs.filter((l) => l.action === "create").length;
  const approveActions = logs.filter((l) => l.action === "approve" || l.action === "reject").length;

  return (
    <>
      <Topbar
        title="Audit Logs"
        subtitle="Complete trail of user actions, system changes & security events"
      />
      <AccessGuard module="audit">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
              <CardTitle className="text-base">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                tableId="audit_logs"
                columns={AUDIT_COLS}
                data={logs}
                loading={logsQ.isLoading}
                rowKey={(l) => l.id ?? l.timestamp}
                exportFilename="audit_logs"
                emptyMessage="No audit events yet."
              />
            </CardContent>
          </Card>
        </div>
      </AccessGuard>
    </>
  );
}
