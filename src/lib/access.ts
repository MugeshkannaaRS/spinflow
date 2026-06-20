/**
 * Centralized 3-layer permission system.
 *
 * Mirrors backend app/core/access.py exactly.
 *
 * LAYER 1 — Company Subscription (company_modules from API)
 * LAYER 2 — Role Capability      (ACCESS_MATRIX below)
 * LAYER 3 — User Module Assignment (module_restrictions from user profile)
 *
 * ACCESS = Layer1 AND Layer2 AND Layer3
 *
 * Every frontend permission check uses finalAccess() — no exceptions.
 */

export type AccessLevel = "none" | "read" | "write";

export interface AccessResult {
  granted: boolean;
  reason: string;
  level: AccessLevel;
}

// ── CANONICAL FRONTEND ACCESS MATRIX ─────────────────────────────────────────
// Must stay in sync with backend/app/core/rbac.py:ACCESS_MATRIX
const ACCESS_MATRIX: Record<string, Record<string, AccessLevel>> = {
  SUPER_ADMIN: {
    dashboard: "write",
    production: "write",
    quality: "write",
    inventory: "write",
    dispatch: "write",
    purchase: "write",
    stores: "write",
    hr: "write",
    accounts: "write",
    maintenance: "write",
    users: "write",
    audit: "write",
    reports: "write",
    masters: "write",
    stock: "write",
    sales: "write",
    lotrac: "write",
    payroll: "write",
    column_config: "write",
    whatsapp: "write",
    lc_tracking: "write",
    analytics: "write",
    uploads: "write",
    admin: "write",
    alerts: "write",
  },

  MILL_OWNER: {
    dashboard: "write",
    production: "write",
    quality: "write",
    inventory: "write",
    dispatch: "write",
    purchase: "write",
    stores: "write",
    hr: "write",
    accounts: "write",
    maintenance: "write",
    users: "write",
    audit: "write",
    reports: "write",
    masters: "write",
    stock: "write",
    sales: "write",
    lotrac: "write",
    payroll: "write",
    column_config: "write",
    whatsapp: "write",
    lc_tracking: "write",
    analytics: "write",
    uploads: "write",
    alerts: "write",
  },

  GENERAL_MANAGER: {
    dashboard: "write",
    production: "write",
    quality: "write",
    maintenance: "write",
    stores: "write",
    inventory: "write",
    dispatch: "write",
    purchase: "write",
    lotrac: "write",
    reports: "write",
    stock: "write",
    sales: "write",
    uploads: "write",
    analytics: "write",
    lc_tracking: "write",
    hr: "read",
    payroll: "read",
    accounts: "read",
    audit: "read",
    masters: "read",
    alerts: "write",
  },

  PRODUCTION_MANAGER: {
    dashboard: "write",
    production: "write",
    maintenance: "read",
    quality: "read",
    inventory: "read",
    stock: "read",
    reports: "write",
    uploads: "write",
    analytics: "write",
    alerts: "read",
  },

  QUALITY_MANAGER: {
    dashboard: "write",
    quality: "write",
    production: "read",
    inventory: "read",
    stock: "read",
    reports: "write",
    uploads: "write",
    alerts: "read",
  },

  DISPATCH_MANAGER: {
    dashboard: "write",
    dispatch: "write",
    lotrac: "write",
    stores: "write",
    inventory: "write",
    sales: "read",
    stock: "read",
    reports: "write",
    uploads: "write",
    alerts: "read",
  },

  STORE_MANAGER: {
    dashboard: "write",
    stores: "write",
    inventory: "write",
    purchase: "read",
    maintenance: "read",
    reports: "write",
    stock: "write",
    uploads: "write",
    alerts: "read",
  },

  HR_MANAGER: {
    dashboard: "write",
    hr: "write",
    payroll: "write",
    reports: "write",
    uploads: "write",
    alerts: "read",
  },

  ACCOUNTANT: {
    dashboard: "write",
    accounts: "write",
    payroll: "write",
    purchase: "read",
    dispatch: "read",
    sales: "read",
    reports: "write",
    lc_tracking: "write",
    uploads: "write",
    alerts: "read",
  },

  MAINTENANCE_MANAGER: {
    dashboard: "write",
    maintenance: "write",
    stores: "read",
    production: "read",
    reports: "write",
    uploads: "write",
    alerts: "read",
  },

  SUPERVISOR: {
    dashboard: "write",
    production: "write",
    reports: "write",
    alerts: "read",
  },

  MACHINE_OPERATOR: {
    dashboard: "write",
    production: "write",
    alerts: "read",
  },

  SECURITY_GATE: {
    dashboard: "write",
    dispatch: "read",
    lotrac: "write",
    alerts: "read",
  },

  AUDITOR: {
    dashboard: "write",
    production: "read",
    quality: "read",
    hr: "read",
    accounts: "read",
    reports: "write",
    audit: "write",
    inventory: "read",
    stores: "read",
    dispatch: "read",
    maintenance: "read",
    alerts: "read",
  },

  // OPERATOR is a general factory floor role — lighter than SUPERVISOR
  OPERATOR: {
    dashboard: "write",
    production: "write",
    quality: "read",
    stores: "read",
    reports: "read",
    alerts: "read",
  },
};

