import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maintenanceApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
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
import { Button } from "@/components/ui/button";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Wrench, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import type { MaintenanceTask } from "@/lib/types";

export const Route = createFileRoute("/_app/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — SpinFlow ERP" }] }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const user = useAuth((s) => s.user)!;
  const canEdit = canWrite(user.role, "maintenance");
  const maintQ = useQuery({ queryKey: ["maintenance-tasks"], queryFn: maintenanceApi.getTasks });

  const tasks = maintQ.data ?? [];

  const [filteredTasks, setFilteredTasks] = useState(tasks);
  useEffect(() => { setFilteredTasks(tasks); }, [tasks]);

  const openTasks = tasks.filter((t) => t.status === "open").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const completedToday = tasks.filter(
    (t) => t.status === "completed" && t.date === new Date().toISOString().slice(0, 10),
  ).length;
  const totalDownTime = tasks.reduce((s, t) => s + t.downtimeMin, 0);

  return (
    <>
      <Topbar
        title="Maintenance"
        subtitle="Breakdown logging, preventive maintenance, technician tracking & MTTR/MTBF"
      />
      <AccessGuard module="maintenance">
        <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">Open Tasks</div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                {openTasks}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">In Progress</div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <Activity className="size-5 text-warning" />
                {inProgress}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Completed Today
              </div>
              <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                {completedToday}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Total Downtime
              </div>
              <div className="text-2xl font-semibold mt-2">{totalDownTime} min</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maintenance Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ExcelColumnFilter
              data={tasks}
              onFilter={setFilteredTasks}
              columns={[
                { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                { key: "type" as const, label: "Type", placeholder: "Filter type..." },
                { key: "machineCode" as const, label: "Machine", placeholder: "Filter machine..." },
                { key: "department" as const, label: "Department", placeholder: "Filter dept..." },
                { key: "technician" as const, label: "Technician", placeholder: "Filter tech..." },
                { key: "spareUsed" as const, label: "Spare", placeholder: "Filter spare..." },
                { key: "status" as const, label: "Status", placeholder: "Filter status..." },
              ]}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-right">Downtime</TableHead>
                  <TableHead>Spare</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{t.date}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.type === "breakdown"
                            ? "destructive"
                            : t.type === "preventive"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.machineCode}</TableCell>
                    <TableCell>{t.department}</TableCell>
                    <TableCell className="max-w-[250px] truncate">{t.description}</TableCell>
                    <TableCell>{t.technician}</TableCell>
                    <TableCell className="text-right">{t.downtimeMin} min</TableCell>
                    <TableCell className="text-sm">{t.spareUsed || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === "completed"
                            ? "default"
                            : t.status === "in-progress"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        {t.status !== "completed" && (
                          <StatusSelect taskId={t.id} currentStatus={t.status} />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      </AccessGuard>
    </>
  );
}

function StatusSelect({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: MaintenanceTask["status"];
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (newStatus: MaintenanceTask["status"]) =>
      maintenanceApi.updateStatus(taskId, { status: newStatus }),
  });

  const nextStatus = currentStatus === "open" ? ("in-progress" as const) : ("completed" as const);

  const handleUpdateStatus = () => {
    m.mutate(nextStatus, {
      onSuccess: () => {
        toast.success("Task status updated");
        qc.invalidateQueries({ queryKey: ["maintenance-tasks"] });
      },
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={handleUpdateStatus} disabled={m.isPending}>
      {currentStatus === "open" ? "Start" : "Complete"}
    </Button>
  );
}
