import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Archive, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/admin/archive")({
  head: () => ({ meta: [{ title: "Archive — Admin — SpinFlow ERP" }] }),
  component: ArchivePage,
});

function ArchivePage() {
  const qc = useQueryClient();
  const [suspendCompany, setSuspendCompany] = useState<any | null>(null);

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 500, true),
    staleTime: 60_000,
    retry: 1,
  });

  const companies: any[] = (companiesQ.data ?? []) as any[];
  const inactiveCompanies = companies.filter((c: any) => c.is_active === false);

  const handleSuspend = async (company: any) => {
    try {
      const targetStatus = company.is_active ? "suspended" : "active";
      await adminApi.suspendCompany(company.id, targetStatus);
      toast.success(`${company.name} has been ${targetStatus === "active" ? "activated" : "suspended"}`);
      setSuspendCompany(null);
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
    } catch {
      toast.error("Failed to update company status");
    }
  };

  const columns: ColDef[] = [
    { key: "name", label: "Company Name", render: (c: any) => <span className="font-medium">{c.name}</span> },
    { key: "code", label: "Code" },
    { key: "gstin", label: "GSTIN" },
    {
      key: "is_active",
      label: "Status",
      render: (c: any) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Suspended
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">View and restore suspended companies</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Suspended Companies ({inactiveCompanies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={inactiveCompanies}
            rowKey={(c: any) => c.id}
            emptyMessage="No suspended companies found."
            actions={(item: any) => (
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 hover:bg-green-50 border-green-200"
                onClick={() => setSuspendCompany(item)}
              >
                <CheckCircle className="size-3.5 mr-1" /> Activate
              </Button>
            )}
          />
        </CardContent>
      </Card>

      <AlertDialog open={!!suspendCompany} onOpenChange={() => setSuspendCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Activate {suspendCompany?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will restore access for all users of this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => suspendCompany && handleSuspend(suspendCompany)}>
              Yes, Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
