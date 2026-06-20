import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ArrowRight, Rocket, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/onboarding")({
  head: () => ({ meta: [{ title: "Setup Wizard — SpinFlow ERP" }] }),
  component: OnboardingPage,
});

const STEPS = [
  {
    key: "company_info",
    label: "Company Setup",
    desc: "Your company profile is ready",
    link: "/masters",
  },
  { key: "mill_setup", label: "Mill Setup", desc: "Create at least one mill", link: "/masters" },
  {
    key: "departments",
    label: "Departments",
    desc: "Add production departments",
    link: "/masters",
  },
  { key: "employees", label: "Employees", desc: "Import your workforce", link: "/import-hub" },
  { key: "machines", label: "Machines", desc: "Register your machines", link: "/masters" },
  { key: "shifts", label: "Shifts", desc: "Configure production shifts", link: "/masters" },
  { key: "roles", label: "Roles", desc: "Assign user roles", link: "/users" },
  {
    key: "billing",
    label: "Billing",
    desc: "Activate your subscription",
    link: "/company/billing",
  },
  {
    key: "go_live",
    label: "Go Live",
    desc: "All systems ready — start operations",
    link: "/dashboard",
  },
];

const STEP_LINKS: Record<string, string> = {
  company_info: "/masters",
  mill_setup: "/masters",
  departments: "/masters",
  employees: "/import-hub",
  machines: "/masters",
  shifts: "/masters",
  roles: "/users",
  billing: "/company/billing",
  go_live: "/dashboard",
};

function OnboardingPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: () => api.get("/customer/onboarding/progress").then((r) => r.data),
    staleTime: 15_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => api.post("/customer/onboarding/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
  });

  const steps: Record<string, boolean> = data?.steps ?? {};
  const percent = data?.percent ?? 0;
  const completed = data?.completed ?? 0;
  const total = data?.total ?? 9;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Setup Wizard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete these steps to get your mill operational
          </p>
        </div>
        <button
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshMut.isPending && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-gray-900">Setup Progress</span>
          </div>
          <span className="text-sm font-bold text-blue-600">{percent}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {completed} of {total} steps complete
        </p>
      </div>

      {/* Steps list */}
      <div className="space-y-2">
        {STEPS.map((step) => {
          const done = steps[step.key] ?? false;
          return (
            <a
              key={step.key}
              href={STEP_LINKS[step.key]}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl border bg-white hover:bg-gray-50 transition-colors",
                done && "border-green-200 bg-green-50/30",
              )}
            >
              {done ? (
                <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
              ) : (
                <Circle className="w-6 h-6 text-gray-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={cn("text-sm font-semibold", done ? "text-green-800" : "text-gray-900")}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {done ? "Complete" : step.desc}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
