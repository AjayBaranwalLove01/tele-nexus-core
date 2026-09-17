import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useStatuses, useTemperatures, useTelecallers, STATUSES_KEY } from "@/hooks/use-meta";
import { useMyProfile } from "@/hooks/use-auth";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";

export function LeadQuickUpdate({ leadId, leadName }: { leadId: number; leadName: string | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();
  const { data: me } = useMyProfile();
  const isAdmin = !!me?.isAdmin;
  const { data: telecallers } = useTelecallers();

  const { data: lead } = useQuery({
    queryKey: ["lead-quick", leadId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("status_id,temperature_id,follow_up_date,follow_up_time,assigned_to")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: remarks } = useQuery({
    queryKey: ["remarks", leadId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_remarks")
        .select("id,remark,created_at,profiles:user_id(full_name)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [status, setStatus] = useState("");
  const [temp, setTemp] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [callDate, setCallDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [assignee, setAssignee] = useState("none");
  const [newStatus, setNewStatus] = useState("");

  const addStatus = useMutation({
    mutationFn: async (name: string) => {
      const nextOrder = (statuses?.length ?? 0) + 1;
      const { data, error } = await supabase
        .from("lead_statuses")
        .insert({ name, sort_order: nextOrder })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      toast.success("Status added");
      setStatus(s.id);
      setNewStatus("");
      qc.invalidateQueries({ queryKey: STATUSES_KEY });
    },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    if (lead) {
      setStatus(lead.status_id ?? "");
      setTemp(lead.temperature_id ?? "");
      setDate(lead.follow_up_date ?? "");
      setTime(lead.follow_up_time ?? "");
      setAssignee((lead as any).assigned_to ?? "none");
      setCallDate(new Date().toISOString().slice(0, 10));
      setRemark("");
    }
  }, [lead]);


  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, any> = {
        status_id: status || null,
        temperature_id: temp || null,
        follow_up_date: date || null,
        follow_up_time: time || null,
        call_date: callDate || new Date().toISOString().slice(0, 10),
      };
      if (isAdmin) {
        const next = assignee === "none" ? null : assignee;
        if (next !== ((lead as any)?.assigned_to ?? null)) {
          patch.assigned_to = next;
          patch.assigned_at = next ? new Date().toISOString() : null;
        }
      }
      const { error } = await supabase.from("leads").update(patch as any).eq("id", leadId);
      if (error) throw error;

      if (remark.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: re } = await supabase.from("lead_remarks").insert({
          lead_id: leadId, user_id: user!.id, remark: remark.trim(),
        });
        if (re) throw re;
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      invalidateLeadViews(qc, leadId);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><Pencil className="h-4 w-4" />Update</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update — {leadName || "Lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                if (v === "__add_new__") return;
                setStatus(v);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {statuses?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                {isAdmin && (
                  <SelectItem value="__add_new__" className="text-primary font-medium">+ Add new status…</SelectItem>
                )}
              </SelectContent>
            </Select>
            {isAdmin && (
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="New status name"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newStatus.trim()) addStatus.mutate(newStatus.trim());
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newStatus.trim() || addStatus.isPending}
                  onClick={() => addStatus.mutate(newStatus.trim())}
                >Add</Button>
              </div>
            )}
          </div>
          <div>
            <Label>Temperature</Label>
            <Select value={temp} onValueChange={setTemp}>
              <SelectTrigger><SelectValue placeholder="Select temperature" /></SelectTrigger>
              <SelectContent>{temps?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Call date</Label>
            <Input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} />
          </div>
          <div>
            <Label>Follow-up date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Follow-up time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {isAdmin && (
            <div className="md:col-span-2">
              <Label>Assigned telecaller</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Select telecaller" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned pool</SelectItem>
                  {telecallers?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.email ?? t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </div>
        <div>
          <Label>Add remark</Label>
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} placeholder="What happened on this call?" />
        </div>
        <div>
          <Label>Remark history</Label>
          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border">
            {(!remarks || remarks.length === 0) && (
              <div className="p-3 text-sm text-muted-foreground">No remarks yet.</div>
            )}
            {remarks?.map((r: any) => (
              <div key={r.id} className="border-b border-border p-3 last:border-b-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.profiles?.full_name ?? "Unknown"}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm">{r.remark}</div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" />Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
