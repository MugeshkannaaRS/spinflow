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

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
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

  it("renders 6 StatCards", async () => {
    renderWithQuery(<Dashboard />);
    expect(await screen.findByText("Today's Production")).toBeTruthy();
    expect(await screen.findByText("Waste %")).toBeTruthy();
    expect(await screen.findByText("Attendance")).toBeTruthy();
    expect(await screen.findByText("Active Machines")).toBeTruthy();
    expect(await screen.findByText("Monthly Revenue")).toBeTruthy();
    expect(await screen.findByText("Pending Payments")).toBeTruthy();
  });

  it("shows alert banner", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText(/Action Required/)).toBeTruthy();
  });

  it("renders production chart", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText(/Production vs Target/)).toBeTruthy();
  });

  it("renders attendance chart", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText(/Department Attendance/)).toBeTruthy();
  });

  it("renders Live Alerts panel", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText("Live Alerts")).toBeTruthy();
  });

  it("renders Pending Actions panel", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText("Pending Actions")).toBeTruthy();
  });

  it("renders Today's Schedule panel", () => {
    renderWithQuery(<Dashboard />);
    expect(screen.getByText("Today's Schedule")).toBeTruthy();
  });

  it("renders dismissal button on alert banner", () => {
    renderWithQuery(<Dashboard />);
    const allButtons = screen.getAllByRole("button");
    expect(allButtons.length).toBeGreaterThanOrEqual(1);
  });
});
