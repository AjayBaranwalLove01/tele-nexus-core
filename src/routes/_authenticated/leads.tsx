import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Phone, MessageCircle, Search, Trash2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useStatuses, useTemperatures, useTelecallers } from "@/hooks/use-meta";
import { useMyProfile } from "@/hooks/use-auth";
import { followupBadge, statusColor, tempColor, formatDate, toTitleCase } from "@/lib/lead-utils";
import { LeadQuickUpdate } from "@/components/lead-quick-update";
import { AddLeadDialog } from "@/components/add-lead-dialog";
import { AssignSelectedDialog } from "@/components/assign-selected-dialog";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Oxo Lead Manager" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { data: me } = useMyProfile();
  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState<string>("all");
  const [tempId, setTempId] = useState<string>("all");
  const [scope, setScope] = useState<string>("all");
  const [assignedTo, setAssignedTo] = useState<string>("all");
  const [callDateFilter, setCallDateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("updated_at:desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoValue, setGotoValue] = useState("");

  const { data: telecallers } = useTelecallers();

  const sortColumn = sortBy.split(":")[0] || "updated_at";
  const sortAsc = sortBy.split(":")[1] === "asc";

  const resetPage = () => setPage(1);

  const { data, isLoading } = useQuery({
    queryKey: ["leads-list", search, statusId, tempId, scope, assignedTo, page, pageSize, me?.profile?.id],
    queryFn: async () => {
      let q = supabase.from("leads")
        .select("id,name,phone_number,email,city,lead_received_date,follow_up_date,assigned_to,status_id,temperature_id,lead_statuses(name),lead_temperatures(name),profiles:assigned_to(full_name)", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (statusId !== "all") q = q.eq("status_id", statusId);
      if (tempId !== "all") q = q.eq("temperature_id", tempId);
      if (assignedTo !== "all") q = q.eq("assigned_to", assignedTo);
      if (scope === "mine" && me?.profile?.id) q = q.eq("assigned_to", me.profile.id);
      if (scope === "unassigned") q = q.is("assigned_to", null);
      if (search.trim()) q = q.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const qc = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const rows: any[] = data?.rows ?? [];
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const removeLeads = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} lead${n === 1 ? "" : "s"} deleted`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const [exporting, setExporting] = useState(false);
  const exportLeads = async () => {
    setExporting(true);
    try {
      const PAGE = 1000;
      const rows: any[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from("leads")
          .select("id,name,phone_number,email,city,lead_received_date,call_date,follow_up_date,follow_up_time,remarks_count,last_remark,assigned_at,completed_at,lead_statuses(name),lead_temperatures(name),profiles:assigned_to(full_name)")
          .order("id")
          .range(from, from + PAGE - 1);
        if (statusId !== "all") q = q.eq("status_id", statusId);
        if (tempId !== "all") q = q.eq("temperature_id", tempId);
        if (assignedTo !== "all") q = q.eq("assigned_to", assignedTo);
        if (scope === "mine" && me?.profile?.id) q = q.eq("assigned_to", me.profile.id);
        if (scope === "unassigned") q = q.is("assigned_to", null);
        if (search.trim()) q = q.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      if (rows.length === 0) { toast.info("No leads to export"); return; }
      const sheet = rows.map((l: any) => ({
        "Lead ID": l.id,
        "Name": toTitleCase(l.name) ?? "",
        "Phone": l.phone_number ?? "",
        "Email": l.email ?? "",
        "City": toTitleCase(l.city) ?? "",
        "Status": l.lead_statuses?.name ?? "",
        "Temperature": l.lead_temperatures?.name ?? "",
        "Assigned To": l.profiles?.full_name ?? "",
        "Received Date": l.lead_received_date ?? "",
        "Call Date": l.call_date ?? "",
        "Follow-up Date": l.follow_up_date ?? "",
        "Follow-up Time": l.follow_up_time ?? "",
        "Remarks Count": l.remarks_count ?? 0,
        "Last Remark": l.last_remark ?? "",
        "Completed": l.completed_at ? "Yes" : "No",
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Leads");
      XLSX.writeFile(wb, `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${rows.length.toLocaleString()} leads`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and manage leads.</p>
        </div>
        <div className="flex gap-2">
          {me?.isAdmin && (
            <Button variant="outline" onClick={exportLeads} disabled={exporting}>
              <Download className="h-4 w-4" />{exporting ? "Exporting…" : "Download Excel"}
            </Button>
          )}
          {me?.isAdmin && selected.length > 0 && (
            <AssignSelectedDialog leadIds={selected} onDone={() => setSelected([])} />
          )}
          {me?.isAdmin && selected.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="h-4 w-4" />Delete {selected.length}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selected.length} lead(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the selected leads and their remarks. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeLeads.mutate(selected)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {me?.isAdmin && <AddLeadDialog />}
        </div>
      </div>

      <Card className="p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name or phone..." value={search} onChange={(e)=>{ setSearch(e.target.value); resetPage(); }} />
        </div>
        <Select value={statusId} onValueChange={(v) => { setStatusId(v); resetPage(); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses?.map((s)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tempId} onValueChange={(v) => { setTempId(v); resetPage(); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Temp"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All temps</SelectItem>
            {temps?.map((t)=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {me?.isAdmin && (
          <Select value={assignedTo} onValueChange={(v) => { setAssignedTo(v); resetPage(); }}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Assigned to"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All telecallers</SelectItem>
              {telecallers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {me?.isAdmin && (
          <Select value={scope} onValueChange={(v) => { setScope(v); resetPage(); }}>
            <SelectTrigger className="w-[160px]"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All leads</SelectItem>
              <SelectItem value="unassigned">Unassigned pool</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Card>

      {isLoading ? <Skeleton className="h-96"/> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  {me?.isAdmin && (
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        aria-label="Select all leads"
                        onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id as number) : [])}
                      />
                    </th>
                  )}
                  <th className="p-3">Received</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Temp</th>
                  <th className="p-3">Follow-up</th>
                  <th className="p-3">Assigned</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l: any) => {
                  const fu = followupBadge(l.follow_up_date);
                  const wa = l.phone_number?.replace(/\D/g, "");
                  return (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      {me?.isAdmin && (
                        <td className="p-3">
                          <Checkbox
                            checked={selected.includes(l.id)}
                            aria-label={`Select ${l.name || "lead"}`}
                            onCheckedChange={(v) =>
                              setSelected((prev) => (v ? [...prev, l.id] : prev.filter((id) => id !== l.id)))
                            }
                          />
                        </td>
                      )}
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(l.lead_received_date)}</td>
                      <td className="p-3">
                        <Link to="/leads/$id" params={{id:String(l.id)}} className="font-medium hover:underline">
                          {l.name || "Unnamed"}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{l.phone_number || "—"}</td>
                      <td className="p-3 text-muted-foreground">{l.email || "—"}</td>
                      <td className="p-3 text-muted-foreground">{l.city || "—"}</td>
                      <td className="p-3">{l.lead_statuses?.name && <Badge variant="outline" className={statusColor(l.lead_statuses.name)}>{l.lead_statuses.name}</Badge>}</td>
                      <td className="p-3">{l.lead_temperatures?.name && <Badge variant="outline" className={tempColor(l.lead_temperatures.name)}>{l.lead_temperatures.name}</Badge>}</td>
                      <td className="p-3"><Badge variant="outline" className={fu.cls}>{fu.label}</Badge> <span className="text-xs text-muted-foreground">{formatDate(l.follow_up_date)}</span></td>
                      <td className="p-3 text-muted-foreground">{l.profiles?.full_name ?? "—"}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end items-center">
                          {l.phone_number && <Button asChild size="sm" variant="ghost"><a href={`tel:${l.phone_number}`}><Phone className="h-4 w-4"/></a></Button>}
                          {wa && <Button asChild size="sm" variant="ghost"><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4"/></a></Button>}
                          <LeadQuickUpdate leadId={l.id} leadName={l.name} />
                          {me?.isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {l.name || "This lead"} and its remarks will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeLeads.mutate([l.id])}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={me?.isAdmin ? 11 : 10} className="p-10 text-center text-muted-foreground">No leads found.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} leads
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); resetPage(); }}>
              <SelectTrigger className="w-[80px]"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <span className="text-sm px-2">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="w-[80px]"
              placeholder="Go to"
              value={gotoValue}
              onChange={(e) => setGotoValue(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const p = Number(gotoValue);
                  if (p >= 1 && p <= totalPages) { setPage(p); setGotoValue(""); }
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const p = Number(gotoValue);
                if (p >= 1 && p <= totalPages) { setPage(p); setGotoValue(""); }
              }}
            >Go</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
