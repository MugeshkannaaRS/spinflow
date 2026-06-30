import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Users,
  Factory,
  Package,
  Truck,
  Settings2,
  ClipboardList,
  Warehouse,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { DirectImportModal } from "@/components/ui/DirectImportModal";

export const Route = createFileRoute("/_app/import-hub")({
  head: () => ({ meta: [{ title: "Data Import Hub — SpinFlow ERP" }] }),
  component: ImportHubPage,
});

interface ImportModuleConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  tableName: string;
  endpoint: string;
  ready: boolean;
}

const IMPORT_MODULES: ImportModuleConfig[] = [
  {
    key: "employees",
    label: "Employees",
    icon: Users,
    desc: "Import your workforce with employee details, departments, and designations.",
    tableName: "hr_employees",
    endpoint: "/hr/employees/bulk",
    ready: true,
  },
  {
    key: "machines",
    label: "Machines",
    icon: Factory,
    desc: "Register machines with types, specifications, and mill assignment.",
    tableName: "masters_machines",
    endpoint: "/masters/machines/bulk",
    ready: true,
  },
  {
    key: "customers",
    label: "Customers",
    icon: Truck,
    desc: "Import customer records for dispatch and sales order processing.",
    tableName: "masters_customers",
    endpoint: "/masters/customers/bulk",
    ready: true,
  },
  {
    key: "departments",
    label: "Departments",
    icon: Settings2,
    desc: "Import department master data for organizational structure.",
    tableName: "masters_departments",
    endpoint: "/masters/departments/bulk",
    ready: false,
  },
  {
    key: "suppliers",
    label: "Suppliers",
    icon: Warehouse,
    desc: "Import supplier records for purchase order processing.",
    tableName: "masters_suppliers",
    endpoint: "/masters/suppliers/bulk",
    ready: false,
  },
  {
    key: "inventory_items",
    label: "Inventory Items",
    icon: Package,
    desc: "Import inventory items with stock levels and minimum thresholds.",
    tableName: "inventory_items",
    endpoint: "/inventory/items/bulk",
    ready: false,
  },
  {
    key: "cotton_purchases",
    label: "Cotton Purchases",
    icon: ClipboardList,
    desc: "Import cotton purchase records with bale details.",
    tableName: "purchase_cotton",
    endpoint: "/purchase/cotton/bulk",
    ready: false,
  },
  {
    key: "yarn_counts",
    label: "Yarn Counts",
    icon: Settings2,
    desc: "Import master data: yarn counts and reference data.",
    tableName: "masters_yarn_counts",
    endpoint: "/masters/yarn-counts/bulk",
    ready: false,
  },
];

function ImportHubPage() {
  const [activeModule, setActiveModule] = useState<ImportModuleConfig | null>(null);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Data Import Hub</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bulk import your data — preview, validate, and import with rollback support
        </p>
      </div>

      {/* Quick start */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 flex items-start gap-3">
          <Download className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Getting Started</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Click any module below to open the import wizard. Upload a CSV/XLSX file, map columns,
              preview, and import. All imports support validation and rollback.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Import cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {IMPORT_MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.key} className={`transition-shadow ${m.ready ? "hover:shadow-sm" : "opacity-60"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">{m.label}</CardTitle>
                    {!m.ready && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Soon
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{m.desc}</p>
                {m.ready ? (
                  <button
                    onClick={() => setActiveModule(m)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-gray-100 text-gray-400 cursor-not-allowed">
                    <Upload className="w-3.5 h-3.5" />
                    Import
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeModule && (
        <DirectImportModal
          isOpen={true}
          tableName={activeModule.tableName}
          endpoint={activeModule.endpoint}
          title={`Import ${activeModule.label}`}
          onClose={() => setActiveModule(null)}
        />
      )}
    </div>
  );
}
