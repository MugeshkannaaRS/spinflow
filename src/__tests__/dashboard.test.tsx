import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/stores/auth", () => ({
  useAuth: vi.fn(() => ({
    user: {
      name: "Test User",
      role: "MILL_OWNER",
      millName: "Test Mill",
      millId: "mill-1",
    },
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

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(() => ({ theme: "light", toggle: vi.fn() })),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(() => ({ unreadCount: 0, notifications: [], markAllRead: vi.fn() })),
}));

const mockDashboardData = {
  role: "MILL_OWNER",
  mill_name: "Test Mill",
  company_name: "Test Company",
  as_of: "2026-06-22T03:00:00Z",
  production: {
    today_output_kg: 12500,
    today_target_kg: 15000,
    efficiency_pct: 83.3,
    waste_pct: 3.2,
    last_7_days: [
      { date: "2026-06-15", output_kg: 12000, target_kg: 15000 },
      { date: "2026-06-16", output_kg: 13000, target_kg: 15000 },
      { date: "2026-06-17", output_kg: 11000, target_kg: 15000 },
    ],
  },
  attendance: {
    today_present: 85,
    today_absent: 5,
    today_total: 90,
    present_pct: 94.4,
    by_department: [
      { department: "Spinning", present: 30, absent: 1 },
      { department: "Weaving", present: 25, absent: 2 },
    ],
  },
  machines: { total: 20, active: 18, down: 1, maintenance: 1 },
  finance: {
    monthly_revenue: 2500000,
    monthly_purchases: 1800000,
    outstanding: 450000,
    overdue_count: 2,
    revenue_trend: [
      { month: "Jan", revenue: 2000000, purchases: 1500000 },
      { month: "Feb", revenue: 2200000, purchases: 1600000 },
    ],
  },
  inventory: {
    total_items: 150,
    low_stock_count: 3,
    low_stock_items: [
      { name: "Cotton Yarn", current: 50, reorder_level: 100, unit: "kg" },
    ],
  },
  dispatch: { today_trips: 8, today_sacks: 240, pending_deliveries: 2, delivered_today: 6 },
  quality: { tests_today: 12, pass_rate_pct: 95.5, pending_approvals: 1, defect_rate_pct: 2.1 },
  alerts: [
    { type: "error", message: "Machine 4 down", module: "maintenance" },
    { type: "warning", message: "Stock low", module: "inventory" },
  ],
  pending_actions: [
    { label: "Payroll approval pending", count: 3, route: "/payroll" },
  ],
  schedule: { current_shift: "A", shift_start: "06:00", shift_end: "14:00" },
};

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(() => Promise.resolve({ data: mockDashboardData })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mockApiGet,
  },
}));

vi.mock("@/components/layout/Topbar", () => ({
  Topbar: ({ title, subtitle }: any) => (
    <div data-testid="topbar">
      <span>{title}</span>
      {subtitle && <span>{subtitle}</span>}
    </div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  createFileRoute: () => (opts: any) => ({
    head: opts.head,
    component: opts.component,
  }),
  Outlet: () => null,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  Legend: () => null,
}));

import { Route } from "@/routes/_app.dashboard";
const Dashboard = Route.component;

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders KPI stat cards", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Today's Production")).toBeTruthy();
    expect(await screen.findByText("Waste %")).toBeTruthy();
    expect(await screen.findByText("Attendance")).toBeTruthy();
    expect(await screen.findByText("Active Machines")).toBeTruthy();
    expect(await screen.findByText("Monthly Revenue")).toBeTruthy();
    expect(await screen.findByText("Outstanding")).toBeTruthy();
  });

  it("shows live alerts when alerts exist", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Live Alerts")).toBeTruthy();
    expect(screen.getByText("Machine 4 down")).toBeTruthy();
    expect(screen.getByText("Stock low")).toBeTruthy();
  });

  it("renders production vs target chart", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText(/Production vs Target/)).toBeTruthy();
  });

  it("renders department attendance chart", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText(/Department Attendance Today/)).toBeTruthy();
  });

  it("renders Pending Actions panel", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Pending Actions")).toBeTruthy();
  });

  it("renders Today's Schedule panel", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Today's Schedule")).toBeTruthy();
  });

  it("shows revenue trend chart when finance data exists", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText(/Revenue & Purchases/)).toBeTruthy();
  });

  it("renders Low Stock Alert section when low stock exists", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Low Stock Alert")).toBeTruthy();
  });
});
