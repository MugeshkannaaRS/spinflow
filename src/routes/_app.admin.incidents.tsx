import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Activity,
  Plus,
  Siren,
  Flag,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/incidents")({
  head: () => ({ meta: [{ title: "Incident Management — Admin — SpinFlow ERP" }] }),
  component: IncidentManagementPage,
});

const SEVERITIES = ["critical", "major", "minor", "warning"] as const;
const STATUSES = ["open", "investigating", "resolved", "closed"] as const;
const COMPONENTS = ["database", "redis", "billing", "background_jobs", "api", "other"] as const;

const SEV: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical: { bg: "bg-red-50",    text: "text-red-700",    border: "#ef4444", dot: "bg-red-500" },
  major:    { bg: "bg-orange-50", text: "text-orange-700", border: "#f97316", dot: "bg-orange-500" },
  minor:    { bg: "bg-amber-50",  text: "text-amber-700",  border: "#f59e0b", dot: "bg-amber-400" },
  warning:  { bg: "bg-yellow-50", text: "text-yellow-700", border: "#eab308", dot: "bg-yellow-400" },
};

const ST: Record<string, { label: string; cls: string }> = {
  open:          { label: "Open",          cls: "bg-red-100 text-red-700 border-red-200" },
  investigating: { label: "Investigating", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  resolved:      { label: "Resolved",      cls: "bg-green-100 text-green-700 border-green-200" },
  closed:        { label: "Closed",        cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

function StatusPill({ status }: { status: string }) {
  const s = ST[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (d: any) => Promise<any> }) {
  const [form, setForm] = useState({ title: "", component: "api", severity: "minor", description: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setLoading(true);
    try { await onCreate(form); onClose(); }
    catch { /* error handled by mutation */ }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create Incident</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Database connection pool exhausted"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Component</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                value={form.component}
                onChange={e => setForm(f => ({ ...f, component: e.target.value }))}
              >
                {COMPONENTS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What happened? What is the impact?"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Create Incident
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncidentCard({ inc, onUpdate }: { inc: any; onUpdate: (id: string, data: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [actionPanel, setActionPanel] = useState(false);
  const sty = SEV[inc.severity] ?? SEV.minor;
  const isActive = inc.status === "open" || inc.status === "investigating";

  return (
    <div
      className="rounded-xl bg-white shadow-sm overflow-hidden border-l-4"
      style={{
        borderLeftColor: sty.border,
        border: `1px solid #f1f5f9`,
        borderLeft: `4px solid ${sty.border}`,
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${sty.bg}`}>
            {inc.severity === "critical" || inc.severity === "major"
              ? <AlertTriangle className={`size-4 ${sty.text}`} />
              : <Flag className={`size-4 ${sty.text}`} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">{inc.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusPill status={inc.status} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${sty.text}`}>{inc.severity}</span>
                  <span className="text-[10px] text-gray-400">{inc.component?.replace(/_/g, " ")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isActive && (
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => setActionPanel(p => !p)}
                  >
                    {inc.status === "open" ? "Investigate" : "Resolve"}
                  </Button>
                )}
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                >
                  {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
              {inc.started_at && <span>Started: {new Date(inc.started_at).toLocaleString("en-IN")}</span>}
              {inc.resolved_at && <span className="text-green-600">Resolved: {new Date(inc.resolved_at).toLocaleString("en-IN")}</span>}
              {inc.duration_minutes != null && <span>{inc.duration_minutes} min duration</span>}
            </div>
          </div>
        </div>

        {/* Action panel */}
        {actionPanel && isActive && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Resolution notes (optional)"
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
            />
            <div className="flex gap-2 flex-wrap">
              {inc.status === "open" && (
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { onUpdate(inc.id, { status: "investigating" }); setActionPanel(false); }}>
                  <Activity className="size-3 mr-1" /> Mark Investigating
                </Button>
              )}
              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                onClick={() => {
                  const d: any = { status: "resolved" };
                  if (resolveNotes.trim()) d.resolution_notes = resolveNotes;
                  onUpdate(inc.id, d);
                  setActionPanel(false);
                }}>
                <CheckCircle2 className="size-3 mr-1" /> Mark Resolved
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { onUpdate(inc.id, { status: "closed" }); setActionPanel(false); }}>
                Close
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto"
                onClick={() => setActionPanel(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/40 space-y-3">
          {inc.description && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Description</p>
              <p className="text-sm text-gray-700">{inc.description}</p>
            </div>
          )}
          {inc.resolution_notes && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Resolution Notes</p>
              <p className="text-sm text-gray-700">{inc.resolution_notes}</p>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">Change status:</span>
            <select
              className="rounded border border-gray-200 px-2 py-1 text-xs bg-white"
              value={inc.status}
              onChange={e => onUpdate(inc.id, { status: e.target.value })}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function IncidentManagementPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState("open");
  const [showCreate, setShowCreate] = useState(false);

  const incidentsQ = useQuery({
    queryKey: ["admin-incidents", tab],
    queryFn: () => adminApi.getIncidents({ status: tab !== "all" ? tab : undefined, page_size: 50 }),
    staleTime: 15_000,
    retry: 1,
  });

  const createM = useMutation({
    mutationFn: (data: any) => adminApi.createIncident(data),
    onSuccess: () => { toast.success("Incident created"); qc.invalidateQueries({ queryKey: ["admin-incidents"] }); },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to create incident"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateIncident(id, data),
    onSuccess: () => { toast.success("Incident updated"); qc.invalidateQueries({ queryKey: ["admin-incidents"] }); },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Update failed"),
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive font-medium">Only Super Admin can access this page.</div>;
  }

  const incidents: any[] = Array.isArray(
    incidentsQ.data?.items ?? incidentsQ.data?.data ?? incidentsQ.data,
  ) ? (incidentsQ.data?.items ?? incidentsQ.data?.data ?? incidentsQ.data) : [];

  const criticalCount = incidents.filter(i => i.severity === "critical").length;
  const openCount = incidents.filter(i => i.status === "open" || i.status === "investigating").length;
  const resolvedCount = incidents.filter(i => i.status === "resolved").length;

  const TABS = [
    { key: "open", label: "Open" },
    { key: "investigating", label: "Investigating" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(d) => createM.mutateAsync(d)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Incident Management</h1>
            <p className="text-sm text-gray-500 mt-1">{openCount} open · {criticalCount} critical</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-incidents"] })}>
              <RefreshCw className="size-3.5 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5 mr-1.5" /> Create Incident
            </Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Critical", value: criticalCount, cls: "text-red-600", Icon: AlertTriangle, iconCls: "text-red-300" },
            { label: "Open / Investigating", value: openCount, cls: "text-amber-600", Icon: Siren, iconCls: "text-amber-300" },
            { label: "Resolved", value: resolvedCount, cls: "text-green-600", Icon: CheckCircle2, iconCls: "text-green-300" },
          ].map(({ label, value, cls, Icon, iconCls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
              </div>
              <Icon className={`size-8 ${iconCls}`} />
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {incidentsQ.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <CheckCircle2 className="size-10 text-emerald-300 mb-3" />
            <p className="text-base font-medium text-gray-700">No {tab === "all" ? "" : tab} incidents</p>
            <p className="text-sm text-gray-400 mt-1">All clear — nothing to display here.</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5 mr-1.5" /> Create Incident
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map(inc => (
              <IncidentCard
                key={inc.id}
                inc={inc}
                onUpdate={(id, data) => updateM.mutate({ id, data })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
