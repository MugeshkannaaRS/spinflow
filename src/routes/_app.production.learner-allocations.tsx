import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { productionApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Plus, FileText, Calendar, Clock, Users, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/production/learner-allocations")({
  head: () => ({ meta: [{ title: "Learner Allocations — SpinFlow ERP" }] }),
  component: LearnerAllocationsPage,
});

const SHIFT_LABELS: Record<string, { label: string; cls: string }> = {
  morning: { label: "Morning", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  evening: { label: "Evening", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  night:   { label: "Night",   cls: "bg-purple-100 text-purple-700 border-purple-200" },
};

function ShiftPill({ shift }: { shift: string }) {
  const s = SHIFT_LABELS[shift] ?? { label: shift, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function LearnerAllocationsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");

  const listQ = useQuery({
    queryKey: ["learner-allocations", { dateFrom, dateTo, shiftFilter }],
    queryFn: () => productionApi.getLearnerAllocations({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      shift: shiftFilter || undefined,
      page_size: 50,
    }),
    staleTime: 30_000,
    retry: 1,
  });

  const items: any[] = listQ.data?.items ?? [];
  const total: number = listQ.data?.total ?? 0;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Learner Allocation</h1>
            <p className="text-sm text-gray-500 mt-1">{total} records</p>
          </div>
          <Button size="sm" onClick={() => window.location.href = "/production/learner-allocation"}>
            <Plus className="size-3.5 mr-1.5" /> New Allocation
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="size-3.5 text-gray-400" />
            <span>From</span>
            <input
              type="date"
              className="border border-gray-200 rounded px-2 py-1 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>To</span>
            <input
              type="date"
              className="border border-gray-200 rounded px-2 py-1 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
          >
            <option value="">All Shifts</option>
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
            <option value="night">Night</option>
          </select>
          {(dateFrom || dateTo || shiftFilter) && (
            <button
              className="text-xs text-blue-500 hover:underline"
              onClick={() => { setDateFrom(""); setDateTo(""); setShiftFilter(""); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* List */}
        {listQ.isLoading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
            <FileText className="size-10 text-gray-200 mb-3" />
            <p className="text-base font-medium text-gray-600">No allocations yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first shift allocation to replace paper</p>
            <Button size="sm" className="mt-4" onClick={() => window.location.href = "/production/learner-allocation"}>
              <Plus className="size-3.5 mr-1.5" /> New Allocation
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item: any) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate({ to: "/production/learner-allocation/$id", params: { id: item.id } })}
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText className="size-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900">{item.allocation_date}</p>
                    <ShiftPill shift={item.shift} />
                    {item.allocation_type && (
                      <span className="text-[10px] text-gray-400 font-medium">{item.allocation_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                    {item.total_persons != null && (
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {item.total_persons} persons
                      </span>
                    )}
                    {item.created_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(item.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
                <Eye className="size-4 text-gray-300 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
