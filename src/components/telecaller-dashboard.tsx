import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadRow } from "@/components/lead-row";
import { Plus, CheckCircle2, Flame, CalendarClock, CalendarX } from "lucide-react";
import { toast } from "sonner";
import { StatusDistribution } from "@/components/status-distribution";

type LeadRowT = {
  id: number;
  name: string | null;
  phone_number: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  completed_at: string | null;
  status_id: string | null;
  temperature_id: string | null;
  lead_statuses: { name: string } | null;
  lead_temperatures: { name: string } | null;
};

export function TelecallerDashboard() {
  const qc = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ["my-leads"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone_number,follow_up_date,follow_up_time,completed_at,status_id,temperature_id,lead_statuses(name),lead_temperatures(name)")
        .eq("assigned_to", user.id)
        .is("completed_at", null)
        .order("follow_up_date", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LeadRowT[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const sorted = (leads ?? []).slice().sort((a, b) => {
    const rank = (d: string | null) => {
      if (!d) return 5;
      if (d < today) return 1;
      if (d === today) return 2;
      if (d === tomorrow) return 3;
      return 4;
    };
    return rank(a.follow_up_date) - rank(b.follow_up_date);
  });

  const stats = {
    remaining: sorted.length,
    overdue: sorted.filter((l) => l.follow_up_date && l.follow_up_date < today).length,
    todayCount: sorted.filter((l) => l.follow_up_date === today).length,
    hot: sorted.filter((l) => l.lead_temperatures?.name === "Hot").length,
  };

  const { data: statusCounts = {} } = useQuery({
    queryKey: ["my-status-distribution"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("leads")
        .select("status_id, lead_statuses(name)")
        .eq("assigned_to", user.id)
        .limit(10000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        const n = r.lead_statuses?.name ?? "—";
        counts[n] = (counts[n] || 0) + 1;
      });
      return counts;
    },
  });

  const getMore = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("get_more_leads");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? `Assigned ${n} new leads` : "No leads available in pool");
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-status-distribution"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96" />;

  const mapped = sorted.map((l) => ({
    id: l.id, name: l.name, phone_number: l.phone_number,
    follow_up_date: l.follow_up_date, follow_up_time: l.follow_up_time,
    status_name: l.lead_statuses?.name ?? null,
    temperature_name: l.lead_temperatures?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Workspace</h1>
          <p className="text-sm text-muted-foreground">Your follow-up queue, prioritized.</p>
        </div>
        <Button onClick={() => getMore.mutate()} disabled={getMore.isPending} size="lg">
          <Plus className="h-4 w-4" /> Get More Leads
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Remaining<CheckCircle2 className="h-4 w-4"/></div>
          <div className="mt-2 text-2xl font-semibold">{stats.remaining}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Overdue<CalendarX className="h-4 w-4 text-destructive"/></div>
          <div className="mt-2 text-2xl font-semibold">{stats.overdue}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Today<CalendarClock className="h-4 w-4 text-warning"/></div>
          <div className="mt-2 text-2xl font-semibold">{stats.todayCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Hot<Flame className="h-4 w-4 text-hot"/></div>
          <div className="mt-2 text-2xl font-semibold">{stats.hot}</div>
        </Card>
      </div>

      <StatusDistribution
        counts={statusCounts}
        title="My Lead Status Distribution"
        subtitle="Statuses across all leads assigned to you."
      />

      <div>
        <div className="font-semibold mb-3">My Follow-up Queue</div>
        {mapped.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground">No active leads. Click "Get More Leads" to pull from the pool.</p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {mapped.map((l) => <LeadRow key={l.id} lead={l} />)}
          </div>
        )}
      </div>
    </div>
  );
}
