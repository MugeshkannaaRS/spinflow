import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loTracApi, mastersApi, salesApi, stockApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Topbar } from "@/components/layout/Topbar";
import { AccessGuard } from "@/components/AccessGuard";
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
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Truck, Scan, MapPin, CheckCircle2, Loader2, AlertTriangle, X } from "lucide-react";
import type { Trip, TripStatus, ScanResult as ScanResultType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useOfflineScanner } from "@/hooks/useOfflineScanner";

export const Route = createFileRoute("/_app/lotrac")({
  head: () => ({ meta: [{ title: "LoTrac — Trip Logistics" }] }),
  validateSearch: (search: Record<string, string | undefined>) => ({
    tab: (search.tab as string) || undefined,
  }),
  component: LotracPage,
});

const STATUS_COLORS: Record<TripStatus, string> = {
  draft: "bg-gray-500",
  loading: "bg-yellow-500",
  loaded: "bg-blue-500",
  in_transit: "bg-purple-500",
  arrived: "bg-orange-500",
  delivered: "bg-green-500",
  cancelled: "bg-red-500",
};

function StatusBadge({ status }: { status: TripStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white",
        STATUS_COLORS[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function tryDecodeQR(qrString: string): Partial<ScanResultType> | null {
  try {
    const decoded = JSON.parse(atob(qrString));
    return {
      bag_no: decoded.bag_no,
      lot_no: decoded.lot_no,
      yarn_count: decoded.yarn_count,
      weight_kg: decoded.weight_kg,
    };
  } catch {
    return null;
  }
}

function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
}: {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="space-y-2">
      {!isOnline && (
        <div className="bg-yellow-500/20 border border-yellow-500/40 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-xl text-xl font-medium flex items-center gap-2">
          <AlertTriangle className="size-6 shrink-0" />
          Offline — scans will be queued and synced when reconnected
        </div>
      )}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-lg font-medium">
            {isSyncing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin" />
                Syncing queued scans...
              </span>
            ) : (
              <span>{pendingCount} scan(s) pending sync</span>
            )}
          </span>
          <Button size="sm" variant="outline" onClick={onSync} disabled={!isOnline || isSyncing}>
            Sync Now
          </Button>
        </div>
      )}
    </div>
  );
}

