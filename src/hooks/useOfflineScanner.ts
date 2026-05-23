import { useState, useEffect, useCallback, useRef } from "react";
import { loTracApi } from "@/lib/api-service";
import {
  enqueueScan,
  getPendingScans,
  getPendingCount,
  removeScan,
  markScanFailed,
  type PendingScan,
} from "@/lib/scanQueue";

export interface ScanSubmitParams {
  trip_id: string;
  scan_type: "loader" | "receiver";
  qr_string: string;
  scanned_route_id?: string;
  device_info?: string;
}

export interface ScanResult {
  result: string;
  bag_no?: string;
  lot_no?: string;
  yarn_count?: string;
  weight_kg?: number;
  loaded_count?: number;
  planned_count?: number;
  trip_complete?: boolean;
  alert?: string;
  expected_route?: string;
  scanned_route?: string;
}

export function useOfflineScanner() {
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);
  const onlineRef = useRef(isOnline);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      onlineRef.current = true;
    };
    const goOffline = () => {
      setIsOnline(false);
      onlineRef.current = false;
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    if (window.navigator.onLine) {
      syncQueue();
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline]);

  const submitScan = useCallback(
    async (params: ScanSubmitParams): Promise<ScanResult | null> => {
      if (window.navigator.onLine) {
        try {
          let result: ScanResult;
          if (params.scan_type === "loader") {
            result = await loTracApi.loaderScan(
              params.trip_id,
              params.qr_string,
              params.device_info,
            );
          } else {
            result = await loTracApi.receiverScan(
              params.trip_id,
              params.qr_string,
              params.scanned_route_id,
              params.device_info,
            );
          }
          return result;
        } catch (e: any) {
          if (e.code === "ERR_NETWORK" || e.message?.includes("Network Error") || !e.response) {
            // network error — fall through to offline
          } else {
            throw e;
          }
        }
      }

      await enqueueScan({
        trip_id: params.trip_id,
        scan_type: params.scan_type,
        qr_string: params.qr_string,
        scanned_route_id: params.scanned_route_id,
        device_info: params.device_info,
        created_at: new Date().toISOString(),
      });
      await refreshPendingCount();
      return null;
    },
    [refreshPendingCount],
  );

  const syncQueue = useCallback(async (): Promise<{
    synced: number;
    failed: number;
  }> => {
    if (syncingRef.current || !window.navigator.onLine) {
      return { synced: 0, failed: 0 };
    }
    setIsSyncing(true);
    syncingRef.current = true;

    let synced = 0;
    let failed = 0;
    const scans = await getPendingScans();

    for (const scan of scans) {
      if (!window.navigator.onLine) break;

      try {
        if (scan.scan_type === "loader") {
          await loTracApi.loaderScan(scan.trip_id, scan.qr_string, scan.device_info);
        } else {
          await loTracApi.receiverScan(
            scan.trip_id,
            scan.qr_string,
            scan.scanned_route_id,
            scan.device_info,
          );
        }
        await removeScan(scan.id!);
        synced++;
      } catch (e: any) {
        if (e.code === "ERR_NETWORK" || e.message?.includes("Network Error") || !e.response) {
          break;
        }

        await markScanFailed(scan.id!, e?.message || "Server error");
        failed++;

        if ((scan.retry_count || 0) + 1 >= 3) {
          await removeScan(scan.id!);
        }
      }
    }

    await refreshPendingCount();
    setIsSyncing(false);
    syncingRef.current = false;
    setLastSyncAt(new Date());

    return { synced, failed };
  }, [refreshPendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncAt,
    submitScan,
    syncQueue,
  };
}
