import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { stockApi, salesApi, mastersApi } from "@/lib/api-service";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import type { StockSnapshotRow, SalesOrder, SalesOrderLine, Customer } from "@/lib/types";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";

export const Route = createFileRoute("/_app/stock")({
  component: StockPage,
});

const FG_COLORS: Record<string, string> = {
  WIP: "bg-gray-100 text-gray-700",
  QC_PENDING: "bg-yellow-100 text-yellow-700",
  SELLABLE: "bg-green-100 text-green-700",
  RESERVED: "bg-blue-100 text-blue-700",
  QUARANTINE: "bg-red-100 text-red-700",
  DISPATCHED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-slate-100 text-slate-700",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  partially_delivered: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function StockPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"stock" | "sales">("stock");

  return (
    <>
      <AccessGuard module="stock">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Stock Ledger</h1>
          </div>

          <div className="flex gap-1 border-b">
            <button
              onClick={() => setTab("stock")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === "stock"
                  ? "bg-white border border-b-white -mb-px border-gray-200 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Current Stock
            </button>
            <button
              onClick={() => setTab("sales")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === "sales"
                  ? "bg-white border border-b-white -mb-px border-gray-200 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sales Orders
            </button>
          </div>

          {tab === "stock" ? <CurrentStockTab /> : <SalesOrdersTab />}
        </div>
      </AccessGuard>
    </>
  );
}

function CurrentStockTab() {
  const [rows, setRows] = useState<StockSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<string>("");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("");
  const [filterYarn, setFilterYarn] = useState<string>("");
  const [selectedLot, setSelectedLot] = useState<StockSnapshotRow | null>(null);
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filterState) params.fg_state = filterState;
    if (filterWarehouse) params.warehouse_id = filterWarehouse;
    if (filterYarn) params.yarn_count = filterYarn;
    stockApi.getSnapshot(params).then((data) => {
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, [filterState, filterWarehouse, filterYarn]);

  const loadHistory = async (lotId: string) => {
    setHistoryLoading(true);
    try {
      const data = await stockApi.getLotHistory(lotId);
      setLedgerHistory(Array.isArray(data) ? data : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fgStates = [
    "",
    "WIP",
    "QC_PENDING",
    "SELLABLE",
    "RESERVED",
    "QUARANTINE",
    "DISPATCHED",
    "DELIVERED",
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-lg border">
        <div className="flex flex-wrap gap-1.5">
          {fgStates.map((s) =>
            s ? (
              <button
                key={s}
                onClick={() => setFilterState(filterState === s ? "" : s)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  filterState === s ? "ring-2 ring-offset-1 ring-blue-500" : ""
                } ${FG_COLORS[s] || "bg-gray-50 text-gray-600"}`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ) : null,
          )}
        </div>
        {filterState && (
          <button
            onClick={() => setFilterState("")}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-4 py-3 font-medium">Lot No</th>
              <th className="px-4 py-3 font-medium">Yarn Count</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium text-right">On Hand</th>
              <th className="px-4 py-3 font-medium text-right">Reserved</th>
              <th className="px-4 py-3 font-medium text-right">Available</th>
              <th className="px-4 py-3 font-medium text-right">Quarantine</th>
              <th className="px-4 py-3 font-medium text-right">Weight (kg)</th>
              <th className="px-4 py-3 font-medium">Last Move</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded w-16" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  No stock records yet
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={`${r.lot_id}-${r.warehouse_id}`}
                  className="border-t hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedLot(r);
                    loadHistory(r.lot_id);
                  }}
                >
                  <td className="px-4 py-3 font-medium">{r.lot_no}</td>
                  <td className="px-4 py-3">{r.yarn_count}</td>
                  <td className="px-4 py-3">{r.warehouse_code}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${FG_COLORS[r.fg_state] || "bg-gray-100"}`}
                    >
                      {r.fg_state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{r.qty_on_hand}</td>
                  <td className="px-4 py-3 text-right">{r.qty_reserved}</td>
                  <td className="px-4 py-3 text-right font-semibold">{r.qty_available}</td>
                  <td className="px-4 py-3 text-right">{r.qty_quarantine}</td>
                  <td className="px-4 py-3 text-right">{r.weight_on_hand_kg.toFixed(1)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.last_move_at ? new Date(r.last_move_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Lot Detail Slide-over */}
      {selectedLot && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedLot(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Lot {selectedLot.lot_no}</h2>
              <button
                onClick={() => setSelectedLot(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Warehouse:</span> {selectedLot.warehouse_code}
                </div>
                <div>
                  <span className="text-gray-500">State:</span> {selectedLot.fg_state}
                </div>
                <div>
                  <span className="text-gray-500">On Hand:</span> {selectedLot.qty_on_hand}
                </div>
                <div>
                  <span className="text-gray-500">Available:</span> {selectedLot.qty_available}
                </div>
                <div>
                  <span className="text-gray-500">Weight:</span> {selectedLot.weight_on_hand_kg} kg
                </div>
              </div>
              <h3 className="font-medium text-sm text-gray-500 uppercase tracking-wide">
                Ledger History
              </h3>
              {historyLoading ? (
                <div className="text-sm text-gray-400">Loading...</div>
              ) : ledgerHistory.length === 0 ? (
                <div className="text-sm text-gray-400">No ledger entries</div>
              ) : (
                <div className="space-y-2">
                  {ledgerHistory.map((entry: any) => (
                    <div key={entry.id} className="text-xs border rounded p-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{entry.move_type}</span>
                        <span className="text-gray-400">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      {entry.qty_in > 0 && <div>In: {entry.qty_in}</div>}
                      {entry.qty_out > 0 && <div>Out: {entry.qty_out}</div>}
                      {entry.ref_doc_type && (
                        <div className="text-gray-400">
                          {entry.ref_doc_type}: {entry.ref_doc_id}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SalesOrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lots, setLots] = useState<any[]>([]);

  const loadOrders = () => {
    setLoading(true);
    const params: Record<string, string | number> = { page: 1, page_size: 50 };
    if (filterStatus) params.status = filterStatus;
    salesApi.listOrders(params).then((data) => {
      const fetched = data.data || [];
      setOrders(fetched);
      setFilteredOrders(fetched);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadOrders();
  }, [filterStatus]);

  useEffect(() => {
    mastersApi.getCustomers().then((d: any) => setCustomers(d.data || []));
    stockApi
      .getSnapshot({ fg_state: "SELLABLE" })
      .then((d: any) => setLots(Array.isArray(d) ? d : []));
  }, []);

  const stats = ["", "draft", "confirmed", "partially_delivered", "completed", "cancelled"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {stats.map((s) =>
            s ? (
              <button
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors capitalize ${
                  filterStatus === s ? "ring-2 ring-offset-1 ring-blue-500" : ""
                } ${STATUS_COLORS[s] || "bg-gray-50 text-gray-600"}`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ) : null,
          )}
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          New Sales Order
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <div className="px-4 pt-3">
          <ExcelColumnFilter
            data={orders}
            onFilter={setFilteredOrders}
            columns={[
              { key: "so_no" as const, label: "SO No", placeholder: "Filter SO..." },
              { key: "order_date" as const, label: "Order Date", placeholder: "Filter date..." },
              {
                key: "delivery_date" as const,
                label: "Delivery Date",
                placeholder: "Filter delivery...",
              },
              { key: "total_bags" as const, label: "Bags", placeholder: "Filter bags..." },
              { key: "status" as const, label: "Status", placeholder: "Filter status..." },
            ]}
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-4 py-3 font-medium">SO No</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Order Date</th>
              <th className="px-4 py-3 font-medium">Delivery Date</th>
              <th className="px-4 py-3 font-medium text-right">Bags</th>
              <th className="px-4 py-3 font-medium text-right">Weight (kg)</th>
              <th className="px-4 py-3 font-medium text-right">Value</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded w-16" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  No sales orders yet
                </td>
              </tr>
            ) : (
              filteredOrders.map((so: any) => (
                <tr key={so.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{so.so_no}</td>
                  <td className="px-4 py-3">
                    {customers.find((c: Customer) => c.id === so.customer_id)?.name ||
                      so.customer_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{so.order_date}</td>
                  <td className="px-4 py-3">{so.delivery_date || "-"}</td>
                  <td className="px-4 py-3 text-right">{so.total_bags}</td>
                  <td className="px-4 py-3 text-right">{so.total_weight_kg.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">
                    {so.total_value != null ? `\u20B9${so.total_value.toLocaleString()}` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium capitalize ${STATUS_COLORS[so.status] || "bg-gray-100"}`}
                    >
                      {so.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {so.status === "draft" && (
                        <span
                          title={so.created_by === user?.id ? "Cannot confirm your own order" : ""}
                          className={`text-xs px-2 py-1 rounded ${
                            so.created_by === user?.id
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                          }`}
                          onClick={async () => {
                            if (so.created_by === user?.id) return;
                            await salesApi.confirmOrder(so.id);
                            loadOrders();
                          }}
                        >
                          Confirm
                        </span>
                      )}
                      {(so.status === "draft" || so.status === "confirmed") && (
                        <span
                          onClick={async () => {
                            const reason = prompt("Cancellation reason:");
                            if (reason) {
                              await salesApi.cancelOrder(so.id, reason);
                              loadOrders();
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
                        >
                          Cancel
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNewForm && (
        <NewSalesOrderForm
          customers={customers}
          lots={lots}
          onClose={() => setShowNewForm(false)}
          onCreated={() => {
            setShowNewForm(false);
            loadOrders();
          }}
        />
      )}
    </div>
  );
}

function NewSalesOrderForm({
  customers,
  lots,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  lots: StockSnapshotRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [yarnCount, setYarnCount] = useState("");
  const [incoterms, setIncoterms] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    Array<{
      lot_id: string;
      warehouse_id: string;
      bags_ordered: number;
      weight_kg: number;
      rate_per_kg: string;
    }>
  >([{ lot_id: "", warehouse_id: "", bags_ordered: 0, weight_kg: 0, rate_per_kg: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const addLine = () => {
    setLines([
      ...lines,
      { lot_id: "", warehouse_id: "", bags_ordered: 0, weight_kg: 0, rate_per_kg: "" },
    ]);
  };

  const removeLine = (i: number) => {
    setLines(lines.filter((_, idx) => idx !== i));
  };

  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;

    if (field === "lot_id") {
      const lot = lots.find((l) => l.lot_id === value);
      if (lot) {
        updated[i].warehouse_id = lot.warehouse_id;
      }
    }

    setLines(updated);
  };

  const handleSubmit = async () => {
    if (!customerId || !orderDate) return;
    setSubmitting(true);
    try {
      await salesApi.createOrder({
        mill_id: user?.millId || "",
        customer_id: customerId,
        order_date: orderDate,
        delivery_date: deliveryDate || null,
        yarn_count: yarnCount || null,
        incoterms: incoterms || null,
        notes: notes || null,
        lines: lines.map((l) => ({
          lot_id: l.lot_id,
          warehouse_id: l.warehouse_id,
          bags_ordered: l.bags_ordered,
          weight_kg: l.weight_kg,
          rate_per_kg: l.rate_per_kg ? parseFloat(l.rate_per_kg) : null,
        })),
      });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">New Sales Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Order Date *</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Yarn Count</label>
              <input
                type="text"
                value={yarnCount}
                onChange={(e) => setYarnCount(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Incoterms</label>
              <input
                type="text"
                value={incoterms}
                onChange={(e) => setIncoterms(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={2}
            />
          </div>

          <h3 className="font-medium text-sm text-gray-500 uppercase tracking-wide">Line Items</h3>
          {lines.map((line, i) => (
            <div key={i} className="border rounded p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">Line {i + 1}</span>
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Lot</label>
                  <select
                    value={line.lot_id}
                    onChange={(e) => updateLine(i, "lot_id", e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">Select lot</option>
                    {lots.map((l) => (
                      <option key={l.lot_id} value={l.lot_id}>
                        {l.lot_no} ({l.qty_available} avail)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Bags Ordered</label>
                  <input
                    type="number"
                    min={0}
                    value={line.bags_ordered || ""}
                    onChange={(e) => updateLine(i, "bags_ordered", parseInt(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={line.weight_kg || ""}
                    onChange={(e) => updateLine(i, "weight_kg", parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Rate/kg</label>
                  <input
                    type="number"
                    step="0.01"
                    value={line.rate_per_kg}
                    onChange={(e) => updateLine(i, "rate_per_kg", e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addLine}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Line
          </button>
        </div>
        <div className="border-t p-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !customerId || lines.some((l) => !l.lot_id || !l.bags_ordered)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
