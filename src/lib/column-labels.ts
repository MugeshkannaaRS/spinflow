import type { MillConfigProfile } from "@/contexts/MillConfigContext";

export function getColumnLabel(
  profile: MillConfigProfile | null,
  module: string,
  fieldKey: string,
): string | null {
  if (!profile?.field_labels) return null;
  return profile.field_labels[`${module}.${fieldKey}`] ?? null;
}
