import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Building2, AlertTriangle, DollarSign } from "lucide-react";

interface BillingSummary {
  mrr: number;
  arr: number;
  active_companies: number;
  exceeded_mills: number;
  exceeded_users: number;
  expiring_soon: number;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function BillingDashboard() {
  const { data, isLoading } = useQuery<BillingSummary>({
    queryKey: ["billing-summary"],
    queryFn: async () => (await api.get("/subscription/admin/summary")).data,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="p-6"><div className="h-20 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const stats = [
    { label: "MRR", value: formatINR(data?.mrr ?? 0), icon: TrendingUp, color: "text-blue-600", sub: "Monthly Recurring Revenue" },
    { label: "ARR", value: formatINR(data?.arr ?? 0), icon: DollarSign, color: "text-green-600", sub: "Annual Recurring Revenue" },
    { label: "Active Companies", value: String(data?.active_companies ?? 0), icon: Building2, color: "text-purple-600", sub: "Paying customers" },
    { label: "Over Limit", value: String((data?.exceeded_mills ?? 0) + (data?.exceeded_users ?? 0)), icon: AlertTriangle, color: "text-red-600", sub: `${data?.exceeded_mills ?? 0} mills / ${data?.exceeded_users ?? 0} users` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </div>
                <s.icon className={`size-8 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
