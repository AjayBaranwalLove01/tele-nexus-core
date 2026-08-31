import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageCircle, ArrowLeft, Save } from "lucide-react";
import { useStatuses, useTemperatures } from "@/hooks/use-meta";
import { statusColor, tempColor, formatDate } from "@/lib/lead-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({ meta: [{ title: "Lead — Oxo Lead Manager" }] }),
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();
  const leadId = Number(id);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*,lead_statuses(name),lead_temperatures(name)").eq("id", leadId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: remarks } = useQuery({
    queryKey: ["remarks", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_remarks")
        .select("*,profiles:user_id(full_name)").eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [status, setStatus] = useState<string>("");
  const [temp, setTemp] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (lead) {
      setStatus(lead.status_id ?? "");
      setTemp(lead.temperature_id ?? "");
      setDate(lead.follow_up_date ?? "");
      setTime(lead.follow_up_time ?? "");
    }
  }, [lead]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").update({
        status_id: status || null,
        temperature_id: temp || null,
        follow_up_date: date || null,
        follow_up_time: time || null,
      }).eq("id", leadId);
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
      toast.success("Saved");
      setRemark("");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["remarks", leadId] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !lead) return <Skeleton className="h-96" />;
  const wa = lead.phone_number?.replace(/\D/g, "");

  return (
    <div className="space-y-4 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/leads" })}><ArrowLeft className="h-4 w-4"/>Back</Button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{lead.name || "Unnamed lead"}</h1>
            <div className="text-muted-foreground mt-1">{lead.phone_number || "No phone"}</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {lead.lead_statuses?.name && <Badge variant="outline" className={statusColor(lead.lead_statuses.name)}>{lead.lead_statuses.name}</Badge>}
              {lead.lead_temperatures?.name && <Badge variant="outline" className={tempColor(lead.lead_temperatures.name)}>{lead.lead_temperatures.name}</Badge>}
            </div>
          </div>
          {lead.phone_number && (
            <div className="flex gap-2">
              <Button asChild><a href={`tel:${lead.phone_number}`}><Phone className="h-4 w-4"/>Call</a></Button>
              {wa && <Button asChild variant="outline"><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4"/>WhatsApp</a></Button>}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-semibold">Update</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Select status"/></SelectTrigger>
              <SelectContent>{statuses?.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Temperature</Label>
            <Select value={temp} onValueChange={setTemp}>
              <SelectTrigger><SelectValue placeholder="Select temperature"/></SelectTrigger>
              <SelectContent>{temps?.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Next follow-up date</Label><Input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></div>
          <div><Label>Time</Label><Input type="time" value={time} onChange={(e)=>setTime(e.target.value)}/></div>
        </div>
        <div><Label>Add remark</Label><Textarea value={remark} onChange={(e)=>setRemark(e.target.value)} rows={3} placeholder="What happened on this call?"/></div>
        <Button onClick={()=>save.mutate()} disabled={save.isPending}><Save className="h-4 w-4"/>Save</Button>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Activity Timeline</div>
        <div className="space-y-3">
          {remarks?.length === 0 && <div className="text-sm text-muted-foreground">No remarks yet.</div>}
          {remarks?.map((r: any) => (
            <div key={r.id} className="border-l-2 border-primary pl-3">
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.profiles?.full_name ?? "—"}</div>
              <div className="text-sm mt-0.5 whitespace-pre-wrap">{r.remark}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
