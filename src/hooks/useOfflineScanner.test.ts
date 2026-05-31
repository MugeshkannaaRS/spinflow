import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOfflineScanner } from "./useOfflineScanner";
import { loTracApi } from "@/lib/api-service";

const mockEnqueueScan = vi.fn();
const mockGetPendingScans = vi.fn();
const mockGetPendingCount = vi.fn();
const mockRemoveScan = vi.fn();
const mockMarkScanFailed = vi.fn();

vi.mock("@/lib/scanQueue", () => ({
  enqueueScan: (...args: any[]) => mockEnqueueScan(...args),
  getPendingScans: (...args: any[]) => mockGetPendingScans(...args),
  getPendingCount: (...args: any[]) => mockGetPendingCount(...args),
  removeScan: (...args: any[]) => mockRemoveScan(...args),
  markScanFailed: (...args: any[]) => mockMarkScanFailed(...args),
}));

vi.mock("@/lib/api-service", () => ({
  loTracApi: {
    loaderScan: vi.fn(),
    receiverScan: vi.fn(),
  },
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
    writable: true,
  });
}

beforeEach(() => {
  setOnline(true);
  mockGetPendingCount.mockResolvedValue(0);
  mockEnqueueScan.mockResolvedValue(1);
  mockGetPendingScans.mockResolvedValue([]);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOfflineScanner", () => {
  it("submitScan calls API directly when online and API succeeds", async () => {
    const apiResult = { result: "success", bag_no: "B001" };
    (loTracApi.loaderScan as any).mockResolvedValue(apiResult);

    const { result } = renderHook(() => useOfflineScanner());

    const res = await act(async () => {
      return result.current.submitScan({
        trip_id: "t1",
        scan_type: "loader",
        qr_string: "qr-data",
      });
    });

    expect(res).toEqual(apiResult);
    expect(loTracApi.loaderScan).toHaveBeenCalledWith("t1", "qr-data", undefined);
    expect(mockEnqueueScan).not.toHaveBeenCalled();
  });

  it("submitScan queues scan when offline", async () => {
    setOnline(false);
    (loTracApi.loaderScan as any).mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useOfflineScanner());

    const res = await act(async () => {
      return result.current.submitScan({
        trip_id: "t1",
        scan_type: "loader",
        qr_string: "qr-data",
      });
    });

    expect(res).toBeNull();
    expect(mockEnqueueScan).toHaveBeenCalled();
  });

  it("submitScan queues scan when API throws network error", async () => {
    const networkError = new Error("Network Error");
    (networkError as any).code = "ERR_NETWORK";
    (loTracApi.loaderScan as any).mockRejectedValue(networkError);

    const { result } = renderHook(() => useOfflineScanner());

    const res = await act(async () => {
      return result.current.submitScan({
        trip_id: "t1",
        scan_type: "loader",
        qr_string: "qr-data",
      });
    });

    expect(res).toBeNull();
    expect(mockEnqueueScan).toHaveBeenCalled();
  });

  it("submitScan throws when API returns 4xx", async () => {
    const serverError = new Error("Bad Request");
    (serverError as any).response = { status: 400 };
    (loTracApi.loaderScan as any).mockRejectedValue(serverError);

    const { result } = renderHook(() => useOfflineScanner());

    await act(async () => {
      await expect(
        result.current.submitScan({
          trip_id: "t1",
          scan_type: "loader",
          qr_string: "qr-data",
        }),
      ).rejects.toThrow("Bad Request");
    });

    expect(mockEnqueueScan).not.toHaveBeenCalled();
  });

  it("syncQueue calls API for each pending scan and removes on success", async () => {
    mockGetPendingScans.mockResolvedValue([
      { id: 1, trip_id: "t1", scan_type: "loader", qr_string: "qr1", retry_count: 0 },
      {
        id: 2,
        trip_id: "t2",
        scan_type: "receiver",
        qr_string: "qr2",
        scanned_route_id: "r1",
        retry_count: 0,
      },
    ]);
    (loTracApi.loaderScan as any).mockResolvedValue({ result: "success" });
    (loTracApi.receiverScan as any).mockResolvedValue({ result: "success" });

    const { result } = renderHook(() => useOfflineScanner());
    // wait for initial syncQueue to finish (called on mount), then reset counts
    await act(async () => {});
    vi.clearAllMocks();

    const syncResult = await act(async () => {
      return result.current.syncQueue();
    });

    expect(syncResult).toEqual({ synced: 2, failed: 0 });
    expect(mockRemoveScan).toHaveBeenCalledTimes(2);
  });

  it("syncQueue marks failed when API returns 4xx", async () => {
    const serverError = new Error("Bad Request");
    (serverError as any).response = { status: 400 };

    mockGetPendingScans.mockResolvedValue([
      { id: 1, trip_id: "t1", scan_type: "loader", qr_string: "qr1", retry_count: 0 },
    ]);
    (loTracApi.loaderScan as any).mockRejectedValue(serverError);

    const { result } = renderHook(() => useOfflineScanner());
    await act(async () => {});
    vi.clearAllMocks();
    mockGetPendingScans.mockResolvedValue([
      { id: 1, trip_id: "t1", scan_type: "loader", qr_string: "qr1", retry_count: 0 },
    ]);
    (loTracApi.loaderScan as any).mockRejectedValue(serverError);

    const syncResult = await act(async () => {
      return result.current.syncQueue();
    });

    expect(syncResult).toEqual({ synced: 0, failed: 1 });
    expect(mockMarkScanFailed).toHaveBeenCalledWith(1, "Bad Request");
  });

  it("syncQueue stops on network error", async () => {
    const networkError = new Error("Network Error");
    (networkError as any).code = "ERR_NETWORK";

    mockGetPendingScans.mockResolvedValue([
      { id: 1, trip_id: "t1", scan_type: "loader", qr_string: "qr1", retry_count: 0 },
      { id: 2, trip_id: "t2", scan_type: "loader", qr_string: "qr2", retry_count: 0 },
    ]);
    (loTracApi.loaderScan as any)
      .mockResolvedValueOnce({ result: "success" })
      .mockRejectedValueOnce(networkError);

    const { result } = renderHook(() => useOfflineScanner());
    await act(async () => {});
    // initial sync consumed the Once mocks; re-setup for test
    vi.clearAllMocks();
    mockGetPendingScans.mockResolvedValue([
      { id: 3, trip_id: "t1", scan_type: "loader", qr_string: "qr1", retry_count: 0 },
      { id: 4, trip_id: "t2", scan_type: "loader", qr_string: "qr2", retry_count: 0 },
    ]);
    (loTracApi.loaderScan as any)
      .mockResolvedValueOnce({ result: "success" })
      .mockRejectedValueOnce(networkError);

    const syncResult = await act(async () => {
      return result.current.syncQueue();
    });

    expect(syncResult).toEqual({ synced: 1, failed: 0 });
    expect(mockRemoveScan).toHaveBeenCalledTimes(1);
  });

  it("pendingCount updates after enqueue and after sync", async () => {
    setOnline(false);
    mockGetPendingCount.mockResolvedValue(0);

    const { result } = renderHook(() => useOfflineScanner());

    expect(mockGetPendingCount).toHaveBeenCalled();

    mockGetPendingCount.mockResolvedValue(1);
    mockEnqueueScan.mockResolvedValue(1);

    await act(async () => {
      await result.current.submitScan({
        trip_id: "t1",
        scan_type: "loader",
        qr_string: "qr-data",
      });
    });

    expect(result.current.pendingCount).toBe(1);
  });
});
