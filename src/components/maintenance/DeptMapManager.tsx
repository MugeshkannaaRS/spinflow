import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { maintenanceApi } from "@/lib/api-service";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, ArrowRight, Link2 } from "lucide-react";

/**
 * Maps PM-schedule department names to Machines-master department names so the
 * Day Plan can show real machine numbers when the two use different names
 * (e.g. schedule 'Autoconer' -> machine dept 'Finishing'). Mill-editable.
 */
export function DeptMapManager() {
  const qc = useQueryClient();
  const [sched, setSched] = useState("");
  const [machine, setMachine] = useState("");

  const q = useQuery({
    queryKey: ["maintenance", "dept-map"],
    queryFn: () => maintenanceApi.getDeptMap(),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["maintenance", "dept-map"] });
    qc.invalidateQueries({ queryKey: ["maintenance", "day-plan"] });
  };

  const add = useMutation({
    mutationFn: () => maintenanceApi.addDeptMap(sched, machine),
    onSuccess: () => { toast.success("Mapping added"); invalidate(); setSched(""); setMachine(""); },
    onError: () => toast.error("Could not add mapping"),
  });
  const del = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteDeptMap(id),
    onSuccess: invalidate,
  });

  const maps = q.data?.data ?? [];
  const schedDepts = q.data?.schedule_departments ?? [];
  const machineDepts = q.data?.machine_departments ?? [];

  // Which schedule depts still have no mapping AND don't name-match a machine dept
  const mappedSched = new Set(maps.map((m: any) => m.schedule_dept.toLowerCase()));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const machineNorms = machineDepts.map(norm);
  const unmapped = schedDepts.filter((d: string) => {
    if (mappedSched.has(d.toLowerCase())) return false;
    const n = norm(d);
    return !machineNorms.some((mn) => mn === n || mn.startsWith(n) || n.startsWith(mn));
  });

  return (
    <div className="space-y-4">
      {unmapped.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          These schedule departments have no matching machines by name — map them below so real machine numbers show:{" "}
          <span className="font-medium">{unmapped.join(", ")}</span>
        </div>
      )}

      {/* Add mapping */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Schedule department</Label>
          <Select value={sched} onValueChange={setSched}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {schedDepts.map((d: string) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="size-4 text-muted-foreground mb-2.5" />
        <div className="space-y-1.5">
          <Label className="text-xs">Machine department (real machines)</Label>
          <Select value={machine} onValueChange={setMachine}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {machineDepts.map((d: string) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="mb-0.5" disabled={!sched || !machine || add.isPending} onClick={() => add.mutate()}>
          <Link2 className="size-3.5 mr-1" /> {add.isPending ? "Adding…" : "Add mapping"}
        </Button>
      </div>

      {/* Existing mappings */}
      <div className="rounded-lg border">
        <div className="px-4 py-2.5 border-b bg-muted/30 text-sm font-medium">Mappings</div>
        {maps.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No mappings yet. Departments that match by name (e.g. Carding, Ringframe) resolve automatically.
          </div>
        ) : (
          <div className="divide-y">
            {maps.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge variant="outline" className="font-medium">{m.schedule_dept}</Badge>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <Badge className="bg-blue-600 hover:bg-blue-600">{m.machine_dept}</Badge>
                <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => del.mutate(m.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
