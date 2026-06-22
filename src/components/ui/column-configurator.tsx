import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { api } from "@/lib/api";
import { Settings2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";

interface ColumnConfiguratorProps {
  module: string;
  tableKey: string;
}

interface LocalCol {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

export function ColumnConfigurator({ module, tableKey }: ColumnConfiguratorProps) {
  const { columns, isLoading } = useColumnConfig(tableKey);
  const [open, setOpen] = useState(false);
  const [localCols, setLocalCols] = useState<LocalCol[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o)
      setLocalCols(
        columns.map((c, i) => ({ key: c.key, label: c.label, visible: c.isVisible, order: i + 1 })),
      );
  };

  const toggleVisible = (key: string) => {
    setLocalCols((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setLocalCols((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((c, i) => ({ ...c, order: i + 1 }));
    });
  };

  const moveDown = (index: number) => {
    if (index >= localCols.length - 1) return;
    setLocalCols((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((c, i) => ({ ...c, order: i + 1 }));
    });
  };

  const resetDefaults = () => {
    setLocalCols(
      columns.map((c, i) => ({ key: c.key, label: c.label, visible: c.isVisible, order: i + 1 })),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = localCols.map((c, i) => ({
        key: c.key,
        is_visible: c.visible,
        display_order: i + 1,
      }));
      await api.put(
        "/ui-config/columns",
        { columns: updated },
        {
          params: { table: tableKey, mill_id: "default" },
        },
      );
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to save column config");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7">
          <Settings2 className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Column Settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 py-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Drag or reorder columns</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={resetDefaults}>
              <RotateCcw className="size-3 mr-1" />
              Reset
            </Button>
          </div>
          <div className="space-y-1">
            {localCols.map((col, i) => (
              <div
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded border hover:bg-muted/50"
              >
                <Checkbox checked={col.visible} onCheckedChange={() => toggleVisible(col.key)} />
                <span
                  className={`flex-1 text-sm ${col.visible ? "" : "text-muted-foreground line-through"}`}
                >
                  {col.label}
                </span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i >= localCols.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <SheetFooter>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