function LotracPage() {
  const user = useAuth((s) => s.user);
  const search = Route.useSearch();
  const [tab, setTab] = useState(search.tab || "trips");

  const handleTabChange = (value: string) => {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "trips") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", value);
    }
    window.history.replaceState({}, "", url.toString());
  };

  if (!user) return null;

  return (
    <>
      <Topbar title="LoTrac" subtitle="Trip Logistics — QR-based bag tracking" />
      <AccessGuard module="lotrac">
        <div className="p-4 md:p-6">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="w-full md:w-auto overflow-x-auto">
              <TabsTrigger value="trips" className="text-base md:text-sm">
                Trips
              </TabsTrigger>
              <TabsTrigger value="loader" className="text-base md:text-sm">
                Loader Scanner
              </TabsTrigger>
              <TabsTrigger value="receiver" className="text-base md:text-sm">
                Receiver Scanner
              </TabsTrigger>
            </TabsList>
            <TabsContent value="trips">
              <TripsTab />
            </TabsContent>
            <TabsContent value="loader">
              <LoaderScannerTab />
            </TabsContent>
            <TabsContent value="receiver">
              <ReceiverScannerTab />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function TripsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<TripStatus | "">("");
  const tripsQ = useQuery({
    queryKey: ["trips", filter],
    queryFn: () => loTracApi.listTrips(filter ? { status: filter } : {}),
    staleTime: 60_000,
    retry: 1,
  });
  const trips: Trip[] = tripsQ.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(
          [
            "",
            "draft",
            "loading",
            "loaded",
            "in_transit",
            "arrived",
            "delivered",
            "cancelled",
          ] as const
        ).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent",
            )}
          >
            {s || "All"}
          </button>
        ))}
        <div className="ml-auto">
          <NewTripSheet />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[640px] w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Trip No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Bags</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.trip_no}</TableCell>
                    <TableCell>{t.destination_name || t.customer_id || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{t.vehicle_no || "—"}</TableCell>
                    <TableCell className="text-xs">{t.destination_name || "—"}</TableCell>
                    <TableCell>
                      {t.loaded_bags}/{t.planned_bags}
                    </TableCell>
                    <TableCell>
                      {t.loaded_weight_kg}/{t.planned_weight_kg} kg
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status as TripStatus} />
                    </TableCell>
                    <TableCell className="text-xs">{t.created_at?.slice(0, 10)}</TableCell>
                    <TableCell>
                      <TripActions trip={t} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TripActions({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const startLoading = useMutation({
    mutationFn: () => loTracApi.startLoading(trip.id),
    onSuccess: () => {
      toast.success("Loading started");
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
  const depart = useMutation({
    mutationFn: () => loTracApi.depart(trip.id),
    onSuccess: () => {
      toast.success("Trip departed");
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });

  if (trip.status === "draft") {
    return (
      <Button size="sm" onClick={() => startLoading.mutate()}>
        Start Loading
      </Button>
    );
  }
  if (trip.status === "loading") {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="outline">
          View
        </Button>
        {trip.loaded_bags >= trip.planned_bags && (
          <Button size="sm" onClick={() => depart.mutate()}>
            Mark Departed
          </Button>
        )}
      </div>
    );
  }
  if (trip.status === "loaded") {
    return (
      <Button size="sm" onClick={() => depart.mutate()}>
        Mark Departed
      </Button>
    );
  }
  if (trip.status === "in_transit") {
    return (
      <Button size="sm" variant="outline">
        View
      </Button>
    );
  }
  if (trip.status === "arrived") {
    return <ConfirmPodButton tripId={trip.id} />;
  }
  if (trip.status === "delivered") {
    return (
      <Button size="sm" variant="outline">
        View
      </Button>
    );
  }
  return null;
}

function ConfirmPodButton({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => loTracApi.confirmPod(tripId),
    onSuccess: () => {
      toast.success("POD confirmed");
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
  return (
    <Button size="sm" onClick={() => m.mutate()}>
      Confirm POD
    </Button>
  );
}

function NewTripSheet() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ planned_bags: 0, planned_weight_kg: 0, bag_ids: [] });
  const [bagSearch, setBagSearch] = useState("");

  const vehiclesQ = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => mastersApi.getVehicles(),
    staleTime: 60_000,
    retry: 1,
  });
  const routesQ = useQuery({
    queryKey: ["routes"],
    queryFn: () => mastersApi.getRoutes(),
    staleTime: 60_000,
    retry: 1,
  });
  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => mastersApi.getCustomers(),
    staleTime: 60_000,
    retry: 1,
  });
  const ordersQ = useQuery({
    queryKey: ["sales-orders-confirmed"],
    queryFn: () => salesApi.listOrders({ status: "confirmed" }),
    staleTime: 60_000,
    retry: 1,
  });
  const bagsQ = useQuery({
    queryKey: ["bags-available"],
    queryFn: () => stockApi.getSnapshot({ fg_state: "SELLABLE" }),
    staleTime: 60_000,
    retry: 1,
  });

  const vehicles = vehiclesQ.data?.data ?? [];
  const routes = routesQ.data?.data ?? [];
  const customers = customersQ.data?.data ?? [];
  const orders = ordersQ.data?.data ?? [];
  const bags = bagsQ.data ?? [];

  const m = useMutation({
    mutationFn: (data: any) => loTracApi.createTrip(data),
    onSuccess: () => {
      toast.success("Trip created");
      qc.invalidateQueries({ queryKey: ["trips"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create trip"),
  });

  const handleSubmit = () => {
    m.mutate({
      mill_id: form.mill_id || "m1",
      from_warehouse_id: form.from_warehouse_id,
      planned_bags: form.planned_bags,
      planned_weight_kg: form.planned_weight_kg,
      bag_ids: form.bag_ids,
      sales_order_id: form.sales_order_id || undefined,
      vehicle_id: form.vehicle_id || undefined,
      vehicle_no: form.vehicle_no || undefined,
      driver_name: form.driver_name || undefined,
      driver_mobile: form.driver_mobile || undefined,
      destination_route_id: form.destination_route_id || undefined,
      destination_name: form.destination_name || undefined,
      customer_id: form.customer_id || undefined,
      notes: form.notes || undefined,
    });
  };

  const filteredBags = bags
    .filter((b: any) => !bagSearch || b.lot_no?.toLowerCase().includes(bagSearch.toLowerCase()))
    .slice(0, 20);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>New Trip</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create New Trip</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">From Warehouse</label>
            <Input
              placeholder="Warehouse ID"
              value={form.from_warehouse_id || ""}
              onChange={(e) => setForm({ ...form, from_warehouse_id: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Vehicle</label>
            <Select
              value={form.vehicle_id || ""}
              onValueChange={(v) => setForm({ ...form, vehicle_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vehicle_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Driver Name</label>
              <Input
                value={form.driver_name || ""}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Driver Mobile</label>
              <Input
                value={form.driver_mobile || ""}
                onChange={(e) => setForm({ ...form, driver_mobile: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Destination Route</label>
            <Select
              value={form.destination_route_id || ""}
              onValueChange={(v) => setForm({ ...form, destination_route_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select route" />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Customer</label>
            <Select
              value={form.customer_id || ""}
              onValueChange={(v) => setForm({ ...form, customer_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Sales Order (optional)</label>
            <Select
              value={form.sales_order_id || ""}
              onValueChange={(v) => setForm({ ...form, sales_order_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select order" />
              </SelectTrigger>
              <SelectContent>
                {orders.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.so_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Planned Bags</label>
              <Input
                type="number"
                value={form.planned_bags || ""}
                onChange={(e) => setForm({ ...form, planned_bags: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Planned Weight (kg)</label>
              <Input
                type="number"
                value={form.planned_weight_kg || ""}
                onChange={(e) =>
                  setForm({ ...form, planned_weight_kg: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Select Bags</label>
            <Input
              placeholder="Search by lot no..."
              value={bagSearch}
              onChange={(e) => setBagSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded p-1">
              {filteredBags.map((b: any) => {
                const selected = form.bag_ids.includes(b.lot_id);
                return (
                  <label
                    key={b.lot_id}
                    className="flex items-center gap-2 p-1 hover:bg-accent rounded cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setForm({
                          ...form,
                          bag_ids: selected
                            ? form.bag_ids.filter((id: string) => id !== b.lot_id)
                            : [...form.bag_ids, b.lot_id],
                        })
                      }
                    />
                    {b.lot_no} — {b.qty_available} bags avail
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Input
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={m.isPending}>
            {m.isPending ? "Creating..." : "Create Trip"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LoaderScannerTab() {
  const user = useAuth((s) => s.user);
  const { isOnline, pendingCount, isSyncing, submitScan, syncQueue } = useOfflineScanner();
  const [selectedTripId, setSelectedTripId] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [lastScan, setLastScan] = useState<ScanResultType | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [tripDetail, setTripDetail] = useState<Trip | null>(null);
  const [queuedScan, setQueuedScan] = useState<Partial<ScanResultType> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadingTripsQ = useQuery({
    queryKey: ["trips", "loading"],
    queryFn: () => loTracApi.listTrips({ status: "loading" }),
    staleTime: 60_000,
    retry: 1,
  });
  const loadingTrips: Trip[] = loadingTripsQ.data?.data ?? [];

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedTripId]);

  useEffect(() => {
    if (selectedTripId) {
      loTracApi.getTrip(selectedTripId).then(setTripDetail);
    }
  }, [selectedTripId]);

  const handleScan = useCallback(async () => {
    if (!selectedTripId || !qrInput.trim()) return;
    try {
      const result = await submitScan({
        trip_id: selectedTripId,
        scan_type: "loader",
        qr_string: qrInput.trim(),
        device_info: navigator.userAgent,
      });

      if (result === null) {
        const decoded = tryDecodeQR(qrInput.trim());
        setQueuedScan(decoded);
        setLastScan(null);
        setRecentScans((prev) =>
          [
            { result: { result: "queued", ...decoded }, time: new Date().toLocaleTimeString() },
            ...prev,
          ].slice(0, 5),
        );
      } else {
        setQueuedScan(null);
        setLastScan(result);
        setRecentScans((prev) =>
          [{ result, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
        );
        if (result.result === "success") {
          const updated = await loTracApi.getTrip(selectedTripId);
          setTripDetail(updated);
          if (result.trip_complete && result.trip_complete === true) {
            toast.success("All bags loaded — ready to depart!");
          }
        }
      }
    } catch (e: any) {
      setLastScan({ result: "error", alert: e?.message || "Scan failed" });
      setQueuedScan(null);
    }
    setQrInput("");
    inputRef.current?.focus();
  }, [selectedTripId, qrInput, submitScan]);

  const progress = tripDetail ? (tripDetail.loaded_bags / (tripDetail.planned_bags || 1)) * 100 : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={() => syncQueue()}
      />

      <div>
        <label className="text-xl font-medium">Select Trip (Loading)</label>
        <Select value={selectedTripId} onValueChange={setSelectedTripId}>
          <SelectTrigger className="text-lg h-14 rounded-xl">
            <SelectValue placeholder="Choose trip..." />
          </SelectTrigger>
          <SelectContent>
            {loadingTrips.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.trip_no} — {t.loaded_bags}/{t.planned_bags} bags
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTripId && (
        <>
          <div className="w-full bg-secondary rounded-full h-4">
            <div
              className="bg-primary h-4 rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="text-xl text-center">
            {tripDetail?.loaded_bags ?? 0} of {tripDetail?.planned_bags ?? 0} bags loaded
          </div>

          <div>
            <label className="text-xl font-medium block mb-2">Scan Bag QR Code</label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScan();
                }}
                placeholder="Scan or type QR code..."
                className="text-2xl h-16 rounded-xl flex-1"
                autoFocus
              />
              {qrInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-16 w-16 shrink-0"
                  onClick={() => {
                    setQrInput("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="size-6" />
                </Button>
              )}
            </div>
          </div>

          {queuedScan && (
            <Card className="border-yellow-500 border-2">
              <CardContent className="p-6 space-y-2">
                <div className="text-yellow-600 text-xl font-bold">
                  Scan queued — will sync when back online
                </div>
                {queuedScan.bag_no && <div className="text-lg">Bag: {queuedScan.bag_no}</div>}
                {queuedScan.lot_no && <div className="text-lg">Lot: {queuedScan.lot_no}</div>}
                {queuedScan.yarn_count && (
                  <div className="text-lg">Yarn: {queuedScan.yarn_count}</div>
                )}
                {queuedScan.weight_kg && (
                  <div className="text-lg">Weight: {queuedScan.weight_kg} kg</div>
                )}
              </CardContent>
            </Card>
          )}

          {lastScan && (
            <Card
              className={cn(
                "border-2",
                lastScan.result === "success"
                  ? "border-green-500"
                  : lastScan.result === "already_scanned"
                    ? "border-yellow-500"
                    : lastScan.result === "not_found"
                      ? "border-orange-500"
                      : "border-red-500",
              )}
            >
              <CardContent className="p-6 space-y-2">
                {lastScan.result === "success" ? (
                  <>
                    <div className="text-green-600 text-xl font-bold">✓ Bag Loaded</div>
                    <div className="text-xl">Bag: {lastScan.bag_no}</div>
                    <div className="text-xl">Lot: {lastScan.lot_no}</div>
                    <div className="text-xl">Yarn: {lastScan.yarn_count}</div>
                    <div className="text-xl">Weight: {lastScan.weight_kg} kg</div>
                    <div className="text-xl">
                      {lastScan.loaded_count} of {lastScan.planned_count} bags loaded
                    </div>
                    {lastScan.trip_complete && (
                      <div className="bg-green-100 text-green-800 text-xl font-bold p-3 rounded mt-2">
                        ✓ All bags loaded — ready to depart
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-red-600 text-xl font-bold">
                    ✗ {lastScan.alert || lastScan.result}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {recentScans.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-2">Recent Scans</h3>
              <div className="space-y-1">
                {recentScans.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-sm bg-muted p-3 rounded min-h-[48px] items-center"
                  >
                    <span
                      className={cn(
                        s.result.result === "success"
                          ? "text-green-600"
                          : s.result.result === "queued"
                            ? "text-yellow-600"
                            : "text-red-600",
                      )}
                    >
                      {s.result.result === "success"
                        ? `Bag ${s.result.bag_no}`
                        : s.result.result === "queued"
                          ? `Queued: Bag ${s.result.bag_no || "unknown"}`
                          : s.result.alert || s.result.result}
                    </span>
                    <span className="text-muted-foreground">{s.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full text-xl h-16 rounded-xl min-h-[56px]"
            onClick={handleScan}
          >
            <Scan className="mr-2 size-6" /> Scan QR
          </Button>
        </>
      )}
    </div>
  );
}

function ReceiverScannerTab() {
  const user = useAuth((s) => s.user);
  const { isOnline, pendingCount, isSyncing, submitScan, syncQueue } = useOfflineScanner();
  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [lastScan, setLastScan] = useState<ScanResultType | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [tripDetail, setTripDetail] = useState<Trip | null>(null);
  const [wrongDestAlert, setWrongDestAlert] = useState<ScanResultType | null>(null);
  const [queuedScan, setQueuedScan] = useState<Partial<ScanResultType> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const rxTripsQ = useQuery({
    queryKey: ["trips", "in_transit"],
    queryFn: () => loTracApi.listTrips({ status: "in_transit,arrived" }),
    staleTime: 60_000,
    retry: 1,
  });
  const rxTrips: Trip[] = rxTripsQ.data?.data ?? [];

  const routesQ = useQuery({
    queryKey: ["routes"],
    queryFn: () => mastersApi.getRoutes(),
    staleTime: 60_000,
    retry: 1,
  });
  const routes = routesQ.data?.data ?? [];

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedTripId]);

  useEffect(() => {
    if (selectedTripId) {
      loTracApi.getTrip(selectedTripId).then(setTripDetail);
    }
  }, [selectedTripId]);

  const handleScan = useCallback(async () => {
    if (!selectedTripId || !qrInput.trim()) return;
    try {
      const result = await submitScan({
        trip_id: selectedTripId,
        scan_type: "receiver",
        qr_string: qrInput.trim(),
        scanned_route_id: selectedRouteId || undefined,
        device_info: navigator.userAgent,
      });

      if (result === null) {
        const decoded = tryDecodeQR(qrInput.trim());
        setQueuedScan(decoded);
        setLastScan(null);
        setRecentScans((prev) =>
          [
            { result: { result: "queued", ...decoded }, time: new Date().toLocaleTimeString() },
            ...prev,
          ].slice(0, 5),
        );
      } else {
        setQueuedScan(null);
        setLastScan(result);
        setRecentScans((prev) =>
          [{ result, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
        );

        if (result.result === "wrong_destination") {
          setWrongDestAlert(result);
          try {
            if (!audioRef.current) audioRef.current = new Audio();
            audioRef.current.play().catch(() => {});
          } catch (_) {
            // audio play failed silently
          }
          if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
          alertTimerRef.current = setTimeout(() => setWrongDestAlert(null), 10000);
        } else if (result.result === "success") {
          const updated = await loTracApi.getTrip(selectedTripId);
          setTripDetail(updated);
          if (result.trip_complete && result.trip_complete === true) {
            toast.success("All bags received!");
          }
        }
      }
    } catch (e: any) {
      setLastScan({ result: "error", alert: e?.message || "Scan failed" });
      setQueuedScan(null);
    }
    setQrInput("");
    inputRef.current?.focus();
  }, [selectedTripId, qrInput, selectedRouteId, submitScan]);

  const progress = tripDetail
    ? (tripDetail.delivered_bags / (tripDetail.planned_bags || 1)) * 100
    : 0;

  const handleConfirmPod = async () => {
    try {
      await loTracApi.confirmPod(selectedTripId);
      toast.success("POD confirmed — trip delivered");
      const updated = await loTracApi.getTrip(selectedTripId);
      setTripDetail(updated);
    } catch (e: any) {
      toast.error(e?.message || "Failed to confirm POD");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={() => syncQueue()}
      />

      {wrongDestAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <Card className="border-red-500 border-4 max-w-lg w-full mx-4">
            <CardContent className="p-8 text-center space-y-4">
              <AlertTriangle className="size-16 text-red-500 mx-auto" />
              <div className="text-3xl font-bold text-red-600">⚠️ WRONG DESTINATION</div>
              <div className="text-xl">Bag: {wrongDestAlert.bag_no}</div>
              <div className="text-xl">Expected Route: {wrongDestAlert.expected_route}</div>
              <div className="text-xl">Scanned At: {wrongDestAlert.scanned_route}</div>
              <Button
                variant="destructive"
                size="lg"
                className="text-lg"
                onClick={() => setWrongDestAlert(null)}
              >
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <label className="text-xl font-medium">Select Trip (Receiving)</label>
        <Select value={selectedTripId} onValueChange={setSelectedTripId}>
          <SelectTrigger className="text-lg h-14 rounded-xl">
            <SelectValue placeholder="Choose trip..." />
          </SelectTrigger>
          <SelectContent>
            {rxTrips.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.trip_no} — {t.delivered_bags}/{t.planned_bags} bags
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTripId && (
        <>
          <div>
            <label className="text-xl font-medium">I am at route:</label>
            <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
              <SelectTrigger className="text-lg h-14 rounded-xl">
                <SelectValue placeholder="Select your location..." />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full bg-secondary rounded-full h-4">
            <div
              className="bg-primary h-4 rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="text-xl text-center">
            {tripDetail?.delivered_bags ?? 0} of {tripDetail?.planned_bags ?? 0} bags received
          </div>

          <div>
            <label className="text-xl font-medium block mb-2">Scan Bag QR Code</label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScan();
                }}
                placeholder="Scan or type QR code..."
                className="text-2xl h-16 rounded-xl flex-1"
                autoFocus
              />
              {qrInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-16 w-16 shrink-0"
                  onClick={() => {
                    setQrInput("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="size-6" />
                </Button>
              )}
            </div>
          </div>

          {queuedScan && (
            <Card className="border-yellow-500 border-2">
              <CardContent className="p-6 space-y-2">
                <div className="text-yellow-600 text-xl font-bold">
                  Scan queued — will sync when back online
                </div>
                {queuedScan.bag_no && <div className="text-xl">Bag: {queuedScan.bag_no}</div>}
                {queuedScan.lot_no && <div className="text-xl">Lot: {queuedScan.lot_no}</div>}
                {queuedScan.yarn_count && (
                  <div className="text-xl">Yarn: {queuedScan.yarn_count}</div>
                )}
                {queuedScan.weight_kg && (
                  <div className="text-xl">Weight: {queuedScan.weight_kg} kg</div>
                )}
              </CardContent>
            </Card>
          )}

          {lastScan && lastScan.result !== "wrong_destination" && (
            <Card
              className={cn(
                "border-2",
                lastScan.result === "success"
                  ? "border-green-500"
                  : lastScan.result === "already_scanned"
                    ? "border-yellow-500"
                    : "border-red-500",
              )}
            >
              <CardContent className="p-6 space-y-2">
                {lastScan.result === "success" ? (
                  <>
                    <div className="text-green-600 text-xl font-bold">✓ Bag Received</div>
                    <div className="text-xl">Bag: {lastScan.bag_no}</div>
                    <div className="text-xl">Lot: {lastScan.lot_no}</div>
                    <div className="text-xl">Yarn: {lastScan.yarn_count}</div>
                    <div className="text-xl">Weight: {lastScan.weight_kg} kg</div>
                    <div className="text-xl">
                      {lastScan.delivered_count} of {lastScan.planned_count} bags received
                    </div>
                    {lastScan.trip_complete && (
                      <div className="bg-green-100 text-green-800 text-xl font-bold p-3 rounded mt-2">
                        ✓ All bags received
                        <Button size="lg" className="ml-4 text-xl" onClick={handleConfirmPod}>
                          Confirm POD
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-red-600 text-xl font-bold">
                    ✗ {lastScan.alert || lastScan.result}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tripDetail?.status === "arrived" && (
            <Button size="lg" className="w-full text-xl h-16 rounded-xl" onClick={handleConfirmPod}>
              <CheckCircle2 className="mr-2 size-6" /> Confirm POD
            </Button>
          )}

          {recentScans.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-2">Recent Scans</h3>
              <div className="space-y-1">
                {recentScans.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-sm bg-muted p-3 rounded min-h-[48px] items-center"
                  >
                    <span
                      className={cn(
                        s.result.result === "success"
                          ? "text-green-600"
                          : s.result.result === "queued"
                            ? "text-yellow-600"
                            : s.result.result === "wrong_destination"
                              ? "text-red-600"
                              : "text-orange-600",
                      )}
                    >
                      {s.result.result === "success"
                        ? `Bag ${s.result.bag_no}`
                        : s.result.result === "queued"
                          ? `Queued: Bag ${s.result.bag_no || "unknown"}`
                          : s.result.result === "wrong_destination"
                            ? "⚠️ Wrong destination!"
                            : s.result.alert || s.result.result}
                    </span>
                    <span className="text-muted-foreground">{s.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full text-xl h-16 rounded-xl min-h-[56px]"
            onClick={handleScan}
          >
            <Scan className="mr-2 size-6" /> Scan QR
          </Button>
        </>
      )}
    </div>
  );
}
