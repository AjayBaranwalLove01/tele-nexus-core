import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History, ArrowUpDown, UserPlus, Repeat, PhoneCall, MessageSquare,
  CalendarClock, CheckCircle2, RotateCcw, Sparkles, Download, UserMinus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { exportRows } from "@/lib/activity/export";

export type HistoryRow = {
  id: number;
  lead_id: number;
  activity_type: string;
  activity_date: string;
  created_at: string;
  performed_by_name: string | null;
  telecaller_name: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_assigned_name: string | null;
  new_assigned_name: string | null;
  remarks: string | null;
  follow_up_date: string | null;
  call_date: string | null;
  activity_source: string;
};

const META: Record<string, { label: string; icon: typeof History; cls: string }> = {
  lead_created: { label: "Lead created", icon: Sparkles, cls: "text-primary" },
  assigned: { label: "Assigned", icon: UserPlus, cls: "text-primary" },
  reassigned: { label: "Reassigned", icon: Repeat, cls: "text-amber-600" },
  unassigned: { label: "Unassigned", icon: UserMinus, cls: "text-muted-foreground" },
  call_logged: { label: "Call logged", icon: PhoneCall, cls: "text-emerald-600" },
  remark_added: { label: "Remark added", icon: MessageSquare, cls: "text-sky-600" },
  status_changed: { label: "Status changed", icon: ArrowUpDown, cls: "text-violet-600" },
  followup_set: { label: "Follow-up set", icon: CalendarClock, cls: "text-amber-600" },
  completed: { label: "Completed", icon: CheckCircle2, cls: "text-emerald-600" },
  reopened: { label: "Reopened", icon: RotateCcw, cls: "text-amber-600" },
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function LeadHistoryTimeline({ leadId }: { leadId: number }) {
  const [newestFirst, setNewestFirst] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["lead-history", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activity_history")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const { data: journey } = useQuery({
    queryKey: ["lead-journey", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lead_journey", { _lead_id: leadId });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const rows = [...(data ?? [])];
  if (!newestFirst) rows.reverse();

  const statusJourney = (journey?.["status_journey"] as string[] | null) ?? [];

  return (
    <div className="space-y-4">
      {journey && (
        <div className="rounded-lg border p-3 text-xs grid gap-2 sm:grid-cols-3">
          <div><span className="text-muted-foreground">Total activities: </span><b>{String(journey["total_activities"] ?? 0)}</b></div>
          <div><span className="text-muted-foreground">Calls / remarks: </span><b>{String(journey["total_calls"] ?? 0)}</b></div>
          <div><span className="text-muted-foreground">Follow-ups set: </span><b>{String(journey["total_followups"] ?? 0)}</b></div>
          <div><span className="text-muted-foreground">First activity: </span><b>{journey["first_activity"] ? when(String(journey["first_activity"])) : "—"}</b></div>
          <div><span className="text-muted-foreground">Last activity: </span><b>{journey["last_activity"] ? when(String(journey["last_activity"])) : "—"}</b></div>
          <div><span className="text-muted-foreground">Current owner: </span><b>{String(journey["final_telecaller"] ?? "—")}</b></div>
          {statusJourney.length > 0 && (
            <div className="sm:col-span-3 flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Status journey:</span>
              {statusJourney.map((s, i) => (
                <span key={`${s}-${i}`} className="flex items-center gap-1">
                  <Badge variant="outline">{s}</Badge>
                  {i < statusJourney.length - 1 && <span className="text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{rows.length} history record{rows.length === 1 ? "" : "s"}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewestFirst((v) => !v)}>
            <ArrowUpDown className="h-4 w-4" />{newestFirst ? "Newest first" : "Oldest first"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportRows(
                rows.map((r) => ({
                  "Date/Time": when(r.created_at),
                  Activity: META[r.activity_type]?.label ?? r.activity_type,
                  By: r.performed_by_name ?? "",
                  Telecaller: r.telecaller_name ?? "",
                  "Previous status": r.previous_status ?? "",
                  "New status": r.new_status ?? "",
                  "Previous assignee": r.previous_assigned_name ?? "",
                  "New assignee": r.new_assigned_name ?? "",
                  "Follow-up": r.follow_up_date ?? "",
                  "Call date": r.call_date ?? "",
                  Remark: r.remarks ?? "",
                  Source: r.activity_source,
                })),
                `lead-${leadId}-history`,
                "xlsx",
              )
            }
          >
            <Download className="h-4 w-4" />Export
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No history yet.</div>}
        {rows.map((r) => {
          const m = META[r.activity_type] ?? { label: r.activity_type, icon: History, cls: "text-muted-foreground" };
          const Icon = m.icon;
          return (
            <div key={r.id} className="flex gap-3 border-l-2 border-border pl-3">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${m.cls}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{m.label}</span>
                  {r.activity_source === "migration" && <Badge variant="secondary" className="text-[10px]">initial record</Badge>}
                  <span className="text-xs text-muted-foreground">{when(r.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.performed_by_name ? `By ${r.performed_by_name}` : "By system"}
                  {r.telecaller_name ? ` · Telecaller: ${r.telecaller_name}` : ""}
                </div>
                {(r.previous_status || r.new_status) && r.activity_type === "status_changed" && (
                  <div className="text-xs mt-1">Status: <b>{r.previous_status ?? "—"}</b> → <b>{r.new_status ?? "—"}</b></div>
                )}
                {(r.previous_assigned_name || r.new_assigned_name) && r.activity_type !== "status_changed" && (
                  <div className="text-xs mt-1">Owner: <b>{r.previous_assigned_name ?? "—"}</b> → <b>{r.new_assigned_name ?? "—"}</b></div>
                )}
                {r.follow_up_date && r.activity_type === "followup_set" && (
                  <div className="text-xs mt-1">Follow-up: <b>{r.follow_up_date}</b></div>
                )}
                {r.call_date && r.activity_type === "call_logged" && (
                  <div className="text-xs mt-1">Call date: <b>{r.call_date}</b></div>
                )}
                {r.remarks && <div className="text-sm mt-1 whitespace-pre-wrap">{r.remarks}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeadHistoryDialog({ leadId, leadName }: { leadId: number; leadName?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><History className="h-4 w-4" />History</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lead history — {leadName || `#${leadId}`}</DialogTitle>
        </DialogHeader>
        {open && <LeadHistoryTimeline leadId={leadId} />}
      </DialogContent>
    </Dialog>
  );
}
