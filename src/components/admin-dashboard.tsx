import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Database, UserCheck, Flame, CalendarX, CalendarCheck, CalendarClock, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STAT_ICONS: Record<string, any> = {
  total: Database, assigned: UserCheck, unassigned: Users, telecallers: Users,
  converted: TrendingUp, hot: Flame, overdue: CalendarX, today: CalendarClock, tomorrow: CalendarCheck,
};

const STATUS_ORDER = [
  "New", "Contacted", "Interested", "Follow Up", "Callback", "Converted", "Not Interested", "Closed", "—",
];

const STATUS_COLORS: Record<string, string> = {
  New: "oklch(0.55 0.02 260)",
  Contacted: "oklch(0.55 0.12 260)",
  Interested: "oklch(0.55 0.16 220)",
  "Follow Up": "oklch(0.62 0.17 75)",
  Callback: "oklch(0.65 0.15 85)",
  Converted: "oklch(0.55 0.18 145)",
  "Not Interested": "oklch(0.55 0.18 25)",
  Closed: "oklch(0.45 0.05 25)",
  "—": "oklch(0.55 0.02 260)",
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

function StatusTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const percent = total ? Math.round((item.value / total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-center gap-2 font-medium">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </div>
      <div className="mt-1 text-sm tabular-nums">
        <span className="text-xl font-semibold">{item.value}</span>
        <span className="ml-1 text-muted-foreground">leads</span>
      </div>
      <div className="text-xs text-muted-foreground">{percent}% of total leads</div>
    </div>
  );
}

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const [
        total, assigned, unassigned, telecallers, converted, hot,
        overdue, todayFU, tomorrowFU, byStatus, byTemp,
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
        supabase.from("leads").select("status_id, lead_statuses(name)").limit(5000),
        supabase.from("leads").select("temperature_id, lead_temperatures(name)").limit(5000),
      ]);

      const statusCounts: Record<string, number> = {};
      (byStatus.data ?? []).forEach((r: any) => {
        const n = r.lead_statuses?.name ?? "—";
        statusCounts[n] = (statusCounts[n] || 0) + 1;
      });
      const tempCounts: Record<string, number> = {};
      (byTemp.data ?? []).forEach((r: any) => {
        const n = r.lead_temperatures?.name ?? "—";
        tempCounts[n] = (tempCounts[n] || 0) + 1;
      });

      return {
        total: total.count ?? 0,
        assigned: assigned.count ?? 0,
        unassigned: unassigned.count ?? 0,
        telecallers: telecallers.count ?? 0,
        converted: converted.count ?? 0,
        hot: hot.count ?? 0,
        overdue: overdue.count ?? 0,
        todayFU: todayFU.count ?? 0,
        tomorrowFU: tomorrowFU.count ?? 0,
        statusCounts,
        tempData: Object.entries(tempCounts).map(([name, value]) => ({ name, value })),
      };
    },
  });

  const { statusData, statusTotal } = useMemo(() => {
    const counts = data?.statusCounts ?? {};
    const ordered = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0);
    const others = Object.keys(counts).filter((s) => !STATUS_ORDER.includes(s));
    const statusData = [...ordered, ...others].map((name) => ({
      name,
      value: counts[name],
      color: STATUS_COLORS[name] ?? "oklch(0.55 0.02 260)",
    }));
    return { statusData, statusTotal: Object.values(counts).reduce((a, b) => a + b, 0) };
  }, [data?.statusCounts]);

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
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium">Lead Status Distribution</div>
            <div className="text-xs text-muted-foreground">{statusTotal.toLocaleString()} leads</div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Color-coded by status. Bars show count and share of all leads.</p>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={statusData.length > 5 ? -30 : 0}
                  textAnchor={statusData.length > 5 ? "end" : "middle"}
                  height={statusData.length > 5 ? 50 : 30}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.3)" }} content={<StatusTooltip total={statusTotal} />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number) => `${v}${statusTotal ? ` (${Math.round((v / statusTotal) * 100)}%)` : ""}`}
                    className="fill-foreground text-[10px] font-medium"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusData.map((s) => (
              <div
                key={s.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  "bg-background"
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
                <span className="tabular-nums text-muted-foreground">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
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
