import { api } from "@/lib/api";

export interface AuditLog {
  id: string;
  user_id: string | null;
  role: string | null;
  action_type: string;
  module: string;
  record_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  timestamp: string;
}

export function getRecentAuditLogs(params: { limit?: number; module?: string }) {
  return api
    .get("/audit/logs", { params })
    .then((r) => r.data as { data: AuditLog[]; total: number });
}
