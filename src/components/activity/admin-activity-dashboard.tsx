import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { EmployeeTimelineDialog } from "./employee-timeline";
import { formatDuration, ACTIVITY_TYPES } from "@/lib/activity/constants";
import { exportPdf, exportRows } from "@/lib/activity/export";
import {
  dayBounds, fetchActivities, fetchLatestSessions, fetchProfiles, fetchSessions, liveStatus,
  type LiveStatus, type SessionRow,
} from "@/lib/activity/queries";
import { Download, FileSpreadsheet, FileText, Users } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#14b8a6", "#f43f5e"];

export function AdminActivityDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [employee, setEmployee] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LiveStatus>("all");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const bounds = dayBounds(date);

  const { data: profiles = [] } = useQuery({ queryKey: ["activity-profiles"], queryFn: fetchProfiles });

  const { data, isLoading } = useQuery({
    queryKey: ["activity-overview", date, employee, moduleFilter, typeFilter],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [sessions, latest, activities] = await Promise.all([
        fetchSessions(bounds.from, bounds.to, employee === "all" ? undefined : employee),
        fetchLatestSessions(),
        fetchActivities({
          from: bounds.from,
          to: bounds.to,
          userId: employee === "all" ? undefined : employee,
          module: moduleFilter === "all" ? undefined : moduleFilter,
          activityType: typeFilter === "all" ? undefined : typeFilter,
        }),
      ]);
      return { sessions, latest, activities };
    },
  });

  const latestByUser = useMemo(() => {
    const m = new Map<string, SessionRow>();
    (data?.latest ?? []).forEach((s) => {
      const prev = m.get(s.user_id);
      if (!prev || new Date(s.last_heartbeat_at) > new Date(prev.last_heartbeat_at)) m.set(s.user_id, s);
    });
    return m;
  }, [data?.latest]);

  const rows = useMemo(() => {
    const sessions = data?.sessions ?? [];
    return profiles
      .map((p) => {
        const mine = sessions.filter((s) => s.user_id === p.id);
        const last = latestByUser.get(p.id) ?? null;
        return {
          id: p.id,
          name: p.full_name ?? p.email ?? "Unknown",
          email: p.email ?? "",
          status: liveStatus(last),
          lastLogin: last?.login_at ?? null,
          lastActivity: last?.last_activity_at ?? null,
          logins: mine.length,
          active: mine.reduce((n, s) => n + s.active_duration, 0),
          idle: mine.reduce((n, s) => n + s.idle_duration, 0),
          total: mine.reduce((n, s) => n + Math.max(s.total_duration, s.active_duration + s.idle_duration), 0),
          currentPage: last?.current_page ?? null,
        };
      })
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.active - a.active);
  }, [profiles, data?.sessions, latestByUser, statusFilter, search]);

  const modules = useMemo(
    () => Array.from(new Set((data?.activities ?? []).map((a) => a.module))).sort(),
    [data?.activities],
  );

  const moduleUsage = useMemo(() => {
    const m = new Map<string, number>();
    (data?.activities ?? []).forEach((a) => m.set(a.module, (m.get(a.module) ?? 0) + a.duration));
    return Array.from(m, ([name, seconds]) => ({ name, minutes: Math.round(seconds / 60) }))
      .filter((d) => d.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8);
  }, [data?.activities]);

  const chartData = rows.slice(0, 8).map((r) => ({
    name: r.name.split(" ")[0],
    Active: Math.round(r.active / 60),
    Idle: Math.round(r.idle / 60),
  }));

  const totals = {
    employees: profiles.length,
    online: rows.filter((r) => r.status === "online").length,
    idle: rows.filter((r) => r.status === "idle").length,
    active: rows.reduce((n, r) => n + r.active, 0),
    idleTime: rows.reduce((n, r) => n + r.idle, 0),
  };
  const avgActive = rows.length ? totals.active / rows.length : 0;

  const exportData = rows.map((r) => ({
    Employee: r.name,
    Email: r.email,
    Status: r.status,
    "Last login": r.lastLogin ? new Date(r.lastLogin).toLocaleString() : "—",
    "Last activity": r.lastActivity ? new Date(r.lastActivity).toLocaleString() : "—",
    Logins: r.logins,
    "Active time": formatDuration(r.active),
    "Idle time": formatDuration(r.idle),
    "Session time": formatDuration(r.total),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Activity Monitoring</h1>
          <p className="text-sm text-muted-foreground">Live status, active vs idle time and module usage.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportRows(exportData, `activity-${date}`, "csv")}>
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRows(exportData, `activity-${date}`, "xlsx")}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPdf(`Employee activity — ${date}`, exportData)}>
            <FileText className="mr-1.5 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Total employees", value: String(totals.employees), icon: Users },
          { label: "Currently active", value: String(totals.online) },
          { label: "Currently idle", value: String(totals.idle) },
          { label: "Active time today", value: formatDuration(totals.active) },
          { label: "Idle time today", value: formatDuration(totals.idleTime) },
          { label: "Avg active / employee", value: formatDuration(avgActive) },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={employee} onValueChange={setEmployee}>
            <SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Activity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="online">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold">Active vs idle (minutes)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Active" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Idle" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold">Module usage (minutes)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={moduleUsage} dataKey="minutes" nameKey="name" outerRadius={90} label>
                  {moduleUsage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        {isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Logins</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Idle</TableHead>
                <TableHead className="text-right">Session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelected({ id: r.id, name: r.name })}
                >
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.currentPage ?? r.email}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs">{r.lastLogin ? new Date(r.lastLogin).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-xs">{r.lastActivity ? new Date(r.lastActivity).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.logins}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(r.active)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(r.idle)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(r.total)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No employees match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <EmployeeTimelineDialog
        userId={selected?.id ?? null}
        name={selected?.name ?? ""}
        date={date}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
