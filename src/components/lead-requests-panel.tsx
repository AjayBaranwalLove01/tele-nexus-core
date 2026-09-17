import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Inbox, Check, X } from "lucide-react";
import { toast } from "sonner";

type RequestRow = {
  id: string;
  telecaller_id: string;
  requested_count: number;
  status: string;
  approved_count: number | null;
  assigned_count: number | null;
  created_at: string;
  reviewed_at: string | null;
  name: string;
};

export function LeadRequestsPanel() {
  const qc = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["lead-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r) => r.telecaller_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
        : { data: [] as any[] };
      return (data ?? []).map((r) => {
        const p = (profs ?? []).find((x: any) => x.id === r.telecaller_id);
        return { ...r, name: p?.full_name || p?.email || "—" } as RequestRow;
      });
    },
  });

  const { data: poolCount = 0 } = useQuery({
    queryKey: ["unassigned-pool-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("leads").select("*", { count: "exact", head: true }).is("assigned_to", null);
      return count ?? 0;
    },
  });

  const approve = useMutation({
    mutationFn: async ({ id, count }: { id: string; count: number }) => {
      const { data, error } = await supabase.rpc("approve_lead_request", { _id: id, _count: count });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? `Approved — ${n} leads assigned` : "Approved, but the lead pool is empty");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reject_lead_request", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Request rejected"); qc.invalidateQueries({ queryKey: ["lead-requests"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const history = (requests ?? []).filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-semibold flex items-center gap-2">
          <Inbox className="h-4 w-4" />Lead Requests
          {pending.length > 0 && <Badge variant="secondary">{pending.length} pending</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{poolCount} leads in unassigned pool</div>
      </div>

      {isLoading ? <Skeleton className="h-24" /> : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending requests.</p>
      ) : (
        <div className="grid gap-2">
          {pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  Requested {r.requested_count} leads · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <ApproveDialog
                  name={r.name}
                  defaultCount={r.requested_count}
                  pending={approve.isPending}
                  onApprove={(count) => approve.mutate({ id: r.id, count })}
                />
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
                  <X className="h-4 w-4" />Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Recent decisions</div>
          <div className="grid gap-1 text-sm">
            {history.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 text-muted-foreground">
                <span>{r.name} · asked {r.requested_count}</span>
                <span>
                  {r.status === "approved"
                    ? `approved ${r.approved_count} · assigned ${r.assigned_count}`
                    : "rejected"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ApproveDialog({ name, defaultCount, onApprove, pending }: {
  name: string; defaultCount: number; onApprove: (count: number) => void; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>(defaultCount);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setCount(defaultCount); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Check className="h-4 w-4" />Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve request from {name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Leads to assign</Label>
          <Input type="number" min={1} value={count || ""} onChange={(e) => setCount(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">They asked for {defaultCount}. You can assign any number.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !count || count < 1}
            onClick={() => { onApprove(count); setOpen(false); }}>Approve & Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
