import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { alertsApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Siren,
  Factory,
  RefreshCw,
  Eye,
  Check,
  X,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  Shield,
  Zap,
  Wrench,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/time";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({ meta: [{ title: "Operations Center — SpinFlow ERP" }] }),
  component: AlertsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertEvent {
  id: string;
  rule_name: string;
  title: string;
  message: string | null;
  severity: string;
  category: string;
  status: string;
  escalation_level: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
  resolved_at: string | null;
  next_escalation_at: string | null;
}

interface TimelineEntry {
  event: string;
  timestamp: string;
  notes: string | null;
  user_name: string | null;
}

interface AlertRule {
  id: string;
  name: string;
  category: string;
  condition_type: string;
  severity: string;
  threshold_value: number | null;
  threshold_unit: string | null;
  cooldown_minutes: number;
  is_active: boolean;
  description: string | null;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const SEV_DOT: Record<string, string> = {
  EMERGENCY: "bg-red-600",
  CRITICAL:  "bg-red-500",
  WARNING:   "bg-amber-500",
  INFO:      "bg-blue-400",
};

const SEV_BADGE: Record<string, string> = {
  EMERGENCY: "bg-red-100 text-red-700",
  CRITICAL:  "bg-red-100 text-red-600",
  WARNING:   "bg-amber-100 text-amber-700",
  INFO:      "bg-blue-100 text-blue-700",
};

const SEV_ROW: Record<string, string> = {
  EMERGENCY: "border-l-4 border-l-red-600 bg-red-50/40",
  CRITICAL:  "border-l-4 border-l-red-400 bg-red-50/20",
  WARNING:   "border-l-4 border-l-amber-400 bg-amber-50/20",
  INFO:      "border-l-4 border-l-blue-300",
};

const STATUS_BADGE: Record<string, string> = {
  OPEN:      "bg-red-100 text-red-700",
  ESCALATED: "bg-orange-100 text-orange-700",
  ACKNOWLEDGED: "bg-blue-100 text-blue-700",
  RESOLVED:  "bg-green-100 text-green-700",
};

const CAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  MACHINE:   Factory,
  SECURITY:  Shield,
  BILLING:   TrendingDown,
  MAINTENANCE: Wrench,
  QUALITY:   Zap,
  SYSTEM:    Zap,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: string }) {
  return (
    <span className={cn(
      "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
      SEV_BADGE[severity] ?? "bg-gray-100 text-gray-600"
    )}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
      STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"
    )}>
      {status}
    </span>
  );
}

// ─── Timeline Drawer ─────────────────────────────────────────────────────────

