import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi } from "@/lib/api-service";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Eye, EyeOff, UserPlus, KeyRound, Copy, Check,
  Search, X, CheckCircle2, XCircle, AlertTriangle,
  ChevronUp, ChevronDown, RefreshCw, Users, Building2,
  ShieldCheck, UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin — SpinFlow ERP" }] }),
  component: AdminUsersPage,
});

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN:          "bg-red-100 text-red-800 border-red-200",
  MILL_OWNER:           "bg-purple-100 text-purple-800 border-purple-200",
  GENERAL_MANAGER:      "bg-blue-100 text-blue-800 border-blue-200",
  PRODUCTION_MANAGER:   "bg-cyan-100 text-cyan-800 border-cyan-200",
  QUALITY_MANAGER:      "bg-green-100 text-green-800 border-green-200",
  DISPATCH_MANAGER:     "bg-amber-100 text-amber-800 border-amber-200",
  STORE_MANAGER:        "bg-orange-100 text-orange-800 border-orange-200",
  HR_MANAGER:           "bg-pink-100 text-pink-800 border-pink-200",
  ACCOUNTANT:           "bg-indigo-100 text-indigo-800 border-indigo-200",
  MAINTENANCE_MANAGER:  "bg-teal-100 text-teal-800 border-teal-200",
  SUPERVISOR:           "bg-slate-100 text-slate-700 border-slate-200",
  MACHINE_OPERATOR:     "bg-stone-100 text-stone-700 border-stone-200",
  SECURITY_GATE:        "bg-yellow-100 text-yellow-800 border-yellow-200",
  AUDITOR:              "bg-violet-100 text-violet-800 border-violet-200",
};

const ROLES_FOR_CREATE = [
  "MILL_OWNER", "GENERAL_MANAGER", "PRODUCTION_MANAGER", "QUALITY_MANAGER",
  "DISPATCH_MANAGER", "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
  "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR",
];

const ALL_FILTERABLE_ROLES = ROLES_FOR_CREATE;

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500",
  "bg-amber-500", "bg-pink-500", "bg-cyan-500",
  "bg-rose-500", "bg-indigo-500",
];

const INIT_FORM = {
  name: "", email: "", password: "", confirm: "",
  role_code: "MILL_OWNER", company_id: "", mill_id: "",
};

