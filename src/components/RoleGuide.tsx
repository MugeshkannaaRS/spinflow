import { useState, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface RoleContent {
  title: string;
  description: string;
  steps: string[];
  note?: string;
}

const ROLE_CONTENT: Record<string, RoleContent> = {
  SUPER_ADMIN: {
    title: "You are the System Administrator",
    description: "Your job: Set up the system, create all user accounts, manage masters data",
    steps: [
      "Complete the Setup Checklist to configure your mill",
      "Create user accounts for all roles (Production Manager, Supervisors, Operators, etc.)",
      "Manage master data — departments, machines, shifts, customers, suppliers",
      "Monitor system health, audit logs, and overall operations",
    ],
  },
  MILL_OWNER: {
    title: "You are the System Administrator",
    description: "Your job: Set up the system, create all user accounts, manage masters data",
    steps: [
      "Complete the Setup Checklist to configure your mill",
      "Create user accounts for all roles (Production Manager, Supervisors, Operators, etc.)",
      "Manage master data — departments, machines, shifts, customers, suppliers",
      "Monitor system health, audit logs, and overall operations",
    ],
  },
  PRODUCTION_MANAGER: {
    title: "You manage production data",
    description: "Your job: Log shift production entries, approve operator entries, manage machines",
    steps: [
      "Monitor daily production across all departments on the Dashboard",
      "Review and approve shift production entries submitted by Supervisors",
      "Log production entries for departments under your direct oversight",
      "Track machine efficiency, waste percentages, and downtime causes",
    ],
  },
  SUPERVISOR: {
    title: "You supervise your shift",
    description: "Your job: Mark attendance for your shift, submit shift production entries",
    steps: [
      "Mark attendance for employees in your shift",
      "Submit shift-wise production entries for each machine",
      "Record downtime events with reasons and durations",
      "Verify Operator entries before final submission",
    ],
  },
  MACHINE_OPERATOR: {
    title: "You log your machine's production",
    description: "Your job: Submit daily shift production entries for your machine",
    steps: [
      "Log production output (kgs) for your assigned machine each shift",
      "Record waste and downtime with proper reasons",
      "Ensure entries are accurate before end of shift",
    ],
    note: "Your entries are reviewed by your Shift Supervisor before approval.",
  },
  QUALITY_MANAGER: {
    title: "You manage yarn quality",
    description: "Your job: Test lots, record CSP/moisture, approve or reject",
    steps: [
      "Test yarn samples from production lots for strength (CSP) and moisture",
      "Record quality parameters for each lot and count",
      "Approve or reject lots based on quality thresholds",
      "Generate quality reports for management review",
    ],
  },
  HR_MANAGER: {
    title: "You manage people",
    description: "Your job: Add employees, mark attendance, approve leave, run payroll",
    steps: [
      "Add and maintain employee records with designations and documents",
      "Review and approve or reject leave requests",
      "Run monthly payroll with accurate attendance data",
      "Manage employee shifts and department assignments",
    ],
  },
  DISPATCH_MANAGER: {
    title: "You manage yarn dispatch",
    description: "Your job: Create trips, assign bags, confirm deliveries",
    steps: [
      "Create trip sheets for outgoing yarn deliveries",
      "Assign bag numbers and lots to each trip",
      "Verify loading at the gate and confirm dispatch",
      "Update delivery status and generate delivery challans",
    ],
  },
  ACCOUNTANT: {
    title: "You manage accounts",
    description: "Your job: Create invoices after delivery, record payments, track GST",
    steps: [
      "Generate invoices for confirmed dispatches",
      "Record customer payments and track outstanding",
      "Manage GST compliance and input/output tax ledgers",
      "Reconcile purchase accounts and supplier payments",
    ],
  },
  MAINTENANCE_MANAGER: {
    title: "You manage machine maintenance",
    description: "Your job: Log breakdowns, schedule preventive maintenance, track spares",
    steps: [
      "Log machine breakdowns with reason and downtime",
      "Schedule and track preventive maintenance tasks",
      "Maintain spare parts inventory in the Stores module",
      "Generate maintenance reports for management review",
    ],
  },
  STORE_MANAGER: {
    title: "You manage spare parts inventory",
    description: "Your job: Track spare stock, record issues, alert on low stock",
    steps: [
      "Maintain stock records for all spare parts and consumables",
      "Record inward receipt and outward issue of spares",
      "Set reorder levels and get alerted on low stock",
      "Conduct periodic stock audits and reconcile differences",
    ],
  },
  AUDITOR: {
    title: "You audit the system",
    description: "Your job: Review logs, verify transactions, ensure compliance",
    steps: [
      "View audit logs for all system activities",
      "Verify production, dispatch, and quality transactions",
      "Generate compliance reports for statutory requirements",
    ],
  },
  SECURITY_GATE: {
    title: "You manage gate operations",
    description: "Your job: Verify outgoing shipments, scan QR codes at gate",
    steps: [
      "Scan QR codes on bags to verify outgoing shipments",
      "Confirm vehicle load details against trip sheets before release",
    ],
  },
  GENERAL_MANAGER: {
    title: "You oversee operations",
    description: "Your job: Monitor production, review reports, manage team",
    steps: [
      "Monitor real-time production KPIs and efficiency on the Dashboard",
      "Review department-wise performance reports",
      "Manage team leads and review operational metrics",
    ],
  },
};

export function RoleGuide() {
  const user = useAuth((s) => s.user);
  const [dismissed, setDismissed] = useState(false);

  const storageKey = `spinflow_role_guide_seen_${user?.id}`;

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") {
      setDismissed(true);
    }
  }, [storageKey]);

  if (!user) return null;

  const roleLabel =
    user.role === "SUPERVISOR"
      ? "SUPERVISOR"
      : user.role;

  const content = ROLE_CONTENT[roleLabel];
  if (!content) return null;

  if (dismissed) return null;

  return (
    <Card className="border-muted">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-base">{content.title}</CardTitle>
          <CardDescription>{content.description}</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 -mt-1 -mr-2"
          onClick={() => { localStorage.setItem(storageKey, "1"); setDismissed(true); }}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {content.steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {idx + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        {content.note && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {content.note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
