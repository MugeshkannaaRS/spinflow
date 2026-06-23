import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Download,
  Upload,
  Clock,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  RefreshCw,
  History,
  Shield,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/backups")({
  head: () => ({ meta: [{ title: "Backup Center — Admin — SpinFlow ERP" }] }),
  component: BackupCenterPage,
});

function BackupCenterPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [selectedBackup, setSelectedBackup] = useState<any>(null);

  const backupsQ = useQuery({
    queryKey: ["admin-backups"],
    queryFn: () => adminApi.getBackups(),
    staleTime: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => adminApi.triggerBackup(),
    onSuccess: () => {
      toast.success("Backup triggered");
      qc.invalidateQueries({ queryKey: ["admin-backups"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to trigger backup"),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminApi.restoreBackup(id),
    onSuccess: () => toast.success("Restore initiated"),
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Restore failed"),
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const backups: any[] = Array.isArray(backupsQ.data?.items ?? backupsQ.data?.data ?? backupsQ.data)
    ? (backupsQ.data?.items ?? backupsQ.data?.data ?? backupsQ.data)
    : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backup Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage database backups, restore, and retention policies
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-backups"] })}
          >
            <RefreshCw className="size-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <HardDrive className="size-3.5 mr-1.5" />
            )}
            Trigger Backup
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Database className="size-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Backups</p>
                <p className="text-xl font-bold">{backups.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-8 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Successful</p>
                <p className="text-xl font-bold">
                  {
                    backups.filter((b: any) => b.status === "completed" || b.status === "success")
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-8 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold">
                  {backups.filter((b: any) => b.status === "failed").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="size-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-xl font-bold">
                  {
                    backups.filter((b: any) => b.status === "in_progress" || b.status === "running")
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Backup list */}
        <div className="lg:col-span-2 space-y-2">
          {backupsQ.isLoading ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Database className="size-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium">No backups</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trigger your first backup to get started.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
              >
                <HardDrive className="size-3.5 mr-1.5" /> Create Backup Now
              </Button>
            </div>
          ) : (
            backups.slice(0, 30).map((b: any) => (
              <Card
                key={b.id}
                className={`cursor-pointer transition-all ${selectedBackup?.id === b.id ? "ring-2 ring-blue-200" : "hover:shadow-sm"}`}
                onClick={() => setSelectedBackup(b)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-1.5 rounded-full ${
                          b.status === "completed" || b.status === "success"
                            ? "bg-green-100 text-green-600"
                            : b.status === "failed"
                              ? "bg-red-100 text-red-600"
                              : "bg-amber-100 text-amber-600"
                        }`}
                      >
                        {b.status === "completed" || b.status === "success" ? (
                          <CheckCircle2 className="size-4" />
                        ) : b.status === "failed" ? (
                          <AlertTriangle className="size-4" />
                        ) : (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {b.filename ?? b.name ?? `Backup ${b.id?.slice(0, 8)}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {b.size_bytes ? `${(b.size_bytes / 1024 / 1024).toFixed(2)} MB` : ""}
                          {b.size_bytes && b.created_at ? " · " : ""}
                          {b.created_at ? new Date(b.created_at).toLocaleString("en-IN") : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={b.status ?? "unknown"} />
                      {b.download_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Download"
                          asChild
                        >
                          <a href={b.download_url} download>
                            <Download className="size-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail & Retention */}
        <div className="space-y-4">
          {/* Selected backup detail */}
          {selectedBackup ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="size-3.5" /> Backup Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono">{selectedBackup.id?.slice(0, 12)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={selectedBackup.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size</span>
                  <span>{(selectedBackup.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">
                    {selectedBackup.backup_type ?? selectedBackup.type ?? "full"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>
                    {selectedBackup.created_at
                      ? new Date(selectedBackup.created_at).toLocaleString("en-IN")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span>
                    {selectedBackup.completed_at
                      ? new Date(selectedBackup.completed_at).toLocaleString("en-IN")
                      : "—"}
                  </span>
                </div>
                <div className="pt-3 flex gap-2">
                  {selectedBackup.download_url && (
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <a href={selectedBackup.download_url} download>
                        <Download className="size-3.5 mr-1" /> Download
                      </a>
                    </Button>
                  )}
                  <div className="flex-1 group relative">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                      disabled
                      title="Restore is not yet available — contact engineering to perform a manual restore"
                    >
                      <Upload className="size-3.5 mr-1" /> Restore
                    </Button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white shadow z-10">
                      Restore not yet available — contact engineering
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Database className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Select a backup</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click a backup to view metadata and download/restore options.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Retention Policies */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="size-3.5" /> Retention Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Daily backups</span>
                <Badge variant="outline">Keep 7</Badge>
              </div>
              <div className="flex justify-between">
                <span>Weekly backups</span>
                <Badge variant="outline">Keep 4</Badge>
              </div>
              <div className="flex justify-between">
                <span>Monthly backups</span>
                <Badge variant="outline">Keep 12</Badge>
              </div>
              <div className="flex justify-between">
                <span>Yearly backups</span>
                <Badge variant="outline">Keep 3</Badge>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-muted-foreground">Auto-cleanup enabled</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
