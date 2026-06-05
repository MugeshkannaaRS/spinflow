import { useAuth } from "@/stores/auth"

const ROUTE_TO_MODULE: Record<string, string> = {
  "/production":  "production",
  "/quality":     "quality",
  "/maintenance": "maintenance",
  "/hr":          "hr",
  "/payroll":     "payroll",
  "/purchase":    "purchase",
  "/stores":      "stores",
  "/inventory":   "inventory",
  "/dispatch":    "dispatch",
  "/lotrac":      "lotrac",
  "/accounts":    "accounts",
  "/sales":       "sales",
  "/stock":       "stock",
  "/reports":     "reports",
  "/masters":     "masters",
  "/users":       "users",
  "/audit":       "audit",
}

const ALWAYS_ON = new Set(["dashboard", "masters", "users"])
const SA_ROLES  = new Set(["SUPER_ADMIN"])

export function useModuleAccess() {
  const { user } = useAuth()

  function canAccess(module: string): boolean {
    if (!user) return false
    if (SA_ROLES.has(user.role)) return true
    if (ALWAYS_ON.has(module)) return true
    const mods = user.allowedModules ?? []
    if (mods.includes("all")) return true
    return mods.includes(module)
  }

  function canAccessRoute(path: string): boolean {
    const entry = Object.entries(ROUTE_TO_MODULE)
      .find(([route]) => path === route || path.startsWith(route + "/"))
    if (!entry) return true
    return canAccess(entry[1])
  }

  return { canAccess, canAccessRoute }
}
