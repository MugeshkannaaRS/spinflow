import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle } from "lucide-react";

interface SetupCounts {
  departments: number;
  machines: number;
  shifts: number;
  employees: number;
  users: number;
  suppliers: number;
  customers: number;
  warehouses: number;
}

const STEPS: Array<{
  key: keyof SetupCounts;
  title: string;
  description: string;
  to: string;
}> = [
  { key: "departments", title: "Add Departments", description: "Create departments like Blowroom, Carding, Ring Frame, etc.", to: "/masters?tab=departments" },
  { key: "machines", title: "Add Machines", description: "Register all machines with counts and specifications", to: "/masters?tab=machines" },
  { key: "shifts", title: "Add Shifts", description: "Define shift timings (General, A, B, C)", to: "/masters?tab=shifts" },
  { key: "employees", title: "Add Employees", description: "Add employee records with designations and contact info", to: "/hr?tab=employees" },
  { key: "users", title: "Create User Accounts", description: "Create login accounts and assign roles", to: "/users" },
  { key: "suppliers", title: "Add Suppliers", description: "Register cotton suppliers with grade and contact details", to: "/purchase?tab=suppliers" },
  { key: "customers", title: "Add Customers", description: "Add customer companies for yarn sales", to: "/masters?tab=customers" },
  { key: "warehouses", title: "Add Warehouses", description: "Set up warehouse locations for stock management", to: "/masters?tab=warehouses" },
];

export function SetupGuide() {
  const user = useAuth((s) => s.user);
  const [dismissed, setDismissed] = useState(false);

  const storageKey = `spinflow_setup_dismissed_${user?.millId}`;

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") {
      setDismissed(true);
    }
  }, [storageKey]);

  const { data, isLoading } = useQuery<SetupCounts>({
    queryKey: ["setup-status", user?.millId],
    queryFn: async () => {
      const res = await api.get("/dashboard/setup-status", {
        params: { mill_id: user?.millId },
      });
      return res.data;
    },
    enabled: !!user?.millId,
  });

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "MILL_OWNER")) {
    return null;
  }

  if (dismissed) return null;

  const counts = data ?? ({} as SetupCounts);
  const completedCount = STEPS.filter((s) => (counts[s.key] ?? 0) > 0).length;
  const totalSteps = STEPS.length;
  const allDone = completedCount >= totalSteps;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">🚀 Setup Checklist — Complete these steps to go live</CardTitle>
        <CardDescription>Follow in order. Each step unlocks the next.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-16 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {completedCount} of {totalSteps} complete
                </span>
                <span className="text-muted-foreground">
                  {Math.round((completedCount / totalSteps) * 100)}%
                </span>
              </div>
              <Progress value={(completedCount / totalSteps) * 100} className="h-2" />
            </div>

            {allDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="size-10 text-success" />
                <p className="text-base font-medium">✅ Setup complete! You're ready to go live.</p>
                <Button variant="outline" size="sm" onClick={() => { localStorage.setItem(storageKey, "1"); setDismissed(true); }}>
                  Dismiss
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {STEPS.map((step, idx) => {
                  const count = counts[step.key] ?? 0;
                  const done = count > 0;
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                        done ? "bg-muted/30 border-muted" : "bg-card border-border"
                      }`}
                    >
                      <div className="shrink-0">
                        {done ? (
                          <CheckCircle2 className="size-5 text-success" />
                        ) : (
                          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                      </div>
                      <Link to={step.to} tabIndex={-1}>
                        <Button variant="outline" size="sm" className="shrink-0" disabled={done}>
                          Go →
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
