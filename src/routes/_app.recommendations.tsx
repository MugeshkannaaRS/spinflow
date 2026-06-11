import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Info, Lightbulb, ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/recommendations")({
  head: () => ({ meta: [{ title: "Recommendations — SpinFlow ERP" }] }),
  component: RecommendationsPage,
});

interface Recommendation {
  type: string;
  severity: string;
  title: string;
  description: string;
  action_label: string;
  action_link: string;
}

function RecommendationsPage() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api.get("/customer/recommendations").then((r) => r.data ?? []),
    staleTime: 60_000,
  });

  const recs: Recommendation[] = data ?? [];
  const warnings = recs.filter((r) => r.severity === "warning");
  const infos = recs.filter((r) => r.severity === "info");

  const severityIcon = (s: string) => {
    switch (s) {
      case "warning": return AlertTriangle;
      case "info": return Info;
      default: return Lightbulb;
    }
  };
  const severityClass = (s: string) => {
    switch (s) {
      case "warning": return "bg-amber-50 border-amber-200";
      case "info": return "bg-blue-50 border-blue-200";
      default: return "bg-gray-50 border-gray-200";
    }
  };
  const iconClass = (s: string) => {
    switch (s) {
      case "warning": return "text-amber-600";
      case "info": return "text-blue-600";
      default: return "text-gray-600";
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recommendations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Actionable insights to improve your mill operations
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : recs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-400">
          <Lightbulb className="w-12 h-12 mb-3 text-green-400" />
          <p className="text-sm font-medium text-gray-500">All clear — no recommendations</p>
          <p className="text-xs text-gray-400 mt-1">Your mill setup looks complete</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((rec, i) => {
            const Icon = severityIcon(rec.severity);
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-xl border",
                  severityClass(rec.severity)
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white", iconClass(rec.severity))}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                  <a
                    href={rec.action_link}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline mt-2"
                  >
                    {rec.action_label} <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