// Modules that bypass company subscription check
const SYSTEM_MODULES = new Set([
  "dashboard",
  "masters",
  "users",
  "column_config",
  "admin",
  "audit",
  "alerts",
]);

// Roles restricted to dashboard + profile + auth only
export const DASHBOARD_ONLY_ROLES = new Set(["MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR"]);

// Map DB module keys to canonical module names
const MODULE_KEY_MAP: Record<string, string> = {
  "cotton-purchase": "purchase",
  "column-config": "column_config",
};

function normaliseModule(module: string): string {
  return MODULE_KEY_MAP[module] ?? module.replace(/-/g, "_");
}

export interface AccessContext {
  role: string;
  isSuperAdmin: boolean;
  companyModules: Record<string, boolean> | null;
  moduleRestrictions: Record<string, boolean> | null;
}

function roleAccessLevel(role: string, module: string): AccessLevel {
  return ACCESS_MATRIX[role]?.[module] ?? "none";
}

/**
 * Three-layer permission check.
 *
 * @param ctx - Access context (role, company modules, restrictions)
 * @param module - Module name to check
 * @param write - If true, requires write access
 * @returns AccessResult
 */
export function finalAccess(
  ctx: AccessContext,
  module: string,
  write: boolean = false,
): AccessResult {
  const key = normaliseModule(module);

  // ── LAYER 2: Role capability ────────────────────────────────────────────
  const level = roleAccessLevel(ctx.role, key);
  if (level === "none") {
    return { granted: false, reason: `Role ${ctx.role} cannot access "${key}"`, level: "none" };
  }

  if (write && level !== "write") {
    return { granted: false, reason: `Write access denied for "${key}"`, level: "read" };
  }

  // ── LAYER 1: Company subscription ───────────────────────────────────────
  if (!ctx.isSuperAdmin && !SYSTEM_MODULES.has(key) && ctx.companyModules !== null) {
    if (ctx.companyModules[key] !== true) {
      return {
        granted: false,
        reason: `Module "${key}" not enabled for your company`,
        level: "none",
      };
    }
  }

  // ── LAYER 3: User module restrictions ───────────────────────────────────
  if (ctx.moduleRestrictions !== null && key in ctx.moduleRestrictions) {
    if (!ctx.moduleRestrictions[key]) {
      return { granted: false, reason: `Module "${key}" restricted for this user`, level: "none" };
    }
  }

  return { granted: true, reason: "ok", level };
}

/**
 * Build full AccessContext from user data, company modules, and restrictions.
 */
export function buildAccessContext(
  role: string,
  companyModules: Record<string, boolean> | null,
  moduleRestrictions: Record<string, boolean> | null,
): AccessContext {
  return {
    role,
    isSuperAdmin: role === "SUPER_ADMIN",
    companyModules,
    moduleRestrictions,
  };
}
