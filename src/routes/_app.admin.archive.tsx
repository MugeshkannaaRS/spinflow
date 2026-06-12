import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, CheckCircle, Trash2, Undo } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/admin/archive")({
  head: () => ({ meta: [{ title: "Archive — Admin — SpinFlow ERP" }] }),
  component: ArchivePage,
});

type Tab = "suspended" | "archived";

function ArchivePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("suspended");
  const [reactivateTarget, setReactivateTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [deleting, setDeleting] = useState(false);

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 500, true),
    staleTime: 60_000,
    retry: 1,
  });

  const companies: any[] = (companiesQ.data ?? []) as any[];
  const suspendedCompanies = companies.filter((c: any) => c.status === "suspended" || (c.status !== "archived" && c.is_active === false));
  const archivedCompanies = companies.filter((c: any) => c.status === "archived");

  const handleReactivate = async (company: any) => {
    try {
      await adminApi.suspendCompany(company.id, "active");
      toast.success(`${company.name} has been activated`);
      setReactivateTarget(null);
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
    } catch {
      toast.error("Failed to reactivate company");
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    if (confirmCode !== deleteTarget.code) {
      toast.error("Company code does not match");
      return;
    }
    setDeleting(true);
    try {
      await adminApi.permanentDeleteCompany(deleteTarget.id, confirmCode);
      toast.success(`${deleteTarget.name} has been permanently deleted`);
      setDeleteTarget(null);
      setConfirmCode("");
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
    } catch {
      toast.error("Failed to delete company");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColDef[] = [
    { key: "name", label: "Company Name", render: (c: any) => <span className="font-medium">{c.name}</span> },
    { key: "code", label: "Code" },
    { key: "gstin", label: "GSTIN" },
    { key: "plan", label: "Plan" },
    {
      key: "status",
      label: "Status",
      render: (c: any) => (
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
            c.status === "archived"
              ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
          )}
        >
          {c.status === "archived" ? "Archived" : "Suspended"}
        </span>
      ),
    },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "suspended", label: "Suspended", count: suspendedCompanies.length },
    { key: "archived", label: "Archived", count: archivedCompanies.length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage suspended and archived companies</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {activeTab === "suspended" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suspended Companies ({suspendedCompanies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorBoundary inline label="Suspended Companies">
            <DataTable
              columns={columns}
              data={suspendedCompanies}
              rowKey={(c: any) => c.id}
              emptyMessage="No suspended companies found."
              actions={(item: any) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 hover:bg-green-50 border-green-200"
                    onClick={() => setReactivateTarget(item)}
                  >
                    <CheckCircle className="size-3.5 mr-1" /> Reactivate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 border-red-200"
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className="size-3.5 mr-1" /> Delete
                  </Button>
                </div>
              )}
            />
            </ErrorBoundary>
          </CardContent>
        </Card>
      )}

      {activeTab === "archived" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archived Companies ({archivedCompanies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorBoundary inline label="Archived Companies">
            <DataTable
              columns={columns}
              data={archivedCompanies}
              rowKey={(c: any) => c.id}
              emptyMessage="No archived companies found."
              actions={(item: any) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 hover:bg-orange-50 border-orange-200"
                    onClick={async () => {
                      try {
                        await adminApi.restoreCompany(item.id);
                        toast.success(`${item.name} restored to suspended`);
                        qc.invalidateQueries({ queryKey: ["masters"] });
                        qc.invalidateQueries({ queryKey: ["admin-summary"] });
                      } catch {
                        toast.error("Failed to restore company");
                      }
                    }}
                  >
                    <Undo className="size-3.5 mr-1" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 border-red-200"
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className="size-3.5 mr-1" /> Delete
                  </Button>
                </div>
              )}
            />
            </ErrorBoundary>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!reactivateTarget} onOpenChange={() => setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {reactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore access for all users and mills of this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reactivateTarget && handleReactivate(reactivateTarget)}>
              Yes, Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmCode(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Permanently Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                This action <strong>cannot be undone</strong>. All data for this company including mills, users,
                employees, and records will be permanently removed.
              </p>
              <p>
                Type <strong>{deleteTarget?.code}</strong> to confirm:
              </p>
              <Input
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="Enter company code"
                className="mt-1"
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setConfirmCode(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmCode !== deleteTarget?.code || deleting}
              onClick={handlePermanentDelete}
            >
              {deleting ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
