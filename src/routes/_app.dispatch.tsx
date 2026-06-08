import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dispatchApi, mastersApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { useState } from "react";
import { toast } from "sonner";
import { Truck, ClipboardList, Loader2, MapPin, Plus } from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — SpinFlow ERP" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "dispatch");
  const orderColConfig = useColumnConfig("dispatch_sales_orders");
  const tripColConfig = useColumnConfig("dispatch_trips");
  const queryClient = useQueryClient();
  const { millId } = useActiveMill();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    vehicle_no: "",
    driver_name: "",
    driver_phone: "",
    dispatch_date: new Date().toISOString().slice(0, 10),
    e_way_bill_no: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const ordersQ = useQuery({ queryKey: ["dispatch-orders", millId], queryFn: dispatchApi.getOrders, staleTime: 60_000, retry: 1, enabled: !!millId });
  const tripsQ = useQuery({
    queryKey: ["dispatch-trips", page, pageSize, search, millId],
    queryFn: () => dispatchApi.getTrips({ page, page_size: pageSize, mill_id: millId ?? "", ...(search ? { search } : {}) }),
    staleTime: 30_000,
    retry: 1,
    enabled: !!millId,
  });
  const customersQ = useQuery({
    queryKey: ["masters", "customers", millId],
    queryFn: () => mastersApi.getCustomers(millId ?? undefined),
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const orders: any[] = ordersQ.data ?? [];
  const tripsData: any = tripsQ.data ?? { total: 0, data: [] };
  const trips: any[] = tripsData.data ?? [];
  const customers: any[] = customersQ.data ?? [];

  const pendingOrders = orders.filter((o: any) => o.status === "pending").length;
  const activeTrips = trips.filter((t: any) => ["draft", "loading"].includes(t.status)).length;
  const totalDispatched = trips.reduce((s: number, t: any) => s + (t.planned_weight_kg ?? 0), 0);
  const deliveredTrips = trips.filter((t: any) => t.status === "delivered").length;

  const createTripM = useMutation({
    mutationFn: (data: any) => dispatchApi.createTrip(data),
    onSuccess: () => {
      toast.success("Trip created");
      setSheetOpen(false);
      setForm({
        customer_id: "",
        vehicle_no: "",
        driver_name: "",
        driver_phone: "",
        dispatch_date: new Date().toISOString().slice(0, 10),
        e_way_bill_no: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["dispatch-trips"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((e: any) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ") : detail || "Failed to create trip";
      toast.error(msg);
    },
  });

  const dispatchM = useMutation({
    mutationFn: (id: string) => dispatchApi.dispatchTrip(id),
    onSuccess: () => {
      toast.success("Trip dispatched");
      queryClient.invalidateQueries({ queryKey: ["dispatch-trips"] });
    },
    onError: () => toast.error("Failed to dispatch trip"),
  });

  const deliverM = useMutation({
    mutationFn: (id: string) => dispatchApi.deliverTrip(id),
    onSuccess: () => {
      toast.success("Trip delivered");
      queryClient.invalidateQueries({ queryKey: ["dispatch-trips"] });
    },
    onError: () => toast.error("Failed to deliver trip"),
  });

  function handleCreateTrip() {
    const errs: Record<string, string> = {};
    if (!form.customer_id.trim()) errs.customer_id = "Customer is required";
    if (!form.vehicle_no.trim()) errs.vehicle_no = "Vehicle No is required";
    if (!form.dispatch_date.trim()) errs.dispatch_date = "Dispatch Date is required";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    createTripM.mutate({
      customer_id: form.customer_id || undefined,
      vehicle_no: form.vehicle_no || undefined,
      driver_name: form.driver_name || undefined,
      driver_phone: form.driver_phone || undefined,
      dispatch_date: form.dispatch_date || undefined,
      e_way_bill_no: form.e_way_bill_no || undefined,
      notes: form.notes || undefined,
    });
  }

  if (!user) return null;

  const orderCols: ColDef[] = [
    { key: "order_no", label: orderColConfig.getLabel('order_no'), className: "font-mono text-xs" },
    { key: "customer", label: orderColConfig.getLabel('customer'), render: (o: any) => <span className="font-medium">{o.customer || o.customer_name || ""}</span> },
    { key: "date", label: orderColConfig.getLabel('date'), type: "date" },
    { key: "lot_no", label: orderColConfig.getLabel('items') },
    { key: "quantity_kg", label: orderColConfig.getLabel('quantity_kg') },
    {
      key: "status", label: orderColConfig.getLabel('status'), type: "status",
      render: (o: any) => <StatusBadge status={o.status} size="sm" />,
    },
  ];

  const tripCols: ColDef[] = [
    { key: "trip_no", label: tripColConfig.getLabel('trip_no') || "Trip No", className: "font-mono text-xs" },
    { key: "vehicle_no", label: tripColConfig.getLabel('vehicle_no') || "Vehicle", className: "font-mono text-xs" },
    { key: "driver_name", label: tripColConfig.getLabel('driver_name') || "Driver" },
    { key: "destination_name", label: tripColConfig.getLabel('destination_name') || "Destination" },
    { key: "planned_bags", label: tripColConfig.getLabel('planned_bags') || "Bags", type: "number" },
    { key: "planned_weight_kg", label: tripColConfig.getLabel('planned_weight_kg') || "Weight (kg)", type: "number" },
    {
      key: "status", label: tripColConfig.getLabel('status') || "Status", type: "status",
      render: (t: any) => <StatusBadge status={t.status} size="sm" />,
    },
    {
      key: "created_at", label: "Created", type: "date",
      render: (t: any) => t.created_at ? new Date(t.created_at).toLocaleDateString() : "—",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dispatch"
        subtitle="Orders, trips, QR scanning & vehicle tracking"
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["dispatch-orders"] })}
        isRefreshing={ordersQ.isFetching}
      />
      <AccessGuard module="dispatch">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Pending Orders</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><ClipboardList className="size-5 text-amber-500" />{pendingOrders}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Active Trips</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Loader2 className="size-5 text-primary" />{activeTrips}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Total Dispatched (kg)</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Truck className="size-5 text-green-600" />{totalDispatched.toLocaleString()}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Delivered Trips</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><MapPin className="size-5 text-blue-600" />{deliveredTrips}</div></CardContent></Card>
          </div>

          <Tabs defaultValue="trips">
            <TabsList>
              <TabsTrigger value="trips">Trips</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="trips">
              <DataTable
                tableId="dispatch_trips_table"
                columns={tripCols}
                data={trips}
                total={tripsData.total}
                isLoading={tripsQ.isLoading}
                isError={tripsQ.isError}
                onRetry={() => tripsQ.refetch()}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                searchValue={search}
                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                rowKey={(t) => t.id}
                exportFilename="dispatch_trips"
                onRowClick={undefined}
                rowActions={(t: any) => (
                  <div className="flex gap-1">
                    {t.status === "draft" && (
                      <Button size="sm" onClick={() => dispatchM.mutate(t.id)} disabled={dispatchM.isPending}>
                        {dispatchM.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                        Dispatch
                      </Button>
                    )}
                    {t.status === "dispatched" && (
                      <Button size="sm" onClick={() => deliverM.mutate(t.id)} disabled={deliverM.isPending}>
                        {deliverM.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                        Deliver
                      </Button>
                    )}
                  </div>
                )}
                toolbar={
                  <Button size="sm" className="h-8 gap-1" onClick={() => setSheetOpen(true)}>
                    <Plus className="size-3.5" />
                    New Trip
                  </Button>
                }
              />
            </TabsContent>

            <TabsContent value="orders">
              <DataTable
                tableId="dispatch_orders_table"
                columns={orderCols}
                data={orders}
                loading={ordersQ.isLoading}
                rowKey={(o) => o.id}
                exportFilename="dispatch_orders"
              />
            </TabsContent>
          </Tabs>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create New Trip</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => { setForm({ ...form, customer_id: v }); setFormErrors((p) => ({ ...p, customer_id: "" })); }}
                >
                  <SelectTrigger id="customer" className={formErrors.customer_id ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.filter((c: any) => c?.id).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.customer_name || c.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.customer_id && <p className="text-xs text-destructive">{formErrors.customer_id}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_no">Vehicle No</Label>
                <Input
                  id="vehicle_no"
                  value={form.vehicle_no}
                  onChange={(e) => { setForm({ ...form, vehicle_no: e.target.value }); setFormErrors((p) => ({ ...p, vehicle_no: "" })); }}
                  placeholder="TN-38-AB-1234"
                  className={formErrors.vehicle_no ? "border-destructive" : ""}
                />
                {formErrors.vehicle_no && <p className="text-xs text-destructive">{formErrors.vehicle_no}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver_name">Driver Name</Label>
                  <Input
                    id="driver_name"
                    value={form.driver_name}
                    onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                    placeholder="Driver name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver_phone">Driver Phone</Label>
                  <Input
                    id="driver_phone"
                    value={form.driver_phone}
                    onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                    placeholder="9876543210"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispatch_date">Dispatch Date</Label>
                <Input
                  id="dispatch_date"
                  type="date"
                  value={form.dispatch_date}
                  onChange={(e) => { setForm({ ...form, dispatch_date: e.target.value }); setFormErrors((p) => ({ ...p, dispatch_date: "" })); }}
                  className={formErrors.dispatch_date ? "border-destructive" : ""}
                />
                {formErrors.dispatch_date && <p className="text-xs text-destructive">{formErrors.dispatch_date}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="eway">E-Way Bill No</Label>
                <Input
                  id="eway"
                  value={form.e_way_bill_no}
                  onChange={(e) => setForm({ ...form, e_way_bill_no: e.target.value })}
                  placeholder="E-way bill number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
            <SheetFooter className="mt-6">
              <Button onClick={handleCreateTrip} disabled={createTripM.isPending} className="w-full">
                {createTripM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                Create Trip
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </AccessGuard>
    </>
  );
}
