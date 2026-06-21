import { useMillConfigProfile } from "@/contexts/MillConfigContext";
import { getColumnLabel } from "@/lib/column-labels";

interface CustomLabelProps {
  module: string;
  field: string;
  fallback: string;
}

export function CustomLabel({ module, field, fallback }: CustomLabelProps) {
  const { profile, loading } = useMillConfigProfile();
  const label = getColumnLabel(profile, module, field);

  if (loading) {
    return <span className="opacity-50">{fallback}</span>;
  }

  return <span>{label ?? fallback}</span>;
}
