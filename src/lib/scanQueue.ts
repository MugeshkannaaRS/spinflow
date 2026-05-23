import Dexie, { type Table } from "dexie";

export interface PendingScan {
  id?: number;
  trip_id: string;
  scan_type: "loader" | "receiver";
  qr_string: string;
  scanned_route_id?: string;
  device_info?: string;
  created_at: string;
  retry_count: number;
  last_error?: string;
}

class ScanQueueDB extends Dexie {
  pendingScans!: Table<PendingScan, number>;

  constructor() {
    super("SpinFlowScanQueue");
    this.version(1).stores({
      pendingScans: "++id, trip_id, scan_type, created_at",
    });
  }
}

export const scanQueueDB = new ScanQueueDB();

export async function enqueueScan(
  scan: Omit<PendingScan, "id" | "retry_count">,
): Promise<number> {
  return scanQueueDB.pendingScans.add({ ...scan, retry_count: 0 });
}

export async function getPendingScans(): Promise<PendingScan[]> {
  return scanQueueDB.pendingScans.orderBy("id").toArray();
}

export async function removeScan(id: number): Promise<void> {
  await scanQueueDB.pendingScans.delete(id);
}

export async function markScanFailed(
  id: number,
  error: string,
): Promise<void> {
  const scan = await scanQueueDB.pendingScans.get(id);
  if (scan) {
    await scanQueueDB.pendingScans.update(id, {
      retry_count: (scan.retry_count || 0) + 1,
      last_error: error,
    });
  }
}

export async function getPendingCount(): Promise<number> {
  return scanQueueDB.pendingScans.count();
}
