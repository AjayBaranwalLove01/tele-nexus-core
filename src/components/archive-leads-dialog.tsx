import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { invalidateLeadViews } from "@/lib/invalidate-leads";

export const ARCHIVE_REASONS = [
  "Completed", "Duplicate", "Invalid Lead", "Old Lead",
  "Customer Requested", "No Further Follow-up", "Other",
];

/** Admin-only manual archive. Nothing is archived until Confirm is pressed. */
export function ArchiveLeadsDialog({
  leadIds,
  trigger,
  onDone,
}: {
  leadIds: number[];
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("none");
  const [custom, setCustom] = useState("");
  const qc = useQueryClient();

  const archive = useMutation({
    mutationFn: async () => {
      const finalReason = reason === "none" ? null : reason === "Other" ? custom.trim() || "Other" : reason;
      const { data, error } = await supabase.rpc("archive_leads", {
        _ids: leadIds,
        _reason: finalReason,
      });
      if (error) throw error;
      return data as unknown as { archived: number; requested: number };
    },
    onSuccess: (res) => {
      toast.success(`${res.archived} lead${res.archived === 1 ? "" : "s"} moved to Archive`);
      setOpen(false);
      setReason("none");
      setCustom("");
      invalidateLeadViews(qc);
      qc.invalidateQueries({ queryKey: ["archive"] });
      onDone?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Archive failed"),
  });

  const many = leadIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Archive</DialogTitle>
          <DialogDescription>
            {many
              ? `You have selected ${leadIds.length} leads for archiving. This action will move only the selected leads to Archive.`
              : "You are about to move this lead to Archive. Archived leads will no longer be visible to normal users. Do you want to continue?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Archive reason (optional)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="No reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reason</SelectItem>
                {ARCHIVE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reason === "Other" && (
            <div className="space-y-1.5">
              <Label>Custom reason</Label>
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Write a reason..." />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => archive.mutate()} disabled={archive.isPending || leadIds.length === 0}>
            {archive.isPending ? "Archiving…" : many ? "Confirm Archive" : "Move to Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
