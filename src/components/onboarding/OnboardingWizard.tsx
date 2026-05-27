import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi, usersApi } from "@/lib/api-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Building2,
  Factory,
  Building,
  Eye,
  EyeOff,
} from "lucide-react";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Overview KPIs, charts, and alerts",
  production: "Machine entries, shift logging, downtime tracking",
  quality: "Tests, lot approvals, CSP tracking",
  stock: "Stock snapshot, lot balance, warehouse stock",
  inventory: "Lot management, transfers, warehouse operations",
  lotrac: "GPS trip tracking, QR scanning, delivery confirmation",
  dispatch: "Sales orders, trips, loading, delivery",
  purchase: "Cotton purchase, bales, suppliers, GRN",
  stores: "Spare parts inventory, issues, stock receive",
  hr: "Employees, attendance, leaves",
  payroll: "Monthly payroll, payslips, processing",
  accounts: "Invoices, receivables, GST, P&L",
  maintenance: "Breakdown logs, preventive schedules, parameters",
  reports: "Summary reports, exports",
  audit: "Audit logs, system activity",
  users: "User management, roles, permissions",
  masters: "Masters data — mills, departments, customers, etc.",
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  production: "Production",
  quality: "Quality",
  stock: "Stock",
  inventory: "Inventory",
  lotrac: "LoTrac",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  payroll: "Payroll",
  accounts: "Accounts",
  maintenance: "Maintenance",
  reports: "Reports",
  audit: "Audit",
  users: "Users",
  masters: "Masters",
};
const ALL_MODULES = Object.keys(MODULE_LABELS);

const DEFAULT_DEPARTMENTS = [
  "Blowroom",
  "Carding",
  "Drawing",
  "Simplex",
  "Ring Frame",
  "Winding",
  "Quality",
  "Admin",
  "Maintenance",
  "IT",
  "Security",
];

