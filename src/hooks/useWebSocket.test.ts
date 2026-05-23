import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/stores/auth";

// Mock WebSocket
class MockWebSocket {
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState: number = 0;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
  }

  triggerOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  triggerClose(code: number = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

let mockWs: MockWebSocket | null = null;

vi.stubGlobal(
  "WebSocket",
  vi.fn((url: string) => {
    mockWs = new MockWebSocket(url);
    return mockWs;
  }),
);

function setToken(token: string | null) {
  useAuth.setState({
    token,
    user: token
      ? {
          id: "u1",
          name: "Test",
          email: "test@test.com",
          role: "SUPER_ADMIN",
          millId: "m1",
          millName: "Mill",
        }
      : null,
  });
}

beforeEach(() => {
  mockWs = null;
  setToken("test-token-123");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useWebSocket", () => {
  it("connects on mount with correct URL including token query param", () => {
    renderHook(() => useWebSocket());

    expect(WebSocket).toHaveBeenCalledTimes(1);
    const callUrl = (WebSocket as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callUrl).toContain("ws://");
    expect(callUrl).toContain("/ws?token=test-token-123");
  });

  it("closes connection on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    unmount();

    expect(mockWs?.close).toHaveBeenCalled();
  });

  it("parses incoming notification message and adds to notifications array", () => {
    const { result } = renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    act(() => {
      mockWs?.triggerMessage({
        type: "notification",
        payload: {
          id: "n1",
          title: "Test Notification",
          message: "This is a test",
          type: "info",
          module: "production",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe("Test Notification");
  });

  it("responds to ping with pong", () => {
    renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    act(() => {
      mockWs?.triggerMessage({ type: "ping", payload: {} });
    });

    expect(mockWs?.send).toHaveBeenCalledWith(JSON.stringify({ type: "pong" }));
  });

  it("unreadCount increments on new notification", () => {
    const { result } = renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    act(() => {
      mockWs?.triggerMessage({
        type: "notification",
        payload: {
          id: "n1",
          title: "First",
          message: "First notification",
          type: "info",
          module: "production",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      mockWs?.triggerMessage({
        type: "notification",
        payload: {
          id: "n2",
          title: "Second",
          message: "Second notification",
          type: "warning",
          module: "quality",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(result.current.unreadCount).toBe(2);
  });

  it("markAllRead sets unreadCount to 0", () => {
    const { result } = renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    act(() => {
      mockWs?.triggerMessage({
        type: "notification",
        payload: {
          id: "n1",
          title: "Test",
          message: "Test message",
          type: "info",
          module: "production",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it("does not reconnect on close code 4001", () => {
    const { result } = renderHook(() => useWebSocket());

    mockWs?.triggerOpen();

    act(() => {
      mockWs?.triggerClose(4001);
    });

    expect(result.current.isConnected).toBe(false);

    // Should not have created a new WebSocket
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });
});
