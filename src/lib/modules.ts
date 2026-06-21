export const MODULE_GROUPS = [
  {
    label: "Core",
    modules: [
      "production",
      "quality",
      "inventory",
      "dispatch",
      "purchase",
      "stores",
      "hr",
      "accounts",
      "maintenance",
    ],
  },
  {
    label: "Add-ons",
    modules: [
      "payroll",
      "sales",
      "lotrac",
      "reports",
      "stock",
      "uploads",
      "analytics",
      "whatsapp",
      "lc_tracking",
    ],
  },
  { label: "System", modules: ["dashboard", "audit", "users", "masters"] },
];

export const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

export const MODULE_LABELS: Record<string, string> = {
  production: "Production",
  quality: "Quality",
  inventory: "Inventory",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  accounts: "Accounts",
  maintenance: "Maintenance",
  payroll: "Payroll",
  sales: "Sales",
  lotrac: "LoTrac",
  reports: "Reports",
  stock: "Stock",
  uploads: "Uploads",
  analytics: "Analytics",
  whatsapp: "WhatsApp",
  lc_tracking: "LC Track",
  dashboard: "Dashboard",
  audit: "Audit",
  users: "Users",
  masters: "Masters",
};
