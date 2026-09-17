import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { useTelecallers } from "@/hooks/use-meta";
import { LeadRow } from "@/components/lead-row";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-ups — Oxo Lead Manager" }] }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const { data: me } = useMyProfile();
  const { data: telecallers } = useTelecallers();
  const [assignedTo, setAssignedTo] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["followups", me?.profile?.id, me?.isAdmin, assignedTo],
    enabled: !!me,
    queryFn: async () => {
      let q = supabase.from("leads")
        .select("id,name,phone_number,follow_up_date,follow_up_time,status_id,temperature_id,assigned_to,lead_statuses(name),lead_temperatures(name),profiles:assigned_to(full_name)")
        .is("completed_at", null)
        .is("archived_at", null)
        .not("follow_up_date", "is", null)
        .order("follow_up_date", { ascending: true })
        .limit(500);
      if (!me?.isAdmin && me?.profile?.id) q = q.eq("assigned_to", me.profile.id);
      if (me?.isAdmin && assignedTo !== "all") q = q.eq("assigned_to", assignedTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        ...l, status_name: l.lead_statuses?.name, temperature_name: l.lead_temperatures?.name,
      }));
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const buckets = {
    overdue: (data ?? []).filter((l) => l.follow_up_date && l.follow_up_date < today),
    today: (data ?? []).filter((l) => l.follow_up_date === today),
    tomorrow: (data ?? []).filter((l) => l.follow_up_date === tomorrow),
    later: (data ?? []).filter((l) => l.follow_up_date && l.follow_up_date > tomorrow),
  };

  if (isLoading) return <Skeleton className="h-96"/>;

  const Section = ({ title, items, accent }: any) => (
    <div>
      <div className={`font-semibold mb-2 ${accent}`}>{title} <span className="text-muted-foreground font-normal">({items.length})</span></div>
      {items.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">None</Card> :
        <div className="grid gap-2">{items.map((l: any) => <LeadRow key={l.id} lead={l}/>)}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow-up Queue</h1>
          <p className="text-sm text-muted-foreground">Ordered by urgency: overdue, today, tomorrow, future.</p>
        </div>
        {me?.isAdmin && (
          <div className="w-full sm:w-64">
            <label className="text-xs text-muted-foreground mb-1 block">Telecaller</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="All telecallers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All telecallers</SelectItem>
                {(telecallers ?? []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name || t.email || t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Section title="Overdue" items={buckets.overdue} accent="text-destructive"/>
      <Section title="Today" items={buckets.today} accent="text-warning"/>
      <Section title="Tomorrow" items={buckets.tomorrow} accent="text-info"/>
      <Section title="Upcoming" items={buckets.later}/>
    </div>
  );
}
