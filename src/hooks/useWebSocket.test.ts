import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/stores/auth";

// Mock WebSocket
let wsCloseSpy: (...args: any[]) => void;
let wsSendSpy: (...args: any[]) => void;

class MockWebSocket {
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState: number = 0;
  send: (...args: any[]) => void;
  close: (...args: any[]) => void;

  constructor(url: string) {
    this.url = url;
    this.send = (...args: any[]) => wsSendSpy(...args);
    this.close = (...args: any[]) => wsCloseSpy(...args);
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
let wsInstances: MockWebSocket[] = [];

function wsFactory(url: string) {
  const instance = new MockWebSocket(url);
  mockWs = instance;
  wsInstances.push(instance);
  return instance;
}

beforeEach(() => {
  mockWs = null;
  wsInstances = [];
  wsCloseSpy = vi.fn();
  wsSendSpy = vi.fn();
  (globalThis as any).WebSocket = wsFactory;
});

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

    expect(wsInstances).toHaveLength(1);
    const callUrl = wsInstances[0].url;
    expect(callUrl).toMatch(/ws[s]?:\/\//);
    expect(callUrl).toContain("?token=test-token-123");
  });

  it("closes connection on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket());

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    unmount();

    expect(wsCloseSpy).toHaveBeenCalled();
  });

  it("parses incoming notification message and adds to notifications array", () => {
    const { result } = renderHook(() => useWebSocket());

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    act(() => {
      wsInstances[0].triggerMessage({
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
    expect(result.current.notifications[0].title).toBe("notification");
  });

  it("responds to ping with pong", () => {
    renderHook(() => useWebSocket());

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    act(() => {
      wsInstances[0].triggerMessage({ type: "ping", payload: {} });
    });

    expect(wsSendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "pong" }));
  });

  it("unreadCount increments on new notification", () => {
    const { result } = renderHook(() => useWebSocket());

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    act(() => {
      wsInstances[0].triggerMessage({
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
      wsInstances[0].triggerMessage({
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

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    act(() => {
      wsInstances[0].triggerMessage({
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

    expect(wsInstances.length).toBe(1);
    wsInstances[0].triggerOpen();

    act(() => {
      wsInstances[0].triggerClose(4001);
    });

    expect(result.current.isConnected).toBe(false);
    expect(wsInstances.length).toBe(1);
  });
});