function TimelineDrawer({
  alertId,
  open,
  onClose,
  onAck,
  onResolve,
}: {
  alertId: string | null;
  open: boolean;
  onClose: () => void;
  onAck: (id: string, notes?: string) => void;
  onResolve: (id: string, notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["alert-timeline", alertId],
    queryFn: () => alertsApi.getTimeline(alertId!),
    enabled: !!alertId && open,
    staleTime: 30_000,
  });

  const alert: AlertEvent | undefined = data?.alert;
  const timeline: TimelineEntry[] = data?.timeline ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              SEV_DOT[alert?.severity ?? "INFO"] ?? "bg-gray-300"
            )} />
            {alert?.title ?? "Alert Detail"}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !alert ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Not found</div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Severity</p>
                <SevBadge severity={alert.severity} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</p>
                <StatusBadge status={alert.status} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Category</p>
                <p className="font-medium">{alert.category}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Escalation</p>
                <p className="font-medium">Level {alert.escalation_level}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Created</p>
                <p className="font-medium">{new Date(alert.created_at).toLocaleString("en-IN")}</p>
              </div>
              {alert.message && (
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Message</p>
                  <p className="text-sm text-gray-700">{alert.message}</p>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Timeline
              </p>
              <div className="relative pl-4 border-l-2 border-gray-200 space-y-4">
                {timeline.map((t, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[1.45rem] top-1 w-3 h-3 rounded-full bg-white border-2 border-gray-400" />
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.timestamp).toLocaleString("en-IN")}
                      {t.user_name && ` · ${t.user_name}`}
                    </p>
                    <p className="text-sm font-medium capitalize">{t.event.replace(/_/g, " ")}</p>
                    {t.notes && <p className="text-xs text-gray-500 mt-0.5">{t.notes}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Action area */}
            {(alert.status === "OPEN" || alert.status === "ESCALATED") && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Action</p>
                <Input
                  placeholder="Optional notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { onAck(alert.id, notes); onClose(); }}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => { onResolve(alert.id, notes); onClose(); }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolve
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Rule Create Dialog ───────────────────────────────────────────────────────

const CATEGORIES = ["MACHINE", "SECURITY", "BILLING", "MAINTENANCE", "QUALITY", "SYSTEM"];
const CONDITION_TYPES = [
  "machine_breakdown", "machine_idle", "efficiency_below", "waste_above",
  "target_miss", "failed_login_burst", "billing_80", "billing_90", "billing_100",
  "maintenance_pm_due", "maintenance_calibration_due", "maintenance_inspection_due",
  "custom_threshold",
];
const SEVERITIES = ["INFO", "WARNING", "CRITICAL", "EMERGENCY"];
const ROLES = [
  "SUPERVISOR", "PRODUCTION_MANAGER", "GENERAL_MANAGER", "MILL_OWNER",
  "QUALITY_MANAGER", "MAINTENANCE_MANAGER", "SECURITY_GATE",
];

function CreateRuleDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    category: "MACHINE",
    condition_type: "machine_breakdown",
    severity: "CRITICAL",
    threshold_value: "",
    threshold_unit: "",
    cooldown_minutes: "30",
    description: "",
    target_roles: ["SUPERVISOR"] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toggleRole(role: string) {
    setForm((f) => ({
      ...f,
      target_roles: f.target_roles.includes(role)
        ? f.target_roles.filter((r) => r !== role)
        : [...f.target_roles, role],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr("Rule name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      await alertsApi.createRule({
        name: form.name.trim(),
        category: form.category,
        condition_type: form.condition_type,
        severity: form.severity,
        threshold_value: form.threshold_value ? Number(form.threshold_value) : undefined,
        threshold_unit: form.threshold_unit || undefined,
        cooldown_minutes: Number(form.cooldown_minutes) || 30,
        description: form.description || undefined,
        target_roles: form.target_roles,
      });
      onCreated();
      onClose();
      setForm({
        name: "", category: "MACHINE", condition_type: "machine_breakdown",
        severity: "CRITICAL", threshold_value: "", threshold_unit: "",
        cooldown_minutes: "30", description: "", target_roles: ["SUPERVISOR"],
      });
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Failed to save rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Alert Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rule Name *
            </label>
            <Input
              className="mt-1"
              placeholder="e.g. Machine Breakdown Alert"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</label>
              <select
                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Severity</label>
              <select
                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
              >
                {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condition Type</label>
            <select
              className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
              value={form.condition_type}
              onChange={(e) => setForm((f) => ({ ...f, condition_type: e.target.value }))}
            >
              {CONDITION_TYPES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Threshold Value
              </label>
              <Input
                className="mt-1"
                type="number"
                placeholder="e.g. 80"
                value={form.threshold_value}
                onChange={(e) => setForm((f) => ({ ...f, threshold_value: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unit
              </label>
              <Input
                className="mt-1"
                placeholder="e.g. %"
                value={form.threshold_unit}
                onChange={(e) => setForm((f) => ({ ...f, threshold_unit: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cooldown (minutes)
            </label>
            <Input
              className="mt-1"
              type="number"
              value={form.cooldown_minutes}
              onChange={(e) => setForm((f) => ({ ...f, cooldown_minutes: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Notify Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border transition-colors",
                    form.target_roles.includes(role)
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {role.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
            <Input
              className="mt-1"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Operations Center Tab ────────────────────────────────────────────────────

function OpsCenter() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("OPEN,ESCALATED");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["alerts-ops-center"],
    queryFn: () => alertsApi.getOpsCenterSummary(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: alertsData, isLoading: alertsLoading, isFetching } = useQuery({
    queryKey: ["alerts-feed", statusFilter, categoryFilter, severityFilter],
    queryFn: () =>
      alertsApi.getAlerts({
        page: 1,
        page_size: 50,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        severity: severityFilter || undefined,
      }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const ackMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      alertsApi.acknowledge(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      qc.invalidateQueries({ queryKey: ["alerts-ops-center"] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      alertsApi.resolve(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      qc.invalidateQueries({ queryKey: ["alerts-ops-center"] });
    },
  });

  const alerts: AlertEvent[] = alertsData?.data ?? alertsData ?? [];
  const ops = opsData ?? {};

  function openTimeline(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Critical"
          value={opsLoading ? "—" : (ops.critical_count ?? 0)}
          icon={Siren}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          subLabel="active"
        />
        <KpiCard
          label="Open"
          value={opsLoading ? "—" : (ops.open_count ?? 0)}
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          subLabel="unresolved"
        />
        <KpiCard
          label="Escalated"
          value={opsLoading ? "—" : (ops.escalated_count ?? 0)}
          icon={ChevronRight}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          subLabel="pending response"
        />
        <KpiCard
          label="Avg Resolution"
          value={opsLoading ? "—" : `${Math.round(ops.avg_resolution_min ?? 0)}m`}
          icon={Clock}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          subLabel="last 30 days"
        />
        <KpiCard
          label="Breakdowns Today"
          value={opsLoading ? "—" : (ops.breakdown_count_today ?? 0)}
          icon={Factory}
          iconColor="text-red-500"
          iconBg="bg-red-50"
          subLabel="machines"
        />
        <KpiCard
          label="Resolved (30d)"
          value={opsLoading ? "—" : (ops.resolved_last_30d ?? 0)}
          icon={CheckCircle2}
          iconColor="text-green-600"
          iconBg="bg-green-50"
          subLabel="completed"
        />
      </div>

      {/* Filters + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        {[
          { label: "Active", value: "OPEN,ESCALATED" },
          { label: "Open", value: "OPEN" },
          { label: "Escalated", value: "ESCALATED" },
          { label: "Acknowledged", value: "ACKNOWLEDGED" },
          { label: "Resolved", value: "RESOLVED" },
          { label: "All", value: "" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
              statusFilter === s.value
                ? "bg-gray-900 border-gray-900 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {s.label}
          </button>
        ))}

        <span className="w-px h-4 bg-gray-200" />

        {/* Category chips */}
        {["MACHINE", "SECURITY", "BILLING", "MAINTENANCE"].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter((v) => v === cat ? "" : cat)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
              categoryFilter === cat
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            {cat}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {isFetching && (
            <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["alerts-feed"] });
              qc.invalidateQueries({ queryKey: ["alerts-ops-center"] });
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Alert feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Live Alert Feed
            {alerts.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {alerts.length} alerts
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {alertsLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mb-3 text-green-400" />
              <p className="text-sm font-medium text-gray-500">No alerts match current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {alerts.map((a) => {
                const CatIcon = CAT_ICON[a.category] ?? AlertTriangle;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors group cursor-pointer",
                      SEV_ROW[a.severity] ?? ""
                    )}
                    onClick={() => openTimeline(a.id)}
                  >
                    {/* Icon */}
                    <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                      <CatIcon className="w-4 h-4 text-gray-600" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
                          {a.title}
                        </p>
                        <SevBadge severity={a.severity} />
                        <StatusBadge status={a.status} />
                        {a.escalation_level > 0 && (
                          <span className="text-[10px] text-orange-600 font-semibold">
                            ESC L{a.escalation_level}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {a.category} · {formatRelativeTime(a.created_at)}
                        </span>
                        {a.source_id && (
                          <span className="text-xs text-muted-foreground">
                            src: {a.source_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(a.status === "OPEN" || a.status === "ESCALATED") && (
                        <>
                          <button
                            title="Acknowledge"
                            onClick={() => ackMut.mutate({ id: a.id })}
                            disabled={ackMut.isPending}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Resolve"
                            onClick={() => resolveMut.mutate({ id: a.id })}
                            disabled={resolveMut.isPending}
                            className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        title="View timeline"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline drawer */}
      <TimelineDrawer
        alertId={selectedId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAck={(id, notes) => ackMut.mutate({ id, notes })}
        onResolve={(id, notes) => resolveMut.mutate({ id, notes })}
      />
    </div>
  );
}

// ─── Alert Rules Tab ──────────────────────────────────────────────────────────

function AlertRules() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["alert-rules", showAll],
    queryFn: () => alertsApi.getRules(!showAll),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      alertsApi.updateRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => alertsApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const seedMut = useMutation({
    mutationFn: () => alertsApi.seedRules(user?.companyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const canManage = user && ["SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER"].includes(user.role);

  const ruleList: AlertRule[] = Array.isArray(rules) ? rules : (rules as any)?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              showAll
                ? "bg-gray-900 border-gray-900 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {showAll ? "All Rules" : "Active Only"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1", seedMut.isPending && "animate-spin")} />
                Re-seed Defaults
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Rule
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Rules list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : ruleList.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-gray-400">
              <Zap className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium text-gray-500">No rules yet</p>
              {canManage && (
                <p className="text-xs text-gray-400 mt-1">
                  Click "Re-seed Defaults" to load the standard rule set
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {ruleList.map((rule) => {
                const CatIcon = CAT_ICON[rule.category] ?? Zap;
                return (
                  <div key={rule.id} className="flex items-start gap-3 px-4 py-3">
                    {/* Icon */}
                    <div className={cn(
                      "mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      rule.is_active ? "bg-blue-50" : "bg-gray-100"
                    )}>
                      <CatIcon className={cn(
                        "w-4 h-4",
                        rule.is_active ? "text-blue-600" : "text-gray-400"
                      )} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn(
                          "text-sm font-semibold",
                          !rule.is_active && "text-gray-400"
                        )}>
                          {rule.name}
                        </p>
                        <SevBadge severity={rule.severity} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                          {rule.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rule.condition_type.replace(/_/g, " ")}
                        {rule.threshold_value != null && (
                          <> · threshold: {rule.threshold_value}{rule.threshold_unit ?? ""}</>
                        )}
                        {" · cooldown: "}{rule.cooldown_minutes}m
                      </p>
                      {rule.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{rule.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          title={rule.is_active ? "Disable" : "Enable"}
                          onClick={() =>
                            toggleMut.mutate({ id: rule.id, is_active: !rule.is_active })
                          }
                          disabled={toggleMut.isPending}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          {rule.is_active
                            ? <ToggleRight className="w-5 h-5 text-blue-600" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />
                          }
                        </button>
                        <button
                          title="Delete"
                          onClick={() => {
                            if (confirm(`Delete rule "${rule.name}"?`))
                              deleteMut.mutate(rule.id);
                          }}
                          disabled={deleteMut.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateRuleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["alert-rules"] })}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function AlertsPage() {
  const [tab, setTab] = useState<"ops" | "rules">("ops");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Operations Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live alerts, escalations & rule management
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: "ops",   label: "Operations Center", icon: Siren },
          { key: "rules", label: "Alert Rules",        icon: Zap },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "ops" ? <OpsCenter /> : <AlertRules />}
    </div>
  );
}
