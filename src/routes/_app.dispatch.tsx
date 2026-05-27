import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dispatchApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Truck, ClipboardList, Loader2, MapPin } from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — SpinFlow ERP" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "dispatch");
  const orderColConfig = useColumnConfig("dispatch_orders");
  const tripColConfig = useColumnConfig("dispatch_trips");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");

  const ordersQ = useQuery({ queryKey: ["dispatch-orders"], queryFn: dispatchApi.getOrders, staleTime: 60_000, retry: 1 });
  const tripsQ = useQuery({
    queryKey: ["dispatch-trips", page, pageSize, search],
    queryFn: () => dispatchApi.getTrips({ page, page_size: pageSize, ...(search ? { search } : {}) }),
    staleTime: 30_000,
    retry: 1,
  });

  const orders: any[] = ordersQ.data ?? [];
  const tripsData: any = tripsQ.data ?? { total: 0, data: [] };
  const trips: any[] = tripsData.data ?? [];

  const pendingOrders = orders.filter((o: any) => o.status === "pending").length;
  const activeTrips = trips.filter((t: any) => ["draft", "loading"].includes(t.status)).length;
  const totalDispatched = trips.reduce((s: number, t: any) => s + (t.planned_weight_kg ?? 0), 0);
  const deliveredTrips = trips.filter((t: any) => t.status === "delivered").length;

  if (!user) return null;

  const orderCols: ColDef[] = [
    { key: "orderNo", label: orderColConfig.getLabel('order_no'), className: "font-mono text-xs" },
    { key: "customer", label: orderColConfig.getLabel('customer'), render: (o: any) => <span className="font-medium">{o.customer || o.customer_name || ""}</span> },
    { key: "date", label: orderColConfig.getLabel('date'), type: "date" },
    { key: "items", label: orderColConfig.getLabel('items') },
    { key: "quantityKg", label: orderColConfig.getLabel('quantity_kg') },
    {
      key: "status", label: orderColConfig.getLabel('status'), type: "status",
      render: (o: any) => (
        <Badge variant={["delivered", "dispatched"].includes(o.status) ? "default" : ["loaded", "processing"].includes(o.status) ? "secondary" : "outline"}>{o.status}</Badge>
      ),
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
      render: (t: any) => (
        <Badge variant={t.status === "delivered" ? "default" : t.status === "loading" ? "secondary" : t.status === "in_transit" ? "outline" : "secondary"}>
          {t.status === "in_transit" ? "In Transit" : t.status}
        </Badge>
      ),
    },
    {
      key: "created_at", label: "Created", type: "date",
      render: (t: any) => t.created_at ? new Date(t.created_at).toLocaleDateString() : "—",
    },
  ];

  return (
    <>
      <Topbar title="Dispatch" subtitle="Orders, trips, QR scanning & vehicle tracking" />
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
                onRowClick={(t: any) => t.id ? window.open(`/trips/${t.id}`, '_blank') : null}
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
      </AccessGuard>
    </>
  );
}
