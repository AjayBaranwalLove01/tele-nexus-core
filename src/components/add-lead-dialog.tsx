import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStatuses, useTemperatures } from "@/hooks/use-meta";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export function AddLeadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusId, setStatusId] = useState("default");
  const [tempId, setTempId] = useState("none");
  const [assignee, setAssignee] = useState("none");
  const [followUp, setFollowUp] = useState("");

  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();

  const { data: telecallers } = useQuery({
    queryKey: ["telecaller-options"],
    enabled: open,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "telecaller");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids).eq("is_active", true);
      return data ?? [];
    },
  });

  const reset = () => {
    setName(""); setPhone(""); setEmail(""); setCity("");
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setStatusId("default"); setTempId("none"); setAssignee("none"); setFollowUp("");
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    setSaving(true);
    try {
      const { data: dupe } = await supabase.from("leads").select("id").eq("phone_number", phone.trim()).maybeSingle();
      if (dupe) throw new Error("A lead with this phone number already exists");
      const defaultStatus = statuses?.find((s: any) => s.is_default)?.id ?? null;
      const { error } = await supabase.from("leads").insert({
        name: toTitleCase(name),
        phone_number: phone.trim(),
        email: email.trim() || null,
        city: toTitleCase(city) || null,
        lead_received_date: receivedDate || new Date().toISOString().slice(0, 10),
        status_id: statusId === "default" ? defaultStatus : statusId,
        temperature_id: tempId === "none" ? null : tempId,
        assigned_to: assignee === "none" ? null : assignee,
        assigned_at: assignee === "none" ? null : new Date().toISOString(),
        follow_up_date: followUp || null,
      });
      if (error) throw error;
      toast.success("Lead added");
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UserPlus className="h-4 w-4" /> Add Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add lead manually</DialogTitle>
          <DialogDescription>Create a single lead without importing a file.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lead-received">Lead received date</Label>
            <Input id="lead-received" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lead-name">Name *</Label>
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={120} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lead-phone">Phone number *</Label>
            <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" maxLength={20} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" maxLength={255} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lead-city">City</Label>
              <Input id="lead-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" maxLength={100} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {statuses?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Temperature</Label>
              <Select value={tempId} onValueChange={setTempId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {temps?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned pool</SelectItem>
                  {telecallers?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lead-fu">Follow-up date</Label>
              <Input id="lead-fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
