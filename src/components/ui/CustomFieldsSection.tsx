/**
 * CustomFieldsSection — renders mill-defined extra fields at the bottom of any entry form.
 * If the mill has no custom field definitions for the given table, renders nothing (zero UI impact).
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface CustomFieldDefinition {
  id: string;
  mill_id: string;
  module: string;
  table_name: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "select" | "boolean" | "date";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface CustomFieldsSectionProps {
  tableName: string;
  millId: string | null | undefined;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

export function CustomFieldsSection({
  tableName,
  millId,
  values,
  onChange,
  readOnly = false,
}: CustomFieldsSectionProps) {
  const [open, setOpen] = useState(true);
  const [blurErrors, setBlurErrors] = useState<Record<string, string>>({});

  const { data: definitions = [] } = useQuery<CustomFieldDefinition[]>({
    queryKey: ["custom-field-definitions", millId, tableName],
    queryFn: () =>
      api
        .get<CustomFieldDefinition[]>("/custom-fields/definitions", {
          params: { table_name: tableName },
        })
        .then((r) => r.data),
    enabled: !!millId && !!tableName,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });

  // Nothing to show — zero UI impact for mills with no definitions
  if (definitions.length === 0) return null;

  const handleBlur = (defn: CustomFieldDefinition) => {
    if (defn.is_required) {
      const val = values[defn.field_key];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === "string" && val.trim() === "");
      setBlurErrors((prev) => ({
        ...prev,
        [defn.field_key]: isEmpty ? "Required" : "",
      }));
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
        <span>Custom Fields ({definitions.length})</span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {definitions.map((defn) => (
            <FieldInput
              key={defn.id}
              defn={defn}
              value={values[defn.field_key]}
              onChange={(v) => onChange(defn.field_key, v)}
              onBlur={() => handleBlur(defn)}
              error={blurErrors[defn.field_key]}
              readOnly={readOnly}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Individual field renderer ──────────────────────────────────────────────

interface FieldInputProps {
  defn: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
  error?: string;
  readOnly: boolean;
}

function FieldInput({ defn, value, onChange, onBlur, error, readOnly }: FieldInputProps) {
  const labelEl = (
    <Label className="text-xs font-medium">
      {defn.label}
      {defn.is_required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (defn.field_type === "boolean") {
    return (
      <div className="flex items-center gap-2 pt-5">
        <Checkbox
          id={defn.id}
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked === true)}
          disabled={readOnly}
        />
        <Label htmlFor={defn.id} className="text-xs font-medium cursor-pointer">
          {defn.label}
          {defn.is_required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      </div>
    );
  }

  if (defn.field_type === "select" && defn.options && defn.options.length > 0) {
    return (
      <div className="space-y-1">
        {labelEl}
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => onChange(v)}
          disabled={readOnly}
        >
          <SelectTrigger className={cn("h-9 text-sm", error ? "border-destructive" : "")}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {defn.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  // text | number | date
  const inputType =
    defn.field_type === "number"
      ? "number"
      : defn.field_type === "date"
        ? "date"
        : "text";

  return (
    <div className="space-y-1">
      {labelEl}
      <Input
        type={inputType}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(defn.field_type === "number" ? e.target.value : e.target.value)
        }
        onBlur={onBlur}
        readOnly={readOnly}
        disabled={readOnly}
        className={cn("h-9 text-sm", error ? "border-destructive" : "")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
