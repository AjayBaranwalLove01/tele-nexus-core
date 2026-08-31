import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings, useStatuses, useTemperatures } from "@/hooks/use-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Oxo Lead Manager" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();
  const [perCaller, setPerCaller] = useState(50);
  const [autoRefill, setAutoRefill] = useState(false);

  useEffect(() => {
    if (s) { setPerCaller(s.leads_per_telecaller); setAutoRefill(s.auto_refill); }
  }, [s]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_settings").update({
        leads_per_telecaller: perCaller, auto_refill: autoRefill,
      }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["crm_settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Distribution rules and lead taxonomy.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="font-semibold">Lead Distribution</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Default leads per telecaller</Label>
            <Input type="number" min={1} value={perCaller} onChange={(e)=>setPerCaller(Number(e.target.value))}/>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={autoRefill} onCheckedChange={setAutoRefill}/>
              <Label>Auto-refill on zero active leads</Label>
            </div>
          </div>
        </div>
        <Button onClick={()=>save.mutate()} disabled={save.isPending}>Save</Button>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Lead Statuses</div>
        <div className="flex flex-wrap gap-2">
          {statuses?.map((s)=> (
            <span key={s.id} className={`text-xs px-2 py-1 rounded border ${s.is_completion ? "bg-success/10 border-success/30 text-success" : "bg-muted"}`}>
              {s.name}{s.is_completion ? " ✓" : ""}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Completion statuses remove the lead from the active quota.</p>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Lead Temperatures</div>
        <div className="flex flex-wrap gap-2">
          {temps?.map((t)=>(<span key={t.id} className="text-xs px-2 py-1 rounded border bg-muted">{t.name}</span>))}
        </div>
      </Card>
    </div>
  );
}
