import { describe, it, expect, beforeEach, vi } from "vitest";

const mockTable = {
  _data: [] as any[],
  _nextId: 1,
  add(item: any) {
    item.id = this._nextId++;
    this._data.push(item);
    return Promise.resolve(item.id);
  },
  get(id: number) {
    return Promise.resolve(this._data.find((d) => d.id === id) || null);
  },
  update(id: number, changes: any) {
    const item = this._data.find((d) => d.id === id);
    if (item) Object.assign(item, changes);
    return Promise.resolve();
  },
  delete(id: number) {
    this._data = this._data.filter((d) => d.id !== id);
    return Promise.resolve();
  },
  count() {
    return Promise.resolve(this._data.length);
  },
  orderBy() {
    return this;
  },
  toArray() {
    return Promise.resolve([...this._data].sort((a, b) => a.id - b.id));
  },
};

vi.mock("dexie", () => {
  const mockDexie = vi.fn();
  mockDexie.prototype.version = vi.fn().mockReturnThis();
  mockDexie.prototype.stores = vi.fn().mockReturnThis();
  return { default: mockDexie };
});

import {
  enqueueScan,
  getPendingScans,
  removeScan,
  markScanFailed,
  getPendingCount,
  scanQueueDB,
} from "./scanQueue";

beforeEach(() => {
  scanQueueDB.pendingScans = mockTable as any;
  mockTable._data = [];
  mockTable._nextId = 1;
});

describe("scanQueue", () => {
  it("enqueueScan adds a row and returns an id", async () => {
    const id = await enqueueScan({
      trip_id: "t1",
      scan_type: "loader",
      qr_string: "qr-data",
      created_at: new Date().toISOString(),
    });
    expect(id).toBe(1);
    expect(mockTable._data).toHaveLength(1);
  });

  it("getPendingCount returns correct count after enqueue", async () => {
    await enqueueScan({
      trip_id: "t1",
      scan_type: "loader",
      qr_string: "qr1",
      created_at: new Date().toISOString(),
    });
    await enqueueScan({
      trip_id: "t2",
      scan_type: "receiver",
      qr_string: "qr2",
      created_at: new Date().toISOString(),
    });
    const count = await getPendingCount();
    expect(count).toBe(2);
  });

  it("removeScan reduces count to 0", async () => {
    const id = await enqueueScan({
      trip_id: "t1",
      scan_type: "loader",
      qr_string: "qr1",
      created_at: new Date().toISOString(),
    });
    await removeScan(id);
    const count = await getPendingCount();
    expect(count).toBe(0);
  });

  it("markScanFailed increments retry_count and sets last_error", async () => {
    const id = await enqueueScan({
      trip_id: "t1",
      scan_type: "loader",
      qr_string: "qr1",
      created_at: new Date().toISOString(),
    });
    await markScanFailed(id, "Network error");
    const scan = await mockTable.get(id);
    expect(scan.retry_count).toBe(1);
    expect(scan.last_error).toBe("Network error");
  });

  it("getPendingScans returns rows in insertion order", async () => {
    await enqueueScan({
      trip_id: "t1",
      scan_type: "loader",
      qr_string: "first",
      created_at: new Date().toISOString(),
    });
    await enqueueScan({
      trip_id: "t2",
      scan_type: "receiver",
      qr_string: "second",
      created_at: new Date().toISOString(),
    });
    const scans = await getPendingScans();
    expect(scans).toHaveLength(2);
    expect(scans[0].qr_string).toBe("first");
    expect(scans[1].qr_string).toBe("second");
  });
});
