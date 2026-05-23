import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

interface ColumnConfigResponse {
  id?: string;
  mill_id: string;
  module: string;
  table_key: string;
  columns: ColumnDef[];
  updated_at?: string;
}

async function fetchColumnConfig(
  millId: string,
  module: string,
  tableKey: string,
): Promise<ColumnDef[]> {
  const res = await api.get<ColumnConfigResponse>("/ui-config/columns", {
    params: { mill_id: millId, module, table_key: tableKey },
  });
  return res.data.columns;
}

async function saveColumnConfig(
  millId: string,
  module: string,
  tableKey: string,
  columns: ColumnDef[],
): Promise<ColumnConfigResponse> {
  const res = await api.put<ColumnConfigResponse>("/ui-config/columns", columns, {
    params: { mill_id: millId, module, table_key: tableKey },
  });
  return res.data;
}

export function useColumnConfig(module: string, tableKey: string) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const millId = user?.millId ?? "m1";

  const query = useQuery({
    queryKey: ["column-config", millId, module, tableKey],
    queryFn: () => fetchColumnConfig(millId, module, tableKey),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (columns: ColumnDef[]) =>
      saveColumnConfig(millId, module, tableKey, columns),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-config", millId, module, tableKey] });
    },
  });

  const columns = query.data ?? [];
  const visibleKeys = new Set(
    columns.filter((c) => c.visible).sort((a, b) => a.order - b.order).map((c) => c.key),
  );

  return {
    columns,
    visibleKeys,
    isLoading: query.isLoading,
    saveColumns: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
