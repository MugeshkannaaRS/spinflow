import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi } from "@/lib/api-service";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Building2, Files, CreditCard, Puzzle, User, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_app/admin/companies/onboard")({
  head: () => ({ meta: [{ title: "Onboard Company — Admin — SpinFlow ERP" }] }),
  component: OnboardCompanyPage,
});

const PLAN_DEFS = [
  { value: "starter", label: "Starter", price: "₹3,50,000", employees: "100", mills: "1", users: "10" },
  { value: "growth", label: "Growth", price: "₹7,50,000", employees: "300", mills: "3", users: "25" },
  { value: "business", label: "Business", price: "₹15,00,000", employees: "600", mills: "10", users: "50" },
  { value: "enterprise", label: "Enterprise", price: "₹28,00,000", employees: "1500", mills: "Unlimited", users: "100" },
  { value: "custom", label: "Custom", price: "Custom", employees: "Custom", mills: "Unlimited", users: "Custom" },
];

const ALL_MODULES = [
  { key: "production", label: "Production", category: "core" },
  { key: "quality", label: "Quality Control", category: "core" },
  { key: "maintenance", label: "Maintenance", category: "core" },
  { key: "hr", label: "Human Resources", category: "core" },
  { key: "payroll", label: "Payroll", category: "core" },
  { key: "purchase", label: "Cotton Purchase", category: "core" },
  { key: "stores", label: "Stores & Spares", category: "core" },
  { key: "inventory", label: "Inventory", category: "core" },
  { key: "dispatch", label: "Dispatch", category: "core" },
  { key: "accounts", label: "Accounts", category: "core" },
  { key: "sales", label: "Sales", category: "core" },
  { key: "reports", label: "Reports", category: "core" },
  { key: "stock", label: "Stock", category: "core" },
  { key: "lotrac", label: "LoTrac — Sack Tracking", category: "addon" },
  { key: "whatsapp", label: "WhatsApp Alerts", category: "addon" },
  { key: "lc_tracking", label: "LC Tracking", category: "addon" },
  { key: "analytics", label: "Advanced Analytics", category: "addon" },
  { key: "uploads", label: "Uploads", category: "addon" },
];

const CORE_MODULES = ALL_MODULES.filter(m => m.category === "core").map(m => m.key);
const STEP_ICONS = [Building2, Files, CreditCard, Puzzle, User, ClipboardList];
const STEP_LABELS = ["Company", "Mills", "Plan", "Modules", "Owner", "Review"];

function generatePassword() {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  let pw = "";
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 8; i++) pw += all[Math.floor(Math.random() * all.length)];
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

function generateCodeFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "company";
}

function OnboardCompanyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [mills, setMills] = useState<{ name: string; code: string; city: string; state: string }[]>([
    { name: "", code: "", city: "", state: "" },
  ]);

  const [planCode, setPlanCode] = useState("starter");
  const [selectedModules, setSelectedModules] = useState<string[]>(CORE_MODULES);

  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState(generatePassword());

  const isCustom = planCode === "custom";
  const planDef = PLAN_DEFS.find(p => p.value === planCode) || PLAN_DEFS[0];

  function toggleModule(key: string) {
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function updateMill(index: number, field: string, value: string) {
    const updated = [...mills];
    (updated[index] as any)[field] = value;
    if (field === "name") {
      (updated[index] as any).code = generateCodeFromName(value);
    }
    setMills(updated);
  }

  function addMill() {
    setMills([...mills, { name: "", code: "", city: "", state: "" }]);
  }

  function removeMill(index: number) {
    if (mills.length > 1) setMills(mills.filter((_, i) => i !== index));
  }

  const onboardMutation = useMutation({
    mutationFn: () =>
      api.post("/admin/onboarding", {
        company_name: companyName,
        company_code: companyCode,
        gstin: gstin || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        plan_code: planCode,
        mills: mills.map(m => ({
          name: m.name,
          code: m.code,
          city: m.city || undefined,
          state: m.state || undefined,
        })),
        owner: {
          full_name: ownerName,
          email: ownerEmail,
          password: ownerPassword,
        },
        modules: isCustom ? selectedModules : undefined,
      }).then(r => r.data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["masters", "companies"] });
      toast.success(`Company "${result.company_name}" onboarded successfully`);
      navigate({ to: "/admin/companies/$companyId", params: { companyId: result.company_id } });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Onboarding failed");
    },
  });

  function canProceed(): boolean {
    switch (step) {
      case 0: return companyName.trim().length > 0 && companyCode.trim().length > 0;
      case 1: return mills.every(m => m.name.trim().length > 0 && m.code.trim().length > 0);
      case 2: return true;
      case 3: return selectedModules.length > 0;
      case 4: return ownerName.trim().length > 0 && ownerEmail.trim().length > 0 && ownerPassword.length >= 8;
      default: return true;
    }
  }

  function next() { if (canProceed()) setStep(s => Math.min(s + 1, 5)); }

  function prev() { setStep(s => Math.max(s - 1, 0)); }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link to="/admin/companies" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> Back to Companies
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-[#0d9488]" />
          Onboard New Company
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {STEP_LABELS.map((label, i) => {
          const Icon = STEP_ICONS[i];
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                    ${isDone ? "bg-[#0d9488] text-white" : isActive ? "bg-[#0d9488]/10 text-[#0d9488] border-2 border-[#0d9488]" : "bg-gray-100 text-gray-400"}
                  `}
                >
                  {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-xs mt-1 hidden sm:block ${isActive ? "text-[#0d9488] font-medium" : "text-gray-400"}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`h-px w-12 sm:w-20 mx-2 ${i < step ? "bg-[#0d9488]" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 1: Company Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Company Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label>Company Name *</Label>
                  <Input
                    value={companyName}
                    onChange={e => { setCompanyName(e.target.value); if (!companyCode || companyCode === generateCodeFromName(companyName)) setCompanyCode(generateCodeFromName(e.target.value)); }}
                    placeholder="My Mill Pvt Ltd"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>Company Code *</Label>
                  <Input
                    value={companyCode}
                    onChange={e => setCompanyCode(generateCodeFromName(e.target.value))}
                    placeholder="my_mill"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>GSTIN</Label>
                  <Input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="col-span-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="info@mymill.com" type="email" />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address" rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Mills */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Mills</h2>
                <Badge variant="outline">{mills.length} mill{mills.length > 1 ? "s" : ""}</Badge>
              </div>
              {mills.map((mill, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Mill #{i + 1}</span>
                    {mills.length > 1 && (
                      <button onClick={() => removeMill(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Mill Name *</Label>
                      <Input value={mill.name} onChange={e => updateMill(i, "name", e.target.value)} placeholder="Main Mill" />
                    </div>
                    <div>
                      <Label>Mill Code *</Label>
                      <Input value={mill.code} onChange={e => updateMill(i, "code", e.target.value)} placeholder="main_mill" />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input value={mill.city} onChange={e => updateMill(i, "city", e.target.value)} placeholder="Coimbatore" />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input value={mill.state} onChange={e => updateMill(i, "state", e.target.value)} placeholder="Tamil Nadu" />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addMill} className="w-full">
                + Add Another Mill
              </Button>
            </div>
          )}

          {/* Step 3: Plan */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Subscription Plan</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PLAN_DEFS.map(p => (
                  <div
                    key={p.value}
                    onClick={() => setPlanCode(p.value)}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md
                      ${planCode === p.value ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-200"}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">{p.label}</h3>
                      {planCode === p.value && <Check className="w-4 h-4 text-[#0d9488]" />}
                    </div>
                    <p className="text-lg font-bold text-[#0d9488]">{p.price}</p>
                    <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                      <p>Up to {p.employees} employees</p>
                      <p>{p.mills === "Unlimited" ? "Unlimited" : `Up to ${p.mills}`} mills</p>
                      <p>{p.users === "Custom" ? "Custom" : `Up to ${p.users}`} users</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Modules */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Module Package</h2>
                {isCustom && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                    Custom selection
                  </Badge>
                )}
              </div>
              {!isCustom && (
                <p className="text-sm text-muted-foreground">
                  Modules are auto-assigned for the <strong>{planDef.label}</strong> plan.
                  {planCode === "starter" && " Core modules with basic add-ons included."}
                  {planCode === "growth" && " All core + selected add-on modules included."}
                  {planCode === "business" && " All core + add-on modules included."}
                  {planCode === "enterprise" && " All modules included with priority support."}
                </p>
              )}

              {isCustom && (
                <div>
                  <h3 className="text-sm font-medium mb-2 text-muted-foreground">Core Modules</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                    {ALL_MODULES.filter(m => m.category === "core").map(m => (
                      <label key={m.key} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selectedModules.includes(m.key)} onChange={() => toggleModule(m.key)} className="rounded" />
                        <span className="text-sm">{m.label}</span>
                      </label>
                    ))}
                  </div>
                  <h3 className="text-sm font-medium mb-2 text-muted-foreground">Add-on Modules</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ALL_MODULES.filter(m => m.category === "addon").map(m => (
                      <label key={m.key} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selectedModules.includes(m.key)} onChange={() => toggleModule(m.key)} className="rounded" />
                        <span className="text-sm">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Owner */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Mill Owner Account</h2>
              <p className="text-sm text-muted-foreground">This user will be created as MILL_OWNER for the company.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label>Full Name *</Label>
                  <Input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Ramesh Kumar" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>Email *</Label>
                  <Input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="ramesh@mymill.com" type="email" />
                </div>
                <div className="col-span-2">
                  <Label>Password *</Label>
                  <div className="flex gap-2">
                    <Input value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} type="text" className="font-mono" />
                    <Button variant="outline" size="sm" onClick={() => setOwnerPassword(generatePassword())} type="button">
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Min 8 characters. User will be asked to change on first login.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Review & Create</h2>
              <div className="space-y-3 text-sm">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-[#0d9488] mb-2">Company</h3>
                  <p><span className="text-muted-foreground">Name:</span> {companyName}</p>
                  <p><span className="text-muted-foreground">Code:</span> {companyCode}</p>
                  {gstin && <p><span className="text-muted-foreground">GSTIN:</span> {gstin}</p>}
                  {phone && <p><span className="text-muted-foreground">Phone:</span> {phone}</p>}
                  {email && <p><span className="text-muted-foreground">Email:</span> {email}</p>}
                  {address && <p><span className="text-muted-foreground">Address:</span> {address}</p>}
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-[#0d9488] mb-2">Mills ({mills.length})</h3>
                  {mills.map((m, i) => (
                    <p key={i}>{m.name} ({m.code}){m.city ? ` — ${m.city}` : ""}{m.state ? `, ${m.state}` : ""}</p>
                  ))}
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-[#0d9488] mb-2">Plan: {planDef.label}</h3>
                  <p>{planDef.price} — {planDef.employees} employees, {planDef.mills} mills, {planDef.users} users</p>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-[#0d9488] mb-2">Modules ({selectedModules.length})</h3>
                  <div className="flex flex-wrap gap-1">
                    {selectedModules.map(m => (
                      <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                    ))}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-[#0d9488] mb-2">Owner</h3>
                  <p><span className="text-muted-foreground">Name:</span> {ownerName}</p>
                  <p><span className="text-muted-foreground">Email:</span> {ownerEmail}</p>
                  <p><span className="text-muted-foreground">Password:</span> <span className="font-mono">{ownerPassword}</span></p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" onClick={prev} disabled={step === 0}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {step < 5 ? (
          <Button onClick={next} disabled={!canProceed()}>
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={() => onboardMutation.mutate()}
            disabled={onboardMutation.isPending}
            className="bg-[#0d9488] hover:bg-[#0d9488]/90"
          >
            {onboardMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              <><Check className="w-4 h-4 mr-2" /> Create Company</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
