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
import { Trash2, CalendarDays, CalendarX, CalendarClock, Users, Plus } from "lucide-react";
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
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Counts for the summary strip
  const holidayCount = dateItems.filter((i) => i.day_type === "holiday").length;
  const halfDayCount = dateItems.filter((i) => i.day_type === "half_day").length;
  const leaveDays = dateItems.filter((i) => (i.persons_on_leave ?? 0) > 0).length;
  const weeklyOffLabel = weeklyOff != null && weeklyOff.weekly_off != null
    ? WEEKDAYS.find((w) => w.v === String(weeklyOff.weekly_off))?.label ?? "—"
    : "None";

  // Group date entries by month for a clean list
  const byMonth: Record<number, any[]> = {};
  for (const h of [...dateItems].sort((a, b) => a.date.localeCompare(b.date))) {
    const mo = Number((h.date.split("-")[1] ?? "1")) - 1;
    (byMonth[mo] = byMonth[mo] || []).push(h);
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  };

  const typeStyle = (t: string) =>
    t === "holiday"
      ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30"
      : t === "half_day"
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30"
        : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40";

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Weekly Off", value: weeklyOffLabel, icon: <CalendarDays className="size-4 text-blue-500" /> },
          { label: "Holidays", value: holidayCount, icon: <CalendarX className="size-4 text-rose-500" /> },
          { label: "Half-days", value: halfDayCount, icon: <CalendarClock className="size-4 text-amber-500" /> },
          { label: "Leave days", value: leaveDays, icon: <Users className="size-4 text-violet-500" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{s.icon}{s.label}</div>
            <div className="text-lg font-bold leading-none">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Settings row: weekly-off + year */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Weekly off (recurring)</Label>
          <Select value={weeklyOff ? String(weeklyOff.weekly_off) : "none"} onValueChange={setWeeklyOff}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {WEEKDAYS.map((w) => <SelectItem key={w.v} value={w.v}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Showing year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground ml-auto max-w-[18rem] leading-relaxed">
          The weekly off repeats every week automatically. Specific holidays, half-days and leave are added below.
        </p>
      </div>

      {/* Add a date */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Add holiday / half-day / leave</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.day_type} onValueChange={(v) => setForm((p) => ({ ...p, day_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Holiday (no work)</SelectItem>
                <SelectItem value="half_day">Half-day</SelectItem>
                <SelectItem value="working">Working (override off)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Persons on leave</Label>
            <Input type="number" min="0" value={form.persons_on_leave} onChange={(e) => setForm((p) => ({ ...p, persons_on_leave: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. Pongal" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={submitDate} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Add / Update Date"}
          </Button>
        </div>
      </div>

      {/* Entries grouped by month */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <span className="text-sm font-medium">Calendar entries — {year}</span>
          <span className="text-xs text-muted-foreground">{dateItems.length} {dateItems.length === 1 ? "entry" : "entries"}</span>
        </div>
        {dateItems.length === 0 ? (
          <div className="py-12 text-center">
            <CalendarDays className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No holidays or leave set for {year} yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Add dates above — they'll appear here grouped by month.</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y">
            {Object.keys(byMonth).map(Number).sort((a, b) => a - b).map((mo) => (
              <div key={mo}>
                <div className="px-4 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground sticky top-0">
                  {MONTHS[mo]}
                </div>
                <div className="divide-y divide-border/50">
                  {byMonth[mo].map((h) => (
                    <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
                      <span className="text-sm font-medium w-28 flex-shrink-0">{fmtDate(h.date)}</span>
                      <Badge variant="outline" className={cn("text-[10px] font-medium", typeStyle(h.day_type))}>
                        {typeLabel(h.day_type)}
                      </Badge>
                      {(h.persons_on_leave ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded">
                          <Users className="size-3" /> {h.persons_on_leave} on leave
                        </span>
                      )}
                      {h.note && <span className="text-xs text-muted-foreground truncate">{h.note}</span>}
                      <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => del.mutate(h.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