const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return (name ?? "?").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}
function avatarColor(name: string) {
  const code = (name ?? "A").charCodeAt(0) + ((name ?? "A").charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function pwOk(pw: string) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}
function genPwd() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── useDebounce ───────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Main component ────────────────────────────────────────────────────────────
function AdminUsersPage() {
  const qc       = useQueryClient();
  const authUser = useAuth((s) => s.user);

  // ── Filter state (client-controlled, sent to server) ──────────────────
  const [searchInput, setSearchInput]       = useState("");
  const [companyFilter, setCompanyFilter]   = useState("all");
  const [roleFilter, setRoleFilter]         = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [page, setPage]                     = useState(1);
  const [sortField, setSortField]           = useState<"created_at" | "name">("created_at");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");

  const search = useDebounce(searchInput, 350);

  // Reset page whenever filters change
  useEffect(() => { setPage(1); }, [search, companyFilter, roleFilter, statusFilter]);

  // ── Dialog state ──────────────────────────────────────────────────────
  const [createOpen, setCreateOpen]     = useState(false);
  const [form, setForm]                 = useState(INIT_FORM);
  const [showPwd, setShowPwd]           = useState(false);
  const [successDlg, setSuccessDlg]     = useState<{ user: any; pwd: string } | null>(null);
  const [resetDlg, setResetDlg]         = useState<{ user: any; pwd: string } | null>(null);
  const [highlightId, setHighlightId]   = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────

  // Stats: cheap aggregates, independent of list filters
  const statsQ = useQuery({
    queryKey: ["admin-user-stats"],
    queryFn: () => api.get("/admin/user-stats").then((r) => r.data),
    staleTime: 30_000,
  });
  const stats = statsQ.data ?? { total: 0, active: 0, inactive: 0, mill_owners: 0 };

  // Companies list (for filter dropdown + create form)
  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 200, true),
    staleTime: 60_000,
  });
  const companies: any[] = (companiesQ.data as any[]) ?? [];

  // Users: server-side filtered + paginated
  const usersParams = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    ...(search               ? { search }                  : {}),
    ...(companyFilter !== "all" ? { company_id: companyFilter } : {}),
    ...(roleFilter !== "all"    ? { role: roleFilter }         : {}),
    ...(statusFilter !== "all"  ? { status_filter: statusFilter } : {}),
  }), [page, search, companyFilter, roleFilter, statusFilter]);

  const usersQ = useQuery({
    queryKey: ["admin-users", usersParams],
    queryFn: () =>
      api.get("/admin/users", { params: usersParams }).then((r) => r.data),
    staleTime: 15_000,
    placeholderData: (prev) => prev,   // keep previous data while loading next page
  });

  const users: any[]  = usersQ.data?.items ?? [];
  const totalFiltered: number = usersQ.data?.total ?? 0;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE) || 1;

  // Mills for create-form
  const formMillsQ = useQuery({
    queryKey: ["mills-for-form", form.company_id],
    queryFn: () => mastersApi.getMills(form.company_id),
    enabled: !!form.company_id,
    staleTime: 30_000,
  });
  const formMills: any[] = formMillsQ.data ?? [];

  // ── Sort (client-side within current page only) ───────────────────────
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const va = sortField === "name" ? (a.name ?? "") : (a.created_at ?? "");
      const vb = sortField === "name" ? (b.name ?? "") : (b.created_at ?? "");
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [users, sortField, sortDir]);

  function toggleSort(field: "created_at" | "name") {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  // ── Mutations ────────────────────────────────────────────────────────
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
  }, [qc]);

  const createMut = useMutation({
    mutationFn: (d: any) => api.post("/admin/users", d).then((r) => r.data),
    onSuccess: (resp) => {
      invalidate();
      setCreateOpen(false);
      setSuccessDlg({ user: resp, pwd: form.password });
      setHighlightId(resp.id);
      // Clear filters so the new user is visible
      setSearchInput("");
      setCompanyFilter("all");
      setRoleFilter("all");
      setStatusFilter("all");
      setSortField("created_at");
      setSortDir("desc");
      setPage(1);
      setForm(INIT_FORM);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to create user"),
  });

  const resetMut = useMutation({
    mutationFn: ({ id, pwd }: { id: string; pwd: string }) =>
      api.patch(`/admin/users/${id}/reset-password`, { password: pwd }).then((r) => r.data),
    onSuccess: (_, vars) => {
      const u = users.find((u) => u.id === vars.id);
      invalidate();
      setResetDlg(null);
      setSuccessDlg({ user: u, pwd: vars.pwd });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to reset password"),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to toggle status"),
  });

  // Clear highlight after 6s
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(t);
  }, [highlightId]);

  // ── Guards ────────────────────────────────────────────────────────────
  if (!authUser || authUser.role !== "SUPER_ADMIN") {
    return (
      <div className="p-8 flex items-center gap-3 text-destructive">
        <AlertTriangle className="size-5" />
        <p className="font-medium">Only Super Admin can access this page.</p>
      </div>
    );
  }

  const hasFilter =
    searchInput || companyFilter !== "all" || roleFilter !== "all" || statusFilter !== "all";

  // ── Helpers ──────────────────────────────────────────────────────────
  function handleCreate() {
    if (!form.name || !form.email || !form.password || !form.company_id)
      return toast.error("Name, email, password, and company are required");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    if (!pwOk(form.password))
      return toast.error("Password must be 8+ chars with uppercase, lowercase, and a digit");
    createMut.mutate({
      name: form.name, email: form.email, password: form.password,
      role_code: form.role_code, company_id: form.company_id,
      mill_id: form.mill_id || undefined,
    });
  }

  function copyText(t: string) {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Stat card ─────────────────────────────────────────────────────────
  function StatCard({
    label, value, icon: Icon, iconClass, onClick, active,
  }: {
    label: string; value: number; icon: any; iconClass: string;
    onClick?: () => void; active?: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "text-left bg-white dark:bg-slate-900 border rounded-xl p-4 transition-all w-full",
          active
            ? "border-blue-400 shadow-sm shadow-blue-100 ring-1 ring-blue-300"
            : "border-gray-200 dark:border-slate-700",
          onClick && "hover:border-blue-300 hover:shadow-sm cursor-pointer",
          !onClick && "cursor-default",
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <div className={cn("p-1.5 rounded-lg", iconClass)}>
            <Icon className="size-3.5" />
          </div>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {statsQ.isLoading ? (
            <span className="inline-block w-16 h-8 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          ) : (
            value.toLocaleString()
          )}
        </p>
      </button>
    );
  }

  // ── Column header with sort ───────────────────────────────────────────
  function ColHeader({
    label, field,
  }: {
    label: string; field?: "created_at" | "name";
  }) {
    const active = field && sortField === field;
    return (
      <th
        onClick={field ? () => toggleSort(field) : undefined}
        className={cn(
          "text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap",
          field && "cursor-pointer select-none hover:text-foreground transition-colors",
        )}
      >
        {label}
        {field && (
          active ? (
            sortDir === "asc"
              ? <ChevronUp className="inline size-3 ml-0.5 text-blue-600" />
              : <ChevronDown className="inline size-3 ml-0.5 text-blue-600" />
          ) : (
            <span className="ml-1 opacity-25 text-[10px]">⇅</span>
          )
        )}
      </th>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage users across all companies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => { invalidate(); statsQ.refetch(); }}
            disabled={usersQ.isFetching || statsQ.isFetching}
          >
            <RefreshCw className={cn("size-3.5 mr-1.5", usersQ.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="size-3.5 mr-1.5" /> Create User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Users" value={stats.total}
          icon={Users} iconClass="bg-blue-50 text-blue-600"
          onClick={() => { setStatusFilter("all"); setPage(1); }}
          active={statusFilter === "all" && roleFilter === "all"}
        />
        <StatCard
          label="Active" value={stats.active}
          icon={CheckCircle2} iconClass="bg-emerald-50 text-emerald-600"
          onClick={() => { setStatusFilter("active"); setPage(1); }}
          active={statusFilter === "active"}
        />
        <StatCard
          label="Inactive" value={stats.inactive}
          icon={UserMinus} iconClass="bg-amber-50 text-amber-600"
          onClick={() => { setStatusFilter("inactive"); setPage(1); }}
          active={statusFilter === "inactive"}
        />
        <StatCard
          label="Mill Owners" value={stats.mill_owners}
          icon={ShieldCheck} iconClass="bg-purple-50 text-purple-600"
          onClick={() => { setRoleFilter("MILL_OWNER"); setStatusFilter("all"); setPage(1); }}
          active={roleFilter === "MILL_OWNER"}
        />
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Company */}
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
          >
            <option value="all">All companies</option>
            {companies.filter((c: any) => c?.id).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Role */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All roles</option>
            {ALL_FILTERABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r as Role] ?? r}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {hasFilter && (
            <button
              onClick={() => {
                setSearchInput(""); setCompanyFilter("all");
                setRoleFilter("all"); setStatusFilter("all"); setPage(1);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap px-1"
            >
              Clear all
            </button>
          )}

          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap font-medium">
            {usersQ.isFetching ? (
              <span className="opacity-60">Loading…</span>
            ) : (
              `${totalFiltered.toLocaleString()} user${totalFiltered !== 1 ? "s" : ""}`
            )}
          </span>
        </div>
      </div>

      {/* Error */}
      {usersQ.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">Failed to load users.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => usersQ.refetch()}>Retry</Button>
        </div>
      )}

      {/* Table */}
      <div className={cn(
        "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm transition-opacity",
        usersQ.isFetching && !usersQ.isLoading && "opacity-60",
      )}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
                <ColHeader label="User"       field="name" />
                <ColHeader label="Role" />
                <ColHeader label="Company" />
                <ColHeader label="Mill" />
                <ColHeader label="Last Login" />
                <ColHeader label="Created"    field="created_at" />
                <ColHeader label="Status" />
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {usersQ.isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-slate-800">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div
                          className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded-full animate-pulse"
                          style={{ width: j === 0 ? "160px" : j === 1 ? "90px" : j === 2 ? "130px" : "70px" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="size-8 opacity-30" />
                      <p className="text-sm">
                        {hasFilter ? "No users match the current filters." : "No users found."}
                      </p>
                      {hasFilter && (
                        <button
                          onClick={() => {
                            setSearchInput(""); setCompanyFilter("all");
                            setRoleFilter("all"); setStatusFilter("all"); setPage(1);
                          }}
                          className="text-xs text-blue-600 hover:underline mt-1"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => {
                  const av   = initials(u.name);
                  const avBg = avatarColor(u.name ?? "");
                  const isNew = u.id === highlightId;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "border-b border-gray-100 dark:border-slate-800 transition-colors",
                        isNew
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50/80 dark:hover:bg-slate-800/50",
                        !u.is_active && "opacity-55",
                      )}
                    >
                      {/* User */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ring-2 ring-white dark:ring-slate-900",
                            avBg,
                          )}>
                            {av}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate max-w-[160px] leading-tight">
                              {u.name}
                              {isNew && (
                                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                                  NEW
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px] mt-0.5">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "text-xs px-2.5 py-1 rounded-full font-medium border whitespace-nowrap",
                          ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-700 border-gray-200",
                        )}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                      </td>

                      {/* Company */}
                      <td className="px-4 py-3.5">
                        {u.company_name ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Building2 className="size-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[140px]">
                              {u.company_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Mill */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                          {u.mill_name ?? "—"}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(u.last_login)}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(u.created_at)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <span className="size-1.5 bg-emerald-500 rounded-full" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                            <span className="size-1.5 bg-red-400 rounded-full" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setResetDlg({ user: u, pwd: genPwd() })}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <KeyRound className="size-3" /> Reset
                          </button>
                          <button
                            onClick={() => toggleMut.mutate(u.id)}
                            disabled={toggleMut.isPending}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors font-medium",
                              u.is_active
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                            )}
                          >
                            {u.is_active
                              ? <><XCircle className="size-3" /> Deactivate</>
                              : <><CheckCircle2 className="size-3" /> Reactivate</>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs text-muted-foreground bg-gray-50/60 dark:bg-slate-800/40">
            <span>
              Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(page * PAGE_SIZE, totalFiltered).toLocaleString()} of{" "}
              {totalFiltered.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >«</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >‹</button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 5) {
                  if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                }
                return (
                  <button
                    key={p} onClick={() => setPage(p)}
                    className={cn(
                      "w-7 h-7 rounded-lg border text-xs transition-colors",
                      page === p
                        ? "bg-blue-600 text-white border-blue-600 font-semibold"
                        : "border-gray-200 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-700",
                    )}
                  >{p}</button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >›</button>
              <button
                onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create User Dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-full max-w-md mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" /> Create New User
            </DialogTitle>
            <DialogDescription>Add a user to any company in the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@mill.com" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                <button type="button" onClick={() => setForm({ ...form, password: genPwd(), confirm: form.confirm })}
                  className="text-xs text-blue-600 hover:underline">Generate</button>
              </div>
              <div className="relative">
                <Input type={showPwd ? "text" : "password"} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars" />
                <button type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {form.password && (
                <p className={cn("text-xs", pwOk(form.password) ? "text-emerald-600" : "text-amber-600")}>
                  {pwOk(form.password) ? "✓ Strong" : "Need uppercase, lowercase, and a digit"}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Re-enter" />
              {form.confirm && form.password !== form.confirm && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role_code} onValueChange={(v) => setForm({ ...form, role_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES_FOR_CREATE.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r as Role]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, mill_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.filter((c: any) => c?.id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mill <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })} disabled={!form.company_id}>
                <SelectTrigger><SelectValue placeholder={form.company_id ? "Select mill" : "Select company first"} /></SelectTrigger>
                <SelectContent>
                  {formMills.filter((m: any) => m?.id).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ──────────────────────────────────────── */}
      <Dialog open={!!resetDlg} onOpenChange={(open) => !open && setResetDlg(null)}>
        <DialogContent className="w-full max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Reset Password
            </DialogTitle>
            <DialogDescription>New password for <strong>{resetDlg?.user?.name}</strong></DialogDescription>
          </DialogHeader>
          {resetDlg && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 rounded-lg bg-muted text-sm font-mono">{resetDlg.pwd}</code>
                <Button variant="outline" size="icon" onClick={() => copyText(resetDlg.pwd)}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResetDlg(null)}>Cancel</Button>
                <Button className="flex-1" disabled={resetMut.isPending}
                  onClick={() => resetMut.mutate({ id: resetDlg.user.id, pwd: resetDlg.pwd })}>
                  {resetMut.isPending ? "Resetting…" : "Confirm Reset"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Success Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!successDlg} onOpenChange={(open) => !open && setSuccessDlg(null)}>
        <DialogContent className="w-full max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Check className="size-4" /> User Ready
            </DialogTitle>
            <DialogDescription>Share these credentials with the user.</DialogDescription>
          </DialogHeader>
          {successDlg && (
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm truncate">
                    {successDlg.user?.email ?? "—"}
                  </code>
                  <Button variant="outline" size="icon" className="shrink-0"
                    onClick={() => copyText(successDlg.user?.email ?? "")}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm font-mono">
                    {successDlg.pwd}
                  </code>
                  <Button variant="outline" size="icon" className="shrink-0"
                    onClick={() => copyText(successDlg.pwd)}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              {copied && <p className="text-xs text-emerald-600 font-medium">✓ Copied</p>}
              <Button className="w-full" onClick={() => setSuccessDlg(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { AdminUsersPage };
