import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { maintenanceApi } from "@/lib/api-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { v: "0", label: "Monday" },
  { v: "1", label: "Tuesday" },
  { v: "2", label: "Wednesday" },
  { v: "3", label: "Thursday" },
  { v: "4", label: "Friday" },
  { v: "5", label: "Saturday" },
  { v: "6", label: "Sunday" },
];

/**
 * Universal mill calendar manager — holidays, half-days, per-date leave counts,
 * and a recurring weekly-off rule. Used in Masters (Calendar tab) and the
 * maintenance Day Plan. One source of truth for the whole mill.
 */
export function MillCalendarManager({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [form, setForm] = useState({ date: "", day_type: "holiday", persons_on_leave: "", note: "" });

  const calQ = useQuery({
    queryKey: ["mill-calendar", year],
    queryFn: () => maintenanceApi.getHolidays(year),
    staleTime: 30_000,
  });
  // weekly-off rules come back with date === "WEEKLY"
  const allItems: any[] = calQ.data ?? [];
  const dateItems = allItems.filter((i) => i.date !== "WEEKLY");
  const weeklyOff = allItems.find((i) => i.date === "WEEKLY");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mill-calendar"] });
    qc.invalidateQueries({ queryKey: ["maintenance", "holidays"] });
    onChanged?.();
  };

  const upsert = useMutation({
    mutationFn: (p: any) => maintenanceApi.upsertHoliday(p),
    onSuccess: () => {
      toast.success("Calendar updated");
      invalidate();
      setForm({ date: "", day_type: "holiday", persons_on_leave: "", note: "" });
    },
    onError: () => toast.error("Could not save"),
  });

  const del = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteHoliday(id),
    onSuccess: invalidate,
  });

  const submitDate = () => {
    if (!form.date) { toast.error("Pick a date"); return; }
    upsert.mutate({
      date: form.date,
      day_type: form.day_type,
      persons_on_leave: form.persons_on_leave ? Number(form.persons_on_leave) : 0,
      note: form.note || undefined,
    });
  };

  const setWeeklyOff = (weekday: string) => {
    if (weekday === "none") {
      if (weeklyOff) del.mutate(weeklyOff.id);
      return;
    }
    upsert.mutate({ date: "WEEKLY", day_type: "holiday", weekly_off: Number(weekday), note: "Weekly off" });
  };

  const typeLabel = (t: string) => (t === "half_day" ? "Half-day" : t === "working" ? "Working" : "Holiday");

  return (
    <div className="space-y-4">
      {/* Weekly off + year */}
      <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 bg-muted/20">
        <div className="space-y-1">
          <Label className="text-xs">Weekly off (recurring)</Label>
          <Select value={weeklyOff ? String(weeklyOff.weekly_off) : "none"} onValueChange={setWeeklyOff}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {WEEKDAYS.map((w) => <SelectItem key={w.v} value={w.v}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground ml-auto max-w-xs">
          Holidays, half-days and leave set here apply across the mill (Day Plan capacity, etc.).
        </p>
      </div>

      {/* Add specific-date entry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end border rounded-lg p-3">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={form.day_type} onValueChange={(v) => setForm((p) => ({ ...p, day_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="holiday">Holiday (no work)</SelectItem>
              <SelectItem value="half_day">Half-day</SelectItem>
              <SelectItem value="working">Working (override)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Persons on leave</Label>
          <Input type="number" min="0" value={form.persons_on_leave} onChange={(e) => setForm((p) => ({ ...p, persons_on_leave: e.target.value }))} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Note</Label>
          <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. Pongal" />
        </div>
        <div className="md:col-span-4 flex justify-end">
          <Button size="sm" onClick={submitDate} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Add / Update Date"}
          </Button>
        </div>
      </div>

      {/* Existing entries */}
      <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
        {dateItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No calendar dates for {year}.</div>
        ) : dateItems.map((h) => (
          <div key={h.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="font-medium w-24">{h.date}</span>
            <Badge variant="outline" className={cn(
              "text-[10px]",
              h.day_type === "holiday" && "border-rose-300 text-rose-700",
              h.day_type === "half_day" && "border-amber-300 text-amber-700",
            )}>{typeLabel(h.day_type)}</Badge>
            {(h.persons_on_leave ?? 0) > 0 && <span className="text-muted-foreground">{h.persons_on_leave} on leave</span>}
            {h.note && <span className="text-muted-foreground truncate">· {h.note}</span>}
            <Button size="sm" variant="ghost" className="ml-auto h-6 w-6 p-0 text-red-500" onClick={() => del.mutate(h.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
