import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTelecallers } from "@/hooks/use-meta";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";

export function AssignSelectedDialog({ leadIds, onDone }: { leadIds: number[]; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: telecallers } = useTelecallers();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  const assign = async () => {
    if (!assignee) { toast.error("Select a telecaller"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("assign_leads_by_ids", {
        _telecaller: assignee,
        _ids: leadIds,
      });
      if (error) throw error;
      const matched = (data as any)?.matched ?? 0;
      toast.success(`${matched} lead${matched === 1 ? "" : "s"} assigned`);
      setOpen(false);
      setAssignee("");
      onDone();
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-status-distribution"] });
    } catch (e: any) {
      toast.error(e.message ?? "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default"><UserCheck className="h-4 w-4" />Assign {leadIds.length}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {leadIds.length} selected lead(s)</DialogTitle>
          <DialogDescription>
            Choose a telecaller. The selected leads will be assigned to them immediately.
          </DialogDescription>
        </DialogHeader>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger><SelectValue placeholder="Select telecaller" /></SelectTrigger>
          <SelectContent>
            {telecallers?.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={assign} disabled={busy || !assignee}>
            {busy ? "Assigning…" : "Confirm & Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
