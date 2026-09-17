import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { useStatuses, useTelecallers } from "@/hooks/use-meta";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { RotateCcw, Search } from "lucide-react";
import { formatDate, statusColor } from "@/lib/lead-utils";
import { invalidateLeadViews } from "@/lib/invalidate-leads";

export const Route = createFileRoute("/_authenticated/archive")({
  head: () => ({
    meta: [
      { title: "Lead Archive — Oxo Lead Manager" },
      { name: "description", content: "Admin archive of manually archived leads with search, reports and restore." },
      { property: "og:title", content: "Lead Archive — Oxo Lead Manager" },
      { property: "og:description", content: "Search, report on and restore archived leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const { data: me, isLoading: meLoading } = useMyProfile();
  const { data: statuses } = useStatuses();
  const { data: telecallers } = useTelecallers();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusName, setStatusName] = useState("all");
  const [telecaller, setTelecaller] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["archive", "list", search, statusName, telecaller, from, to],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      let q = supabase
        .from("lead_archive")
        .select("*")
        .is("restored_at", null)
        .order("archived_at", { ascending: false })
        .limit(1000);
      if (statusName !== "all") q = q.eq("status_name", statusName);
      if (telecaller !== "all") q = q.eq("assigned_to", telecaller);
      if (from) q = q.gte("archived_at", `${from}T00:00:00Z`);
      if (to) q = q.lte("archived_at", `${to}T23:59:59Z`);
      const term = search.trim();
      if (term) {
        const asId = Number(term.replace(/\D/g, ""));
        const parts = [`name.ilike.%${term}%`, `phone_number.ilike.%${term.replace(/\D/g, "")}%`];
        if (!Number.isNaN(asId) && asId > 0) parts.push(`lead_id.eq.${asId}`);
        q = q.or(parts.join(","));
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["archive", "stats"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const monthStart = `${today.slice(0, 7)}-01`;
      const [total, todayC, monthC, restored] = await Promise.all([
        supabase.from("lead_archive").select("*", { count: "exact", head: true }).is("restored_at", null),
        supabase.from("lead_archive").select("*", { count: "exact", head: true }).is("restored_at", null).gte("archived_at", `${today}T00:00:00Z`),
        supabase.from("lead_archive").select("*", { count: "exact", head: true }).is("restored_at", null).gte("archived_at", `${monthStart}T00:00:00Z`),
        supabase.from("lead_archive").select("*", { count: "exact", head: true }).not("restored_at", "is", null),
      ]);
      return {
        total: total.count ?? 0,
        today: todayC.count ?? 0,
        month: monthC.count ?? 0,
        restored: restored.count ?? 0,
      };
    },
  });

  const rows = data ?? [];

  const byStatus = useMemo(() => tally(rows, (r) => r.status_name ?? "—"), [rows]);
  const byTelecaller = useMemo(() => tally(rows, (r) => r.assigned_name ?? "Unassigned"), [rows]);
  const byReason = useMemo(() => tally(rows, (r) => r.archive_reason ?? "No reason"), [rows]);

  const restore = useMutation({
    mutationFn: async (ids: number[]) => {
      const { data, error } = await supabase.rpc("restore_leads", { _ids: ids });
      if (error) throw error;
      return data as unknown as { restored: number };
    },
    onSuccess: (res) => {
      toast.success(`${res.restored} lead${res.restored === 1 ? "" : "s"} restored to Active Leads`);
      setSelected([]);
      invalidateLeadViews(qc);
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Restore failed"),
  });

  if (meLoading) return <Skeleton className="h-96" />;
  if (!me?.isAdmin) {
    return <Card className="p-10 text-center text-muted-foreground">The Archive is available to administrators only.</Card>;
  }

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
          <p className="text-sm text-muted-foreground">Manually archived leads, reports and restore.</p>
        </div>
        {selected.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button><RotateCcw className="h-4 w-4" />Restore {selected.length}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore {selected.length} lead(s) back to Active Leads?</AlertDialogTitle>
                <AlertDialogDescription>
                  Only the selected leads are restored. All their history is preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => restore.mutate(selected)}>Restore</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total archived leads" value={stats?.total} />
        <StatCard label="Archived today" value={stats?.today} />
        <StatCard label="Archived this month" value={stats?.month} />
        <StatCard label="Total restored leads" value={stats?.restored} />
      </div>

      <Card className="p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, phone or lead ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusName} onValueChange={setStatusName}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses?.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={telecaller} onValueChange={setTelecaller}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Telecaller" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All telecallers</SelectItem>
            {telecallers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Archived from" />
        <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Archived to" />
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Archived leads by status" data={byStatus} />
        <ChartCard title="Archived leads by telecaller" data={byTelecaller} />
        <ChartCard title="Archived leads by reason" data={byReason} />
        <Card className="p-4">
          <div className="font-semibold mb-2">Status-wise archive report</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Status</th><th className="py-1 text-right">Archived leads</th></tr></thead>
            <tbody>
              {byStatus.map((s) => (
                <tr key={s.name} className="border-t"><td className="py-1.5">{s.name}</td><td className="py-1.5 text-right tabular-nums">{s.value}</td></tr>
              ))}
              {byStatus.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">No archived leads for these filters.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      {isLoading ? <Skeleton className="h-96" /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={allSelected}
                      aria-label="Select all archived leads"
                      onCheckedChange={(v) => setSelected(v ? rows.map((r: any) => r.lead_id as number) : [])}
                    />
                  </th>
                  <th className="p-3">Lead ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Telecaller</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Archived</th>
                  <th className="p-3">Archived by</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <Checkbox
                        checked={selected.includes(r.lead_id)}
                        aria-label={`Select ${r.name || "lead"}`}
                        onCheckedChange={(v) =>
                          setSelected((p) => (v ? [...p, r.lead_id] : p.filter((id) => id !== r.lead_id)))
                        }
                      />
                    </td>
                    <td className="p-3 text-muted-foreground">{r.lead_id}</td>
                    <td className="p-3 font-medium">{r.name || "Unnamed"}</td>
                    <td className="p-3 text-muted-foreground">{r.phone_number || "—"}</td>
                    <td className="p-3 text-muted-foreground">{r.city || "—"}</td>
                    <td className="p-3">{r.status_name && <Badge variant="outline" className={statusColor(r.status_name)}>{r.status_name}</Badge>}</td>
                    <td className="p-3 text-muted-foreground">{r.assigned_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(r.lead_received_date)}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(r.archived_at)}</td>
                    <td className="p-3 text-muted-foreground">{r.archived_by_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{r.archive_reason ?? "—"}</td>
                    <td className="p-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost"><RotateCcw className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restore this lead back to Active Leads?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {r.name || "This lead"} returns to Active Leads with its full history.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => restore.mutate([r.lead_id])}>Restore</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">No archived leads found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function tally(rows: any[], key: (r: any) => string) {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const k = key(r);
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value ?? "—"}</div>
    </Card>
  );
}

function ChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Card className="p-4">
      <div className="font-semibold mb-2">{title}</div>
      {data.length === 0 ? (
        <div className="h-[220px] grid place-items-center text-sm text-muted-foreground">No data for these filters.</div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fillOpacity: 0.1 }} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
