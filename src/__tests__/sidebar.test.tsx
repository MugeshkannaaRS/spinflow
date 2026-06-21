import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/stores/auth";

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(() => Promise.resolve({ data: { active: 0, critical: 0 } })),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mockApiGet },
}));

vi.mock("@/stores/auth", () => ({
  useAuth: vi.fn(() => ({
    user: {
      name: "Test User",
      role: "MILL_OWNER",
      millName: "Test Mill",
      allowedModules: undefined,
      millId: "mill-1",
    },
    logout: vi.fn(),
    activeMill: { id: "mill-1", name: "Test Mill" },
    setActiveMill: vi.fn(),
  })),
}));

vi.mock("@/hooks/useActiveMill", () => ({
  useActiveMill: vi.fn(() => ({
    millId: "mill-1",
    millName: "Test Mill",
    mills: [{ id: "mill-1", name: "Test Mill" }],
    hasMultipleMills: false,
    activeMill: { id: "mill-1", name: "Test Mill" },
  })),
}));

vi.mock("@/hooks/useRBAC", () => ({
  useRBAC: vi.fn(() => {
    const role = vi.mocked(useAuth)().user?.role ?? "";
    const isSuperAdmin = role === "SUPER_ADMIN";
    return {
      canAccess: (module: string) => {
        if (isSuperAdmin) return ["admin", "dashboard", "column_config", "alerts"].includes(module);
        return !["admin", "column_config"].includes(module);
      },
      isSuperAdmin,
      isDashboardOnly: () => false,
      companyModulesLoaded: true,
    };
  }),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(() => ({
    theme: "light",
    toggle: vi.fn(),
  })),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, onClick, className }: any) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: vi.fn((opts?: { select: (s: any) => any }) => {
    const state = { location: { pathname: "/dashboard" } };
    return opts?.select ? opts.select(state) : state;
  }),
}));

vi.mock("@/lib/rbac", () => ({
  MODULE_ACCESS: {
    MILL_OWNER: [
      "dashboard",
      "production",
      "quality",
      "maintenance",
      "hr",
      "payroll",
      "purchase",
      "stores",
      "inventory",
      "dispatch",
      "lotrac",
      "accounts",
      "sales",
      "masters",
      "users",
      "audit",
    ],
    SUPER_ADMIN: [
      "dashboard",
      "production",
      "quality",
      "maintenance",
      "hr",
      "payroll",
      "purchase",
      "stores",
      "inventory",
      "dispatch",
      "lotrac",
      "accounts",
      "sales",
      "masters",
      "users",
      "audit",
      "admin",
    ],
  },
  ROLE_LABELS: { MILL_OWNER: "Mill Owner", SUPER_ADMIN: "Super Admin" },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div data-testid="tooltip-wrapper">{children}</div>,
  TooltipContent: ({ children }: any) => <div data-testid="tooltip-content">{children}</div>,
  TooltipProvider: ({ children }: any) => <div data-testid="tooltip-provider">{children}</div>,
  TooltipTrigger: ({ children, asChild }: any) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders SpinFlow logo when expanded", () => {
    renderWithQuery(<Sidebar />);
    expect(screen.getByText("SpinFlow ERP")).toBeTruthy();
  });

  it("renders SF monogram when collapsed", () => {
    localStorage.setItem("spinflow_sidebar_collapsed", "true");
    renderWithQuery(<Sidebar />);
    expect(screen.getByText("S")).toBeTruthy();
  });

  it("collapsed state persists in localStorage", () => {
    localStorage.setItem("spinflow_sidebar_collapsed", "true");
    renderWithQuery(<Sidebar />);
    expect(screen.getByText("S")).toBeTruthy();
  });

  it("shows Dashboard navigation link", () => {
    renderWithQuery(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });
});

describe("Sidebar - SUPER_ADMIN visibility", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockImplementation(() => ({
      user: {
        name: "Admin User",
        role: "SUPER_ADMIN",
        millName: "Test Mill",
        allowedModules: [
          "dashboard",
          "production",
          "quality",
          "maintenance",
          "hr",
          "payroll",
          "purchase",
          "stores",
          "inventory",
          "dispatch",
          "lotrac",
          "accounts",
          "sales",
          "masters",
          "users",
          "audit",
          "admin",
        ],
      },
      logout: vi.fn(),
      activeMill: { id: "mill-1", name: "Test Mill" },
      setActiveMill: vi.fn(),
    }));
  });

  it("SUPER_ADMIN sees Admin Panel link", () => {
    renderWithQuery(<Sidebar />);
    expect(screen.getByText("Admin Panel")).toBeTruthy();
  });

  it("SUPER_ADMIN sees Column Config link", async () => {
    renderWithQuery(<Sidebar />);
    await screen.findByText("Admin Panel");
    await userEvent.click(screen.getByText("Admin Panel"));
    expect(screen.getByText("Column Config")).toBeTruthy();
  });
});

describe("Sidebar - MILL_OWNER visibility", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockImplementation(() => ({
      user: {
        name: "Mill Owner",
        role: "MILL_OWNER",
        millName: "Test Mill",
        allowedModules: [
          "dashboard",
          "production",
          "quality",
          "maintenance",
          "hr",
          "payroll",
          "purchase",
          "stores",
          "inventory",
          "dispatch",
          "lotrac",
          "accounts",
          "sales",
          "masters",
          "users",
          "audit",
        ],
      },
      logout: vi.fn(),
      activeMill: { id: "mill-1", name: "Test Mill" },
      setActiveMill: vi.fn(),
    }));
  });

  it("MILL_OWNER does not see Admin Panel", () => {
    renderWithQuery(<Sidebar />);
    expect(screen.queryByText("Admin Panel")).toBeNull();
  });

  it("MILL_OWNER does not see Column Config", () => {
    renderWithQuery(<Sidebar />);
    expect(screen.queryByText("Column Config")).toBeNull();
  });
});
