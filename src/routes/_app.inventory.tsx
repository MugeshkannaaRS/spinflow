import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { toast } from "sonner";
import { Plus, Boxes, ArrowRightLeft, AlertTriangle, Package } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SpinFlow ERP" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "inventory");
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const lotColConfig = useColumnConfig("inventory_lots");
  const transferColConfig = useColumnConfig("stock_transfers");
  const lotsQ = useQuery({ queryKey: ["inventory-lots", millId], queryFn: inventoryApi.getLots, staleTime: 60_000, retry: 1, enabled: !!millId });
  const transfersQ = useQuery({ queryKey: ["stock-transfers", millId], queryFn: inventoryApi.getTransfers, staleTime: 60_000, retry: 1, enabled: !!millId });

  const lots: any[] = lotsQ.data ?? [];
  const transfers: any[] = transfersQ.data ?? [];

  const totalStock = lots.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const inStock = lots.filter((l) => l.status === "in-stock").length;
  const ageingLots = lots.filter((l) => l.age > 14).length;
  const lowStock = lots.filter((l) => l.quantity < 3000).length;

  if (!user) return null;
  if (lotsQ.isLoading) return (<><PageHeader title="Inventory" subtitle="Loading..." /><div className="p-6 text-sm text-muted-foreground">Loading data…</div></>);
  if (lotsQ.isError) return (<><PageHeader title="Inventory" subtitle="Error" /><div className="p-6 text-sm text-destructive">Error loading data.</div></>);

  const lotCols: ColDef[] = [
    { key: "lotNo", label: lotColConfig.getLabel('lot_no'), className: "font-mono text-xs" },
    { key: "type", label: lotColConfig.getLabel('type'), type: "status", render: (l: any) => <StatusBadge status="idle" label={l.type} size="sm" /> },
    { key: "department", label: lotColConfig.getLabel('department'), type: "status" },
    { key: "quantity", label: lotColConfig.getLabel('quantity'), render: (l: any) => <span className="text-right">{(l.quantity ?? 0).toLocaleString()}</span> },
    { key: "location", label: lotColConfig.getLabel('location'), type: "status" },
    {
      key: "grade", label: lotColConfig.getLabel('grade'), type: "status",
      render: (l: any) => (
        <Badge variant={l.grade === "A+" || l.grade === "A" ? "default" : l.grade === "B" ? "secondary" : "destructive"}>{l.grade}</Badge>
      ),
    },
    { key: "producedDate", label: lotColConfig.getLabel('produced_date') },
    { key: "age", label: lotColConfig.getLabel('age'), render: (l: any) => <span className={l.age > 14 ? "text-destructive font-medium" : ""}>{l.age}</span> },
    {
      key: "status", label: lotColConfig.getLabel('status'), type: "status",
      render: (l: any) => <StatusBadge status={l.status} size="sm" />,
    },
  ];

  const transferCols: ColDef[] = [
    { key: "date", label: transferColConfig.getLabel('date'), type: "date" },
    { key: "lotNo", label: transferColConfig.getLabel('lot_no'), className: "font-mono text-xs" },
    { key: "fromLocation", label: transferColConfig.getLabel('from_location'), type: "status" },
    { key: "toLocation", label: transferColConfig.getLabel('to_location'), type: "status", render: (t: any) => <span><ArrowRightLeft className="size-3 inline mr-1 text-muted-foreground" />{t.toLocation}</span> },
    { key: "quantity", label: transferColConfig.getLabel('quantity'), render: (t: any) => `${t.quantity} ${t.unit}` },
    { key: "transferredBy", label: transferColConfig.getLabel('transferred_by') },
    { key: "status", label: transferColConfig.getLabel('status'), type: "status", render: (t: any) => <StatusBadge status={t.status} size="sm" /> },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Lot tracking, godown stock, transfers & ageing analysis"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["inventory-lots"] })}
        isRefreshing={lotsQ.isFetching}
      />
      <AccessGuard module="inventory">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Total Stock</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Package className="size-5 text-primary" />{totalStock.toLocaleString()} kg</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Lots In Stock</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Boxes className="size-5 text-green-600" />{inStock}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Ageing (&gt;14d)</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><AlertTriangle className="size-5 text-amber-500" />{ageingLots}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Low Stock Lots</div><div className="text-2xl font-semibold mt-2">{lowStock}</div></CardContent></Card>
          </div>

          <Tabs defaultValue="lots">
            <TabsList>
              <TabsTrigger value="lots">Lots & Stock</TabsTrigger>
              <TabsTrigger value="transfers">Stock Transfers</TabsTrigger>
            </TabsList>

            <TabsContent value="lots">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Inventory Lots</CardTitle>
                  <ExportDateRangeButton label="Export" onExport={(f, t) => exportApi.inventoryXlsx(f, t)} />
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="inventory_lots"
                    columns={lotCols}
                    data={lots}
                    loading={lotsQ.isLoading}
                    rowKey={(l) => l.id}
                    exportFilename="inventory_lots"
                    actions={canEdit ? (l: any) => (
                      l.status !== "cancelled" && l.status !== "dispatched" ? (
                        <ConfirmDeleteButton
                          onConfirm={async () => {
                            await inventoryApi.deleteLot(l.id);
                            qc.invalidateQueries({ queryKey: ["inventory-lots"] });
                          }}
                          label={`Cancel lot ${l.lotNo}? Only possible if no stock movements exist.`}
                          title="Cancel Lot?"
                          confirmText="Cancel Lot"
                          successMessage="Lot cancelled"
                        />
                      ) : <></>
                    ) : undefined}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transfers">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Stock Transfers</CardTitle>
                  {canEdit && <NewTransferDialog />}
                </CardHeader>
                <CardContent>
                  <DataTable tableId="stock_transfers" columns={transferCols} data={transfers} loading={transfersQ.isLoading} rowKey={(t) => t.id} exportFilename="stock_transfers" />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function NewTransferDialog() {
  const qc = useQueryClient();
  const { getLabel: getTransferLabel } = useColumnConfig("inventory_lots");
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), lotNo: "", fromLocation: "", toLocation: "", quantity: 0, unit: "kg", transferredBy: "", status: "pending" as const });

  const reqFields = ["date", "lotNo", "fromLocation", "toLocation", "quantity", "unit", "transferredBy"] as const;
  const allFilled = reqFields.every((f) => { const v = (form as any)[f]; return typeof v === "number" ? v > 0 : typeof v === "string" && v.trim().length > 0; });

  const m = useMutation({ mutationFn: () => inventoryApi.createTransfer(form) });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => { const v = (form as any)[f]; if (typeof v === "number" ? v <= 0 : !v || !v.trim()) errors[f] = "Required"; });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, { onSuccess: () => { toast.success("Stock transfer created"); qc.invalidateQueries({ queryKey: ["stock-transfers"] }); setOpen(false); } });
  };

  const f = (key: keyof typeof form) => ({
    value: String((form as any)[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [key]: key === "quantity" ? +e.target.value : e.target.value }); setRequiredErrors((p) => ({ ...p, [key]: "" })); },
    className: requiredErrors[key] ? "border-destructive" : "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" />New transfer</Button></DialogTrigger>
      <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        <DialogHeader><DialogTitle>New stock transfer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["date", "lotNo", "fromLocation", "toLocation", "unit", "transferredBy"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{getTransferLabel(key.replace(/([A-Z])/g, "_$1").toLowerCase())} <span className="text-destructive">*</span></Label>
                <Input type={key === "date" ? "date" : "text"} {...f(key)} />
                {requiredErrors[key] && <p className="text-xs text-destructive">{requiredErrors[key]}</p>}
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>{getTransferLabel('quantity')} <span className="text-destructive">*</span></Label>
              <Input type="number" {...f("quantity")} />
              {requiredErrors.quantity && <p className="text-xs text-destructive">{requiredErrors.quantity}</p>}
            </div>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending || !allFilled}>{m.isPending ? "Saving…" : "Create transfer"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
