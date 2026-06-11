import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { X, Lightbulb, AlertTriangle, Info, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Nudge {
  id: string;
  title: string;
  message: string;
  nudge_type: string;
  action_label: string | null;
  action_url: string | null;
  icon: string | null;
  priority: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-amber-50 border-amber-200",
  medium: "bg-blue-50 border-blue-200",
  info: "bg-gray-50 border-gray-200",
};

const PRIORITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  high: AlertTriangle,
  medium: Lightbulb,
  info: Info,
};

export function NudgeBar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["nudges"],
    queryFn: () => api.get("/nudges").then((r) => r.data ?? []),
    staleTime: 60_000,
    enabled: !!user,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => api.post(`/nudges/${id}/dismiss`),
  });

  const nudges: Nudge[] = (data ?? []).filter((n: Nudge) => !dismissed.has(n.id));
  if (nudges.length === 0) return null;

  const nudge = nudges[0]; // Show top priority only

  const Icon = PRIORITY_ICONS[nudge.priority] ?? Lightbulb;

  return (
    <div className={cn("px-4 py-2.5 border-b flex items-center gap-3", PRIORITY_STYLES[nudge.priority] ?? "bg-gray-50 border-gray-200")}>
      <Icon className="w-4 h-4 shrink-0 text-gray-600" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-gray-900">{nudge.title}</span>
        <span className="text-xs text-muted-foreground ml-2">{nudge.message}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {nudge.action_url && (
          <a
            href={nudge.action_url}
            className="flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline"
          >
            {nudge.action_label ?? "View"} <ChevronRight className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={() => {
            setDismissed((prev) => new Set(prev).add(nudge.id));
            dismissMut.mutate(nudge.id);
          }}
          className="p-0.5 rounded hover:bg-black/5"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
