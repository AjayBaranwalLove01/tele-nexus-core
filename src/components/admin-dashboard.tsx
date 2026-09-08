import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Database, UserCheck, Flame, CalendarX, CalendarCheck, CalendarClock, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusDistribution } from "@/components/status-distribution";
import { useTelecallers } from "@/hooks/use-meta";

const STAT_ICONS: Record<string, any> = {
  total: Database, assigned: UserCheck, unassigned: Users, telecallers: Users,
  converted: TrendingUp, hot: Flame, overdue: CalendarX, today: CalendarClock, tomorrow: CalendarCheck,
};

function StatCard({ k, label, value }: { k: string; label: string; value: number | string }) {
  const Icon = STAT_ICONS[k] ?? Database;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

export function AdminDashboard() {
  const [assignee, setAssignee] = useState<string>("all");
  const { data: telecallers = [] } = useTelecallers();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const [
        total, assigned, unassigned, telecallerCount, converted, hot,
        overdue, todayFU, tomorrowFU, byTemp,
      ] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).not("assigned_to", "is", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).is("assigned_to", null),
        supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "telecaller"),
        supabase.from("leads").select("status_id, lead_statuses!inner(name)", { count: "exact", head: true })
          .eq("lead_statuses.name", "Converted"),
        supabase.from("leads").select("temperature_id, lead_temperatures!inner(name)", { count: "exact", head: true })
          .eq("lead_temperatures.name", "Hot"),
        supabase.from("leads").select("*", { count: "exact", head: true }).lt("follow_up_date", today).is("completed_at", null).not("follow_up_date", "is", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("follow_up_date", today).is("completed_at", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("follow_up_date", tomorrow).is("completed_at", null),
        supabase.from("leads").select("temperature_id, lead_temperatures(name)").limit(5000),
      ]);

      const tempCounts: Record<string, number> = {};
      (byTemp.data ?? []).forEach((r: any) => {
        const n = r.lead_temperatures?.name ?? "—";
        tempCounts[n] = (tempCounts[n] || 0) + 1;
      });

      return {
        total: total.count ?? 0,
        assigned: assigned.count ?? 0,
        unassigned: unassigned.count ?? 0,
        telecallers: telecallerCount.count ?? 0,
        converted: converted.count ?? 0,
        hot: hot.count ?? 0,
        overdue: overdue.count ?? 0,
        todayFU: todayFU.count ?? 0,
        tomorrowFU: tomorrowFU.count ?? 0,
        tempData: Object.entries(tempCounts).map(([name, value]) => ({ name, value })),
      };
    },
  });

  const { data: statusCounts = {} } = useQuery({
    queryKey: ["admin-status-distribution", assignee],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("status_id, lead_statuses(name)")
        .not("assigned_to", "is", null)
        .limit(10000);
      if (assignee !== "all") q = q.eq("assigned_to", assignee);
      const { data, error } = await q;
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        const n = r.lead_statuses?.name ?? "—";
        counts[n] = (counts[n] || 0) + 1;
      });
      return counts;
    },
  });

  if (isLoading || !data) return <div className="grid gap-4 md:grid-cols-4">{Array.from({length: 8}).map((_,i)=><Skeleton key={i} className="h-24"/>)}</div>;

  const tempPalette: Record<string, string> = { Hot: "oklch(0.62 0.22 25)", Warm: "oklch(0.72 0.17 60)", Cold: "oklch(0.62 0.15 235)" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of leads, telecallers, and follow-ups.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard k="total" label="Total Leads" value={data.total.toLocaleString()} />
        <StatCard k="assigned" label="Assigned" value={data.assigned.toLocaleString()} />
        <StatCard k="unassigned" label="Unassigned Pool" value={data.unassigned.toLocaleString()} />
        <StatCard k="telecallers" label="Telecallers" value={data.telecallers} />
        <StatCard k="converted" label="Converted" value={data.converted} />
        <StatCard k="hot" label="Hot Leads" value={data.hot} />
        <StatCard k="overdue" label="Overdue Follow-ups" value={data.overdue} />
        <StatCard k="today" label="Today's Follow-ups" value={data.todayFU} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusDistribution
          counts={statusCounts}
          subtitle="Assigned leads only. Filter by telecaller to see their pipeline."
          toolbar={
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All telecallers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All telecallers</SelectItem>
                {telecallers.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <Card className="p-4">
          <div className="font-medium mb-3">Temperature Distribution</div>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.tempData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.tempData.map((d) => (
                    <Cell key={d.name} fill={tempPalette[d.name] ?? "oklch(0.5 0.02 260)"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
