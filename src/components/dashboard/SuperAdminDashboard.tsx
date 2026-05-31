import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Building2, Factory, Users, UserCheck, Plus, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function SuperAdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => api.get("/dashboard/admin-summary").then(r => r.data),
    staleTime: 60_000,
  });

  const stats = [
    { label: "Companies", value: data?.total_companies ?? 0, icon: Building2, bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-600" },
    { label: "Mills", value: data?.total_mills ?? 0, icon: Factory, bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-600" },
    { label: "Total Users", value: data?.total_users ?? 0, icon: Users, bg: "bg-emerald-50 dark:bg-emerald-900/30", color: "text-emerald-600" },
    { label: "Employees", value: data?.total_employees ?? 0, icon: UserCheck, bg: "bg-orange-50 dark:bg-orange-900/30", color: "text-orange-600" },
  ];

  return (
    <div className="space-y-6 p-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SpinFlow Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Manage companies, mills and subscriptions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{stat.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {isLoading ? "—" : stat.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/admin" className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-4 transition-colors">
          <Plus className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold text-sm">Add New Company</div>
            <div className="text-xs text-blue-200">Onboard a new mill customer</div>
          </div>
        </Link>
        <Link to="/admin" className="flex items-center gap-3 bg-white dark:bg-slate-800 hover:bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4 transition-colors">
          <Settings className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">Manage Modules</div>
            <div className="text-xs text-gray-500">Configure company access</div>
          </div>
        </Link>
        <Link to="/users" className="flex items-center gap-3 bg-white dark:bg-slate-800 hover:bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4 transition-colors">
          <Users className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">Manage Users</div>
            <div className="text-xs text-gray-500">View all users across mills</div>
          </div>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Active Companies</h3>
          <Link to="/admin" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {isLoading ? (
            [1,2,3].map(i => (
              <div key={i} className="px-5 py-4 animate-pulse">
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-1/3" />
              </div>
            ))
          ) : !data?.companies?.length ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No companies yet. Add your first customer.
            </div>
          ) : (
            data.companies.map((company: any) => (
              <div key={company.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{company.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Code: {company.code}</div>
                </div>
                <Link to="/admin" className="text-xs text-blue-600 hover:underline">Manage →</Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
