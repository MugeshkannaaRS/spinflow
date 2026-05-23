import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dispatchApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
import { toast } from "sonner";
import { Truck, ClipboardList, CheckCircle2, Loader2 } from "lucide-react";
import type { DispatchEntry } from "@/lib/types";

export const Route = createFileRoute("/_app/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — SpinFlow ERP" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "dispatch");
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "MILL_OWNER";
  const ordersQ = useQuery({
    queryKey: ["sales-orders"],
    queryFn: dispatchApi.getOrders,
    staleTime: 60_000,
    retry: 1,
  });
  const dispatchQ = useQuery({
    queryKey: ["dispatches"],
    queryFn: dispatchApi.getOrders,
    staleTime: 60_000,
    retry: 1,
  });

  const orders: any[] = ordersQ.data ?? [];
  const dispatches: any[] = dispatchQ.data ?? [];

  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [filteredDispatches, setFilteredDispatches] = useState<any[]>([]);

  useEffect(() => {
    setFilteredOrders(ordersQ.data ?? []);
  }, [ordersQ.data]);
  useEffect(() => {
    setFilteredDispatches(dispatchQ.data ?? []);
  }, [dispatchQ.data]);

  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const activeDispatches = dispatches.filter(
    (d) => d.status === "loaded" || d.status === "pending",
  ).length;
  const totalDispatched = dispatches.reduce((s, d) => s + (d.quantityKg ?? 0), 0);
  const pendingValue = orders
    .filter((o) => o.status === "pending")
    .reduce((s, o) => s + (o.value ?? 0), 0);

  if (!user) return null;

  if (ordersQ.isLoading)
    return (
      <>
        <Topbar title="Dispatch" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (ordersQ.isError)
    return (
      <>
        <Topbar title="Dispatch" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Dispatch"
        subtitle="Sales orders, QR scanning, vehicle loading & dispatch tracking"
      />
      <AccessGuard module="dispatch">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Pending Orders
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <ClipboardList className="size-5 text-warning" />
                  {pendingOrders}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Active Dispatches
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Loader2 className="size-5 text-primary" />
                  {activeDispatches}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Dispatched
                </div>
                <div className="text-2xl font-semibold mt-2">
                  {totalDispatched.toLocaleString()} kg
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Pending Value
                </div>
                <div className="text-2xl font-semibold mt-2">
                  ₹{(pendingValue / 100000).toFixed(2)} L
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Sales Orders</TabsTrigger>
              <TabsTrigger value="dispatches">Dispatch Register</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Sales Orders</CardTitle>
                  {isAdmin && <ColumnConfigurator module="dispatch" tableKey="orders" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={orders}
                    onFilter={setFilteredOrders}
                    columns={[
                      {
                        key: "orderNo" as const,
                        label: "Order No",
                        placeholder: "Filter order...",
                      },
                      {
                        key: "customer" as const,
                        label: "Customer",
                        placeholder: "Filter customer...",
                      },
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      {
                        key: "deliveryDate" as const,
                        label: "Delivery",
                        placeholder: "Filter delivery...",
                      },
                      { key: "items" as const, label: "Items", placeholder: "Filter items..." },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order No</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Delivery</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead className="text-right">Qty (kg)</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                            <TableCell className="font-medium">{o.customer}</TableCell>
                            <TableCell className="text-sm">{o.date}</TableCell>
                            <TableCell className="text-sm">{o.deliveryDate}</TableCell>
                            <TableCell className="text-sm">{o.items}</TableCell>
                            <TableCell className="text-right">{o.quantityKg}</TableCell>
                            <TableCell className="text-right font-medium">
                              ₹{(o.value ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  o.status === "delivered"
                                    ? "default"
                                    : o.status === "dispatched"
                                      ? "default"
                                      : o.status === "loaded"
                                        ? "secondary"
                                        : o.status === "processing"
                                          ? "secondary"
                                          : "outline"
                                }
                              >
                                {o.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dispatches">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Dispatch Register</CardTitle>
                  {isAdmin && <ColumnConfigurator module="dispatch" tableKey="dispatches" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={dispatches}
                    onFilter={setFilteredDispatches}
                    columns={[
                      {
                        key: "dispatchNo" as const,
                        label: "Dispatch No",
                        placeholder: "Filter dispatch...",
                      },
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      { key: "orderNo" as const, label: "Order", placeholder: "Filter order..." },
                      {
                        key: "customer" as const,
                        label: "Customer",
                        placeholder: "Filter customer...",
                      },
                      { key: "lotNo" as const, label: "Lot", placeholder: "Filter lot..." },
                      {
                        key: "vehicleNo" as const,
                        label: "Vehicle",
                        placeholder: "Filter vehicle...",
                      },
                      {
                        key: "ewayBillNo" as const,
                        label: "E-Way Bill",
                        placeholder: "Filter e-way bill...",
                      },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dispatch No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>E-Way Bill</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDispatches.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{d.dispatchNo}</TableCell>
                            <TableCell className="text-sm">{d.date}</TableCell>
                            <TableCell className="font-mono text-xs">{d.orderNo}</TableCell>
                            <TableCell>{d.customer}</TableCell>
                            <TableCell className="font-mono text-xs">{d.lotNo}</TableCell>
                            <TableCell className="text-right">{d.quantityKg}</TableCell>
                            <TableCell className="font-mono text-xs">{d.vehicleNo}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {d.ewayBillNo || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  d.status === "dispatched" || d.status === "delivered"
                                    ? "default"
                                    : d.status === "loaded"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {d.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {canEdit && d.status !== "dispatched" && d.status !== "delivered" && (
                                <StatusUpdateSelect dispatchId={d.id} currentStatus={d.status} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function StatusUpdateSelect({
  dispatchId,
  currentStatus,
}: {
  dispatchId: string;
  currentStatus: DispatchEntry["status"];
}) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [value, setValue] = useState(currentStatus);

  const m = useMutation({
    mutationFn: (newStatus: DispatchEntry["status"]) =>
      dispatchApi.updateStatus(dispatchId, { status: newStatus, scannedBy: user.name }),
  });

  const handleStatusUpdate = (v: string) => {
    const newStatus = v as DispatchEntry["status"];
    setValue(newStatus);
    m.mutate(newStatus, {
      onSuccess: () => {
        toast.success("Dispatch status updated");
        qc.invalidateQueries({ queryKey: ["dispatches"] });
      },
    });
  };

  const nextStatuses: DispatchEntry["status"][] =
    currentStatus === "pending"
      ? ["loaded"]
      : currentStatus === "loaded"
        ? ["gate-out", "dispatched"]
        : [];

  if (nextStatuses.length === 0) return null;

  return (
    <Select value={value} onValueChange={handleStatusUpdate}>
      <SelectTrigger className="h-7 text-xs w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {nextStatuses.map((s) => (
          <SelectItem key={s} value={s}>
            {s === "gate-out" ? "Gate Out" : s === "dispatched" ? "Dispatch" : s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
