import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api-service";
import { Topbar } from "@/components/layout/Topbar";
import { AccessGuard } from "@/components/AccessGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { useState, useEffect } from "react";
import { FileText, Activity, ShieldCheck, Monitor } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — SpinFlow ERP" }] }),
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

function AuditPage() {
  const logsQ = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditApi.getLogs(),
    staleTime: 60_000,
    retry: 1,
  });
  const logs: any[] = logsQ.data ?? [];

  const [filteredLogs, setFilteredLogs] = useState(logs);
  useEffect(() => {
    setFilteredLogs(logs);
  }, [logs]);

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
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Events
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <FileText className="size-5 text-primary" />
                  {totalLogs}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Auth Events
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <ShieldCheck className="size-5 text-success" />
                  {loginActions}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Create Actions
                </div>
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
                  <Monitor className="size-5 text-warning" />
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
              <ExcelColumnFilter
                data={logs}
                onFilter={setFilteredLogs}
                columns={[
                  {
                    key: "timestamp" as const,
                    label: "Timestamp",
                    placeholder: "Filter timestamp...",
                  },
                  { key: "user" as const, label: "User", placeholder: "Filter user..." },
                  { key: "role" as const, label: "Role", placeholder: "Filter role..." },
                  { key: "action" as const, label: "Action", placeholder: "Filter action..." },
                  { key: "entity" as const, label: "Entity", placeholder: "Filter entity..." },
                  { key: "details" as const, label: "Details", placeholder: "Filter details..." },
                  { key: "ip" as const, label: "IP Address", placeholder: "Filter IP..." },
                ]}
              />
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[640px] w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm whitespace-nowrap">{l.timestamp}</TableCell>
                        <TableCell className="font-medium">{l.user}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{l.role}</TableCell>
                        <TableCell>
                          <Badge variant={ACTION_VARIANTS[l.action] || "secondary"}>
                            {l.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{l.entity}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-1">
                            #{l.entityId}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          {l.details}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {l.ip}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </AccessGuard>
    </>
  );
}
