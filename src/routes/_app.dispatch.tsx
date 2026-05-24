import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dispatchApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { toast } from "sonner";
import { Truck, ClipboardList, Loader2 } from "lucide-react";
import type { DispatchEntry } from "@/lib/types";

export const Route = createFileRoute("/_app/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — SpinFlow ERP" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "dispatch");
  const ordersQ = useQuery({ queryKey: ["sales-orders"], queryFn: dispatchApi.getOrders, staleTime: 60_000, retry: 1 });
  const dispatchQ = useQuery({ queryKey: ["dispatches"], queryFn: dispatchApi.getOrders, staleTime: 60_000, retry: 1 });

  const orders: any[] = ordersQ.data ?? [];
  const dispatches: any[] = dispatchQ.data ?? [];

  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const activeDispatches = dispatches.filter((d) => d.status === "loaded" || d.status === "pending").length;
  const totalDispatched = dispatches.reduce((s, d) => s + (d.quantityKg ?? 0), 0);
  const pendingValue = orders.filter((o) => o.status === "pending").reduce((s, o) => s + (o.value ?? 0), 0);

  if (!user) return null;
  if (ordersQ.isLoading) return (<><Topbar title="Dispatch" subtitle="Loading..." /><div className="p-6 text-sm text-muted-foreground">Loading data…</div></>);
  if (ordersQ.isError) return (<><Topbar title="Dispatch" subtitle="Error" /><div className="p-6 text-sm text-destructive">Error loading data.</div></>);

  const orderCols: ColDef[] = [
    { key: "orderNo", label: "Order No", className: "font-mono text-xs" },
    { key: "customer", label: "Customer", render: (o: any) => <span className="font-medium">{o.customer}</span> },
    { key: "date", label: "Date", type: "date" },
    { key: "deliveryDate", label: "Delivery", type: "date" },
    { key: "items", label: "Items" },
    { key: "quantityKg", label: "Qty (kg)" },
    { key: "value", label: "Value", render: (o: any) => `₹${(o.value ?? 0).toLocaleString()}` },
    {
      key: "status", label: "Status", type: "status",
      render: (o: any) => (
        <Badge variant={["delivered", "dispatched"].includes(o.status) ? "default" : ["loaded", "processing"].includes(o.status) ? "secondary" : "outline"}>{o.status}</Badge>
      ),
    },
  ];

  const dispatchCols: ColDef[] = [
    { key: "dispatchNo", label: "Dispatch No", className: "font-mono text-xs" },
    { key: "date", label: "Date", type: "date" },
    { key: "orderNo", label: "Order", className: "font-mono text-xs" },
    { key: "customer", label: "Customer" },
    { key: "lotNo", label: "Lot", className: "font-mono text-xs" },
    { key: "quantityKg", label: "Qty (kg)" },
    { key: "vehicleNo", label: "Vehicle", className: "font-mono text-xs" },
    { key: "ewayBillNo", label: "E-Way Bill", className: "font-mono text-xs" },
    {
      key: "status", label: "Status", type: "status",
      render: (d: any) => (
        <Badge variant={["dispatched", "delivered"].includes(d.status) ? "default" : d.status === "loaded" ? "secondary" : "outline"}>{d.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Dispatch" subtitle="Sales orders, QR scanning, vehicle loading & dispatch tracking" />
      <AccessGuard module="dispatch">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Pending Orders</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><ClipboardList className="size-5 text-amber-500" />{pendingOrders}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Active Dispatches</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Loader2 className="size-5 text-primary" />{activeDispatches}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Total Dispatched</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Truck className="size-5 text-green-600" />{totalDispatched.toLocaleString()} kg</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Pending Value</div><div className="text-2xl font-semibold mt-2">₹{(pendingValue / 100000).toFixed(2)} L</div></CardContent></Card>
          </div>

          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Sales Orders</TabsTrigger>
              <TabsTrigger value="dispatches">Dispatch Register</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <Card>
                <CardHeader><CardTitle className="text-base">Sales Orders</CardTitle></CardHeader>
                <CardContent>
                  <DataTable tableId="dispatch_orders" columns={orderCols} data={orders} loading={ordersQ.isLoading} rowKey={(o) => o.id} exportFilename="sales_orders" />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dispatches">
              <Card>
                <CardHeader><CardTitle className="text-base">Dispatch Register</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="dispatch_register"
                    columns={dispatchCols}
                    data={dispatches}
                    loading={dispatchQ.isLoading}
                    rowKey={(d) => d.id}
                    exportFilename="dispatch_register"
                    actions={(d) =>
                      canEdit && !["dispatched", "delivered"].includes(d.status) ? (
                        <StatusUpdateSelect dispatchId={d.id} currentStatus={d.status} />
                      ) : null
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function StatusUpdateSelect({ dispatchId, currentStatus }: { dispatchId: string; currentStatus: DispatchEntry["status"] }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [value, setValue] = useState(currentStatus);

  const m = useMutation({
    mutationFn: (newStatus: DispatchEntry["status"]) =>
      dispatchApi.updateStatus(dispatchId, { status: newStatus, scannedBy: user?.name ?? "" }),
  });

  const nextStatuses: DispatchEntry["status"][] =
    currentStatus === "pending" ? ["loaded"] :
    currentStatus === "loaded" ? ["gate-out", "dispatched"] : [];

  if (nextStatuses.length === 0) return null;

  return (
    <Select value={value} onValueChange={(v) => {
      const s = v as DispatchEntry["status"];
      setValue(s);
      m.mutate(s, {
        onSuccess: () => { toast.success("Dispatch status updated"); qc.invalidateQueries({ queryKey: ["dispatches"] }); },
      });
    }}>
      <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
      <SelectContent>
        {nextStatuses.map((s) => (
          <SelectItem key={s} value={s}>{s === "gate-out" ? "Gate Out" : s === "dispatched" ? "Dispatch" : s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
