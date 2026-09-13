import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Download, Users, PhoneCall, ArrowUpDown, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { useTelecallers } from "@/hooks/use-meta";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportRows } from "@/lib/activity/export";
import { LeadHistoryTimeline } from "@/components/lead-history-dialog";

export const Route = createFileRoute("/_authenticated/productivity")({
  head: () => ({
    meta: [
      { title: "Telecaller Productivity — Oxo Lead Manager" },
      { name: "description", content: "Date-wise telecaller productivity, lead activity history and status transition reports." },
      { property: "og:title", content: "Telecaller Productivity — Oxo Lead Manager" },
      { property: "og:description", content: "Date-wise telecaller productivity, lead activity history and status transition reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductivityPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

function presetRange(p: string): { from: string; to: string } {
  const now = new Date();
  switch (p) {
    case "today": return { from: iso(now), to: iso(now) };
    case "yesterday": return { from: addDays(-1), to: addDays(-1) };
    case "7": return { from: addDays(-6), to: iso(now) };
    case "30": return { from: addDays(-29), to: iso(now) };
    case "month": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case "prev-month": return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
    default: return { from: addDays(-29), to: iso(now) };
  }
}

type DailyRow = {
  activity_date: string; telecaller_id: string; telecaller_name: string;
  unique_leads: number; calls: number; followups: number; status_changes: number;
  converted: number; completed: number; remarks: number; activities: number;
};

type SummaryRow = {
  telecaller_id: string; telecaller_name: string; unique_leads: number; calls: number;
  followups: number; status_changes: number; converted: number; completed: number;
  activities: number; currently_assigned: number;
};

function ProductivityPage() {
  const { data: me, isLoading: meLoading } = useMyProfile();
  const isAdmin = !!me?.isAdmin;
  const { data: telecallers } = useTelecallers();

  const [preset, setPreset] = useState("30");
  const [custom, setCustom] = useState(presetRange("30"));
  const [telecaller, setTelecaller] = useState("all");
  const range = preset === "custom" ? custom : presetRange(preset);
  const tcParam = isAdmin && telecaller !== "all" ? telecaller : null;

  const [drill, setDrill] = useState<{ from: string; to: string; tid: string | null; label: string } | null>(null);
  const [historyLead, setHistoryLead] = useState<{ id: number; name: string | null } | null>(null);

  const daily = useQuery({
    queryKey: ["prod-daily", range.from, range.to, tcParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("productivity_daily", {
        _from: range.from, _to: range.to, _telecaller: tcParam,
      });
      if (error) throw error;
      return (data ?? []) as DailyRow[];
    },
  });

  const summary = useQuery({
    queryKey: ["prod-summary", range.from, range.to, tcParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("productivity_summary", {
        _from: range.from, _to: range.to, _telecaller: tcParam,
      });
      if (error) throw error;
      return (data ?? []) as SummaryRow[];
    },
  });

  const transitions = useQuery({
    queryKey: ["prod-transitions", range.from, range.to, tcParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("status_transitions", {
        _from: range.from, _to: range.to, _telecaller: tcParam,
      });
      if (error) throw error;
      return (data ?? []) as { previous_status: string; new_status: string; transitions: number }[];
    },
  });

  const totals = useMemo(() => {
    const s = summary.data ?? [];
    return {
      leads: s.reduce((a, r) => a + Number(r.unique_leads), 0),
      calls: s.reduce((a, r) => a + Number(r.calls), 0),
      followups: s.reduce((a, r) => a + Number(r.followups), 0),
      changes: s.reduce((a, r) => a + Number(r.status_changes), 0),
      converted: s.reduce((a, r) => a + Number(r.converted), 0),
      completed: s.reduce((a, r) => a + Number(r.completed), 0),
    };
  }, [summary.data]);

  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; leads: number; calls: number }>();
    for (const r of daily.data ?? []) {
      const e = map.get(r.activity_date) ?? { date: r.activity_date, leads: 0, calls: 0 };
      e.leads += Number(r.unique_leads);
      e.calls += Number(r.calls);
      map.set(r.activity_date, e);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [daily.data]);

  const matrix = useMemo(() => {
    const names = [...new Set((daily.data ?? []).map((r) => r.telecaller_name))].sort();
    const dates = [...new Set((daily.data ?? []).map((r) => r.activity_date))].sort((a, b) => b.localeCompare(a));
    const lookup = new Map<string, DailyRow>();
    for (const r of daily.data ?? []) lookup.set(`${r.activity_date}|${r.telecaller_name}`, r);
    return { names, dates, lookup };
  }, [daily.data]);

  if (meLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display">Telecaller Productivity</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Every telecaller, based on recorded lead activity." : "Your own recorded lead activity."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="prev-month">Previous month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div><Label className="text-xs">From</Label>
                <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></div>
              <div><Label className="text-xs">To</Label>
                <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></div>
            </>
          )}
          {isAdmin && (
            <div>
              <Label className="text-xs">Telecaller</Label>
              <Select value={telecaller} onValueChange={setTelecaller}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All telecallers</SelectItem>
                  {telecallers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Unique leads worked", value: totals.leads, icon: Users },
          { label: "Calls / remarks", value: totals.calls, icon: PhoneCall },
          { label: "Follow-ups set", value: totals.followups, icon: ArrowUpDown },
          { label: "Status changes", value: totals.changes, icon: ArrowUpDown },
          { label: "Converted", value: totals.converted, icon: Trophy },
          { label: "Completed", value: totals.completed, icon: Trophy },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="daily">Daily productivity</TabsTrigger>
          <TabsTrigger value="performance">Telecaller performance</TabsTrigger>
          <TabsTrigger value="matrix">Date-wise matrix</TabsTrigger>
          <TabsTrigger value="transitions">Status transitions</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => exportRows((daily.data ?? []).map((r) => ({
              Date: r.activity_date, Telecaller: r.telecaller_name, "Unique leads": r.unique_leads,
              "Calls/remarks": r.calls, "Follow-ups": r.followups, "Status changes": r.status_changes,
              Converted: r.converted, Completed: r.completed, "Total activities": r.activities,
            })), "daily-productivity", "xlsx")}><Download className="h-4 w-4" />Export</Button>
          </div>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  {["Date", "Telecaller", "Leads worked", "Calls/remarks", "Follow-ups", "Status changes", "Converted", "Completed"].map((h) => (
                    <th key={h} className="text-left p-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daily.isLoading && <tr><td colSpan={8} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>}
                {!daily.isLoading && (daily.data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-muted-foreground">No activity recorded for this period.</td></tr>
                )}
                {(daily.data ?? []).map((r) => (
                  <tr key={`${r.activity_date}-${r.telecaller_id}`} className="border-t">
                    <td className="p-2 whitespace-nowrap">{r.activity_date}</td>
                    <td className="p-2">{r.telecaller_name}</td>
                    <td className="p-2">
                      <button
                        className="text-primary underline underline-offset-2 tabular-nums"
                        onClick={() => setDrill({ from: r.activity_date, to: r.activity_date, tid: r.telecaller_id, label: `${r.telecaller_name} · ${r.activity_date}` })}
                      >{r.unique_leads}</button>
                    </td>
                    <td className="p-2 tabular-nums">{r.calls}</td>
                    <td className="p-2 tabular-nums">{r.followups}</td>
                    <td className="p-2 tabular-nums">{r.status_changes}</td>
                    <td className="p-2 tabular-nums">{r.converted}</td>
                    <td className="p-2 tabular-nums">{r.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => exportRows((summary.data ?? []).map((r) => ({
              Telecaller: r.telecaller_name, "Unique leads worked": r.unique_leads, "Calls/remarks": r.calls,
              "Follow-ups": r.followups, "Status changes": r.status_changes, Converted: r.converted,
              Completed: r.completed, "Conversion rate %": r.unique_leads ? ((Number(r.converted) / Number(r.unique_leads)) * 100).toFixed(2) : "0",
              "Avg activities per lead": r.unique_leads ? (Number(r.activities) / Number(r.unique_leads)).toFixed(2) : "0",
              "Currently assigned": r.currently_assigned,
            })), "telecaller-performance", "xlsx")}><Download className="h-4 w-4" />Export</Button>
          </div>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  {["Telecaller", "Unique leads", "Calls/remarks", "Follow-ups", "Status changes", "Converted", "Completed", "Conversion rate", "Avg activities/lead", "Currently assigned"].map((h) => (
                    <th key={h} className="text-left p-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(summary.data ?? []).map((r) => (
                  <tr key={r.telecaller_id} className="border-t">
                    <td className="p-2">{r.telecaller_name}</td>
                    <td className="p-2">
                      <button className="text-primary underline underline-offset-2 tabular-nums"
                        onClick={() => setDrill({ from: range.from, to: range.to, tid: r.telecaller_id, label: `${r.telecaller_name} · ${range.from} → ${range.to}` })}>
                        {r.unique_leads}
                      </button>
                    </td>
                    <td className="p-2 tabular-nums">{r.calls}</td>
                    <td className="p-2 tabular-nums">{r.followups}</td>
                    <td className="p-2 tabular-nums">{r.status_changes}</td>
                    <td className="p-2 tabular-nums">{r.converted}</td>
                    <td className="p-2 tabular-nums">{r.completed}</td>
                    <td className="p-2 tabular-nums">{r.unique_leads ? ((Number(r.converted) / Number(r.unique_leads)) * 100).toFixed(2) : "0.00"}%</td>
                    <td className="p-2 tabular-nums">{r.unique_leads ? (Number(r.activities) / Number(r.unique_leads)).toFixed(1) : "0"}</td>
                    <td className="p-2 tabular-nums">{r.currently_assigned}</td>
                  </tr>
                ))}
                {!summary.isLoading && (summary.data ?? []).length === 0 && (
                  <tr><td colSpan={10} className="p-4 text-muted-foreground">No activity recorded for this period.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="matrix">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Date</th>
                  {matrix.names.map((n) => <th key={n} className="text-left p-2 font-medium">{n}</th>)}
                  <th className="text-left p-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.dates.map((d) => {
                  let total = 0;
                  return (
                    <tr key={d} className="border-t">
                      <td className="p-2 whitespace-nowrap">{d}</td>
                      {matrix.names.map((n) => {
                        const row = matrix.lookup.get(`${d}|${n}`);
                        total += Number(row?.unique_leads ?? 0);
                        return (
                          <td key={n} className="p-2 tabular-nums">
                            {row ? (
                              <button className="text-primary underline underline-offset-2"
                                onClick={() => setDrill({ from: d, to: d, tid: row.telecaller_id, label: `${n} · ${d}` })}>
                                {row.unique_leads}
                              </button>
                            ) : "—"}
                          </td>
                        );
                      })}
                      <td className="p-2 tabular-nums font-medium">{total}</td>
                    </tr>
                  );
                })}
                {matrix.dates.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={2}>No activity recorded.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="transitions" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => exportRows((transitions.data ?? []).map((r) => ({
              "Previous status": r.previous_status, "New status": r.new_status, Count: r.transitions,
            })), "status-transitions", "xlsx")}><Download className="h-4 w-4" />Export</Button>
          </div>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr><th className="text-left p-2 font-medium">Previous status</th><th className="text-left p-2 font-medium">New status</th><th className="text-left p-2 font-medium">Count</th></tr>
              </thead>
              <tbody>
                {(transitions.data ?? []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><Badge variant="outline">{r.previous_status}</Badge></td>
                    <td className="p-2"><Badge variant="outline">{r.new_status}</Badge></td>
                    <td className="p-2 tabular-nums">{r.transitions}</td>
                  </tr>
                ))}
                {(transitions.data ?? []).length === 0 && <tr><td colSpan={3} className="p-4 text-muted-foreground">No status changes recorded.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Unique leads worked by telecaller</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(summary.data ?? []).map((r) => ({ name: r.telecaller_name, leads: Number(r.unique_leads) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Daily leads worked and calls</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="calls" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Status changes by telecaller</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(summary.data ?? []).map((r) => ({ name: r.telecaller_name, changes: Number(r.status_changes), converted: Number(r.converted) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="changes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="converted" fill="hsl(var(--chart-2, var(--primary)))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadsWorkedDialog drill={drill} onClose={() => setDrill(null)} onOpenHistory={setHistoryLead} />

      <Dialog open={!!historyLead} onOpenChange={(o) => !o && setHistoryLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Lead history — {historyLead?.name || `#${historyLead?.id}`}</DialogTitle></DialogHeader>
          {historyLead && <LeadHistoryTimeline leadId={historyLead.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type WorkedRow = {
  lead_id: number; name: string | null; phone_number: string | null; city: string | null;
  current_status: string | null; status_on_date: string | null; assigned_name: string | null;
  first_activity: string; last_activity: string; activity_count: number; latest_remark: string | null;
};

function LeadsWorkedDialog({
  drill, onClose, onOpenHistory,
}: {
  drill: { from: string; to: string; tid: string | null; label: string } | null;
  onClose: () => void;
  onOpenHistory: (l: { id: number; name: string | null }) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["leads-worked", drill?.from, drill?.to, drill?.tid],
    enabled: !!drill,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leads_worked", {
        _from: drill!.from, _to: drill!.to, _telecaller: drill!.tid,
      });
      if (error) throw error;
      return (data ?? []) as WorkedRow[];
    },
  });

  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Leads worked — {drill?.label}</DialogTitle></DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => exportRows((data ?? []).map((r) => ({
            Lead: r.name, Phone: r.phone_number, City: r.city, "Current status": r.current_status,
            "Status on date": r.status_on_date, "Assigned to": r.assigned_name,
            "First activity": r.first_activity, "Last activity": r.last_activity,
            Activities: r.activity_count, "Latest remark": r.latest_remark,
          })), "leads-worked", "xlsx")}><Download className="h-4 w-4" />Export</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {isLoading && <Skeleton className="h-40 w-full" />}
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs sticky top-0">
              <tr>
                {["Lead", "Phone", "Current status", "Status on date", "Assigned to", "First activity", "Last activity", "Activities", "Latest remark", ""].map((h) => (
                  <th key={h} className="text-left p-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.lead_id} className="border-t align-top">
                  <td className="p-2">
                    <Link to="/leads/$id" params={{ id: String(r.lead_id) }} className="text-primary hover:underline">
                      {r.name || "Unnamed lead"}
                    </Link>
                  </td>
                  <td className="p-2">{r.phone_number}</td>
                  <td className="p-2">{r.current_status ?? "—"}</td>
                  <td className="p-2">{r.status_on_date ?? "—"}</td>
                  <td className="p-2">{r.assigned_name ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(r.first_activity).toLocaleString()}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(r.last_activity).toLocaleString()}</td>
                  <td className="p-2 tabular-nums">{r.activity_count}</td>
                  <td className="p-2 max-w-64 truncate">{r.latest_remark ?? "—"}</td>
                  <td className="p-2">
                    <Button size="sm" variant="ghost" onClick={() => onOpenHistory({ id: r.lead_id, name: r.name })}>History</Button>
                  </td>
                </tr>
              ))}
              {!isLoading && (data ?? []).length === 0 && (
                <tr><td colSpan={10} className="p-4 text-muted-foreground">No leads found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