const PLAN_LIMITS: Record<string, { users: string; mills: string; modules: string }> = {
  Basic: { users: "10", mills: "1", modules: "5" },
  Pro: { users: "50", mills: "3", modules: "10" },
  Enterprise: { users: "Unlimited", mills: "Unlimited", modules: "Unlimited" },
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

interface MillEntry {
  name: string;
  code: string;
  city: string;
  state: string;
  shift_pattern: string;
  production_target_kg: number;
}

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 1 — Company Details
  const [companyForm, setCompanyForm] = useState({
    name: "",
    code: "",
    gstin: "",
    phone: "",
    email: "",
    address: "",
  });

  // Step 2 — Modules
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_MODULES.map((m) => [m, true])),
  );

  // Step 3 — Mills
  const [mills, setMills] = useState<MillEntry[]>([
    { name: "", code: "", city: "", state: "", shift_pattern: "General", production_target_kg: 0 },
  ]);

  // Step 4 — Departments
  const [selectedDepts, setSelectedDepts] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_DEPARTMENTS.map((d) => [d, true])),
  );
  const [customDepts, setCustomDepts] = useState<string[]>([]);
  const [newCustomDept, setNewCustomDept] = useState("");

  // Step 5 — Plan
  const [plan, setPlan] = useState({
    max_users: 50,
    subscription_plan: "Pro",
  });

  // Step 6 — Mill Owner
  const [ownerForm, setOwnerForm] = useState({
    full_name: "",
    email: "",
    password: generatePassword(),
    must_change_password: true,
    mill_id: "",
  });
  const [showPwd, setShowPwd] = useState(false);

  const totalSteps = 7;

  const canProceed = () => {
    switch (step) {
      case 1: return !!(companyForm.name && companyForm.code);
      case 2: return Object.values(selectedModules).some(Boolean);
      case 3: return mills.some((m) => m.name && m.code);
      case 4: return true;
      case 5: return plan.max_users > 0;
      case 6: return !!(ownerForm.full_name && ownerForm.email);
      case 7: return true;
      default: return false;
    }
  };

  const handleCreate = async () => {
    setProgress("Creating company...");
    try {
      const company = await mastersApi.createCompany({
        code: companyForm.code,
        name: companyForm.name,
        gstin: companyForm.gstin || undefined,
        phone: companyForm.phone || undefined,
        email: companyForm.email || undefined,
        address: companyForm.address || undefined,
        max_users: plan.max_users,
        subscription_plan: plan.subscription_plan,
      });
      const companyId = company.id ?? company._id;
      if (!companyId) throw new Error("No company ID returned");

      setProgress("Configuring modules...");
      const enabledModules = Object.entries(selectedModules)
        .filter(([, v]) => v)
        .map(([k]) => k);
      await adminApi.createCompanyModules(companyId, enabledModules);

      setProgress("Creating mills...");
      const millIds: string[] = [];
      for (const mill of mills) {
        const created = await mastersApi.createMill({
          company_id: companyId,
          code: mill.code,
          name: mill.name,
          city: mill.city || undefined,
          state: mill.state || undefined,
        });
        const millId = created.id ?? created._id;
        if (millId) millIds.push(millId);
      }

      setProgress("Setting up departments...");
      const allDepts = [
        ...DEFAULT_DEPARTMENTS.filter((d) => selectedDepts[d]),
        ...customDepts,
      ];
      for (const millId of millIds) {
        for (const dept of allDepts) {
          try {
            await mastersApi.createDepartment({
              mill_id: millId,
              code: dept.toLowerCase().replace(/\s+/g, "_"),
              name: dept,
              department_type: dept.toLowerCase().replace(/\s+/g, "_"),
            });
          } catch {
            // skip duplicate departments
          }
        }
      }

      setProgress("Creating mill owner...");
      const assignedMillId = ownerForm.mill_id || millIds[0];
      const user = await usersApi.create({
        full_name: ownerForm.full_name,
        email: ownerForm.email,
        password: ownerForm.password,
        role: "MILL_OWNER",
        company_id: companyId,
        mill_id: assignedMillId,
        must_change_password: ownerForm.must_change_password,
      });

      setProgress("Done! 🎉");
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["system-users"] });
      setSuccess({ email: user.email ?? ownerForm.email, password: ownerForm.password });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? err.message ?? "Onboarding failed");
      setProgress(null);
    }
  };

  function copyCredentials() {
    if (!success) return;
    const text = `Email: ${success.email}\nPassword: ${success.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setStep(1);
    setProgress(null);
    setSuccess(null);
    setCompanyForm({ name: "", code: "", gstin: "", phone: "", email: "", address: "" });
    setSelectedModules(Object.fromEntries(ALL_MODULES.map((m) => [m, true])));
    setMills([{ name: "", code: "", city: "", state: "", shift_pattern: "General", production_target_kg: 0 }]);
    setSelectedDepts(Object.fromEntries(DEFAULT_DEPARTMENTS.map((d) => [d, true])));
    setCustomDepts([]);
    setPlan({ max_users: 50, subscription_plan: "Pro" });
    setOwnerForm({ full_name: "", email: "", password: generatePassword(), must_change_password: true, mill_id: "" });
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedModuleCount = Object.values(selectedModules).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Onboard New Company
          </DialogTitle>
          <DialogDescription>
            Step {step} of {totalSteps}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <Progress value={(step / totalSteps) * 100} className="mb-4" />

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <div className="flex justify-center">
              <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="size-6 text-green-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold">Company Onboarded Successfully! 🎉</h3>
            <div className="space-y-2 text-left max-w-sm mx-auto">
              <div>
                <Label>Email</Label>
                <code className="block mt-1 px-3 py-2 rounded bg-muted text-sm">{success.email}</code>
              </div>
              <div>
                <Label>Password</Label>
                <code className="block mt-1 px-3 py-2 rounded bg-muted text-sm">{success.password}</code>
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={copyCredentials}>
                <Copy className="size-4 mr-1" /> {copied ? "Copied!" : "Copy Credentials"}
              </Button>
              <Button onClick={handleClose}>
                Go to Company →
              </Button>
            </div>
          </div>
        ) : progress ? (
          <div className="py-12 text-center space-y-4">
            <div className="flex justify-center">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <p className="text-lg font-medium">{progress}</p>
          </div>
        ) : (
          <>
            {/* Step 1 — Company Details */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Enter the basic details of the new company.</p>
                <div className="space-y-1.5">
                  <Label>Company Name <span className="text-destructive">*</span></Label>
                  <Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} placeholder="e.g. SpinFlow Textiles Pvt Ltd" />
                </div>
                <div className="space-y-1.5">
                  <Label>Code <span className="text-destructive">*</span></Label>
                  <Input value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })} placeholder="e.g. SPIN001" />
                </div>
                <div className="space-y-1.5">
                  <Label>GSTIN</Label>
                  <Input value={companyForm.gstin} onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value })} placeholder="15 alphanumeric chars" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Textarea value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
                </div>
              </div>
            )}

            {/* Step 2 — Select Modules */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{selectedModuleCount} modules selected</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedModules(Object.fromEntries(ALL_MODULES.map((m) => [m, true])))}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedModules(Object.fromEntries(ALL_MODULES.map((m) => [m, false])))}>
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                  {ALL_MODULES.map((mod) => (
                    <label key={mod} className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-accent/50">
                      <Checkbox
                        checked={selectedModules[mod] ?? false}
                        onCheckedChange={(v) => setSelectedModules((prev) => ({ ...prev, [mod]: !!v }))}
                      />
                      <div>
                        <p className="text-sm font-medium">{MODULE_LABELS[mod]}</p>
                        <p className="text-xs text-muted-foreground">{MODULE_DESCRIPTIONS[mod]}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Setup Mills */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Add at least one mill for the company.</p>
                {mills.map((mill, idx) => (
                  <div key={idx} className="space-y-3 p-4 rounded-md border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Mill #{idx + 1}</span>
                      {mills.length > 1 && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setMills((prev) => prev.filter((_, i) => i !== idx))}>
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Mill Name <span className="text-destructive">*</span></Label>
                        <Input value={mill.name} onChange={(e) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, name: e.target.value } : m))} placeholder="Unit 1" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Code <span className="text-destructive">*</span></Label>
                        <Input value={mill.code} onChange={(e) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, code: e.target.value } : m))} placeholder="M001" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>City</Label>
                        <Input value={mill.city} onChange={(e) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, city: e.target.value } : m))} placeholder="Coimbatore" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>State</Label>
                        <Input value={mill.state} onChange={(e) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, state: e.target.value } : m))} placeholder="Tamil Nadu" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Shift Pattern</Label>
                        <Select value={mill.shift_pattern} onValueChange={(v) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, shift_pattern: v } : m))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="General">General</SelectItem>
                            <SelectItem value="Two Shift">Two Shift</SelectItem>
                            <SelectItem value="Three Shift">Three Shift</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Production Target (kg/day)</Label>
                        <Input type="number" value={mill.production_target_kg || ""} onChange={(e) => setMills((prev) => prev.map((m, i) => i === idx ? { ...m, production_target_kg: parseInt(e.target.value) || 0 } : m))} />
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setMills((prev) => [...prev, { name: "", code: "", city: "", state: "", shift_pattern: "General", production_target_kg: 0 }])}>
                  <Factory className="size-3.5 mr-1" /> Add Another Mill
                </Button>
              </div>
            )}

            {/* Step 4 — Setup Departments */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select departments for the mill. These will be created for each mill.</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_DEPARTMENTS.map((dept) => (
                    <label key={dept} className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-accent/50">
                      <Checkbox
                        checked={selectedDepts[dept] ?? false}
                        onCheckedChange={(v) => setSelectedDepts((prev) => ({ ...prev, [dept]: !!v }))}
                      />
                      <Building className="size-3.5 text-muted-foreground" />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>Custom Departments</Label>
                  <div className="flex gap-2">
                    <Input value={newCustomDept} onChange={(e) => setNewCustomDept(e.target.value)} placeholder="e.g. Lab" className="flex-1" />
                    <Button variant="outline" size="sm" onClick={() => {
                      if (newCustomDept.trim() && !customDepts.includes(newCustomDept.trim())) {
                        setCustomDepts((prev) => [...prev, newCustomDept.trim()]);
                        setNewCustomDept("");
                      }
                    }}>
                      Add
                    </Button>
                  </div>
                  {customDepts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customDepts.map((d) => (
                        <Badge key={d} variant="secondary" className="gap-1">
                          {d}
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => setCustomDepts((prev) => prev.filter((x) => x !== d))}>
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 5 — User Limits & Plan */}
            {step === 5 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Set usage limits and choose a subscription plan.</p>
                <div className="space-y-1.5">
                  <Label>Max Users</Label>
                  <Input type="number" value={plan.max_users} onChange={(e) => setPlan({ ...plan, max_users: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Subscription Plan</Label>
                  <Select value={plan.subscription_plan} onValueChange={(v) => setPlan({ ...plan, subscription_plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Basic">Basic</SelectItem>
                      <SelectItem value="Pro">Pro</SelectItem>
                      <SelectItem value="Enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <p className="font-medium">Plan Limits:</p>
                  <p className="text-muted-foreground">Basic: 10 users | 1 mill | 5 modules</p>
                  <p className="text-muted-foreground">Pro: 50 users | 3 mills | 10 modules</p>
                  <p className="text-muted-foreground">Enterprise: Unlimited</p>
                </div>
              </div>
            )}

            {/* Step 6 — Create Mill Owner */}
            {step === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Create the first user who will manage this company.</p>
                <div className="space-y-1.5">
                  <Label>Full Name <span className="text-destructive">*</span></Label>
                  <Input value={ownerForm.full_name} onChange={(e) => setOwnerForm({ ...ownerForm, full_name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input type="email" value={ownerForm.email} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} placeholder="john@mill.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Temp Password</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} type={showPwd ? "text" : "password"} className="pr-8" />
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(!showPwd)}>
                        {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOwnerForm({ ...ownerForm, password: generatePassword() })}>
                      Regenerate
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(ownerForm.password); toast.success("Copied"); }}>
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Input value="Mill Owner" disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Mill</Label>
                  <Select value={ownerForm.mill_id} onValueChange={(v) => setOwnerForm({ ...ownerForm, mill_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select mill" /></SelectTrigger>
                    <SelectContent>
                      {mills.filter((m) => m.name).map((m, idx) => (
                        <SelectItem key={idx} value={`mill_${idx}`}>{m.name} ({m.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={ownerForm.must_change_password}
                    onCheckedChange={(v) => setOwnerForm({ ...ownerForm, must_change_password: !!v })}
                  />
                  <span className="text-sm">Must change password on first login</span>
                </label>
              </div>
            )}

            {/* Step 7 — Review & Create */}
            {step === 7 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Review everything before creating.</p>
                <div className="rounded-md border divide-y">
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="font-medium">{companyForm.name} ({companyForm.code})</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Modules</p>
                    <p className="font-medium">{selectedModuleCount} selected</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Mills</p>
                    <p className="font-medium">{mills.filter((m) => m.name).length} mill(s)</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Departments</p>
                    <p className="font-medium">
                      {DEFAULT_DEPARTMENTS.filter((d) => selectedDepts[d]).length + customDepts.length} department(s)
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="font-medium">{plan.subscription_plan} — {plan.max_users} max users</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Mill Owner</p>
                    <p className="font-medium">{ownerForm.full_name} ({ownerForm.email})</p>
                  </div>
                </div>
                <Button className="w-full" size="lg" onClick={handleCreate}>
                  <Building2 className="size-4 mr-2" /> Create Everything
                </Button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6 pt-4 border-t">
              <div>
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                    <ChevronLeft className="size-4 mr-1" /> Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                {step < totalSteps && (
                  <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
                    Next <ChevronRight className="size-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
