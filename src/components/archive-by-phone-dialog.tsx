import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { ArchiveLeadsDialog } from "@/components/archive-leads-dialog";
import { formatDate, statusColor } from "@/lib/lead-utils";

/** Admin-only: find active leads by phone number and archive the selected ones. */
export function ArchiveByPhoneDialog() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 4) { toast.error("Enter at least 4 digits"); return; }
    // Normalise: match on the local part so +91XXXXXXXXXX and XXXXXXXXXX both hit.
    const needle = digits.length > 10 ? digits.slice(-10) : digits;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone_number,email,city,lead_received_date,call_date,follow_up_date,updated_at,lead_statuses(name),profiles:assigned_to(full_name)")
        .is("archived_at", null)
        .ilike("phone_number", `%${needle}%`)
        .order("id")
        .limit(50);
      if (error) throw error;
      setRows(data ?? []);
      setSelected([]);
      if ((data ?? []).length === 0) toast.info("No active lead found for that number");
    } catch (e: any) {
      toast.error(e.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const reset = () => { setPhone(""); setRows(null); setSelected([]); };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Search className="h-4 w-4" />Archive by Phone</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Archive by Phone Number</DialogTitle>
          <DialogDescription>
            Search active leads by phone number, then select exactly which record(s) to archive.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="98XXXXXXXX or +9198XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          />
          <Button onClick={search} disabled={searching}>{searching ? "Searching…" : "Search"}</Button>
        </div>

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {rows.length} matching active lead{rows.length === 1 ? "" : "s"}. Select the ones to archive.
            </div>
            <div className="max-h-[320px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Telecaller</th>
                    <th className="p-2">Created</th>
                    <th className="p-2">Last activity</th>
                    <th className="p-2">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.includes(l.id)}
                          aria-label={`Select ${l.name || "lead"}`}
                          onCheckedChange={(v) =>
                            setSelected((p) => (v ? [...p, l.id] : p.filter((id) => id !== l.id)))
                          }
                        />
                      </td>
                      <td className="p-2 font-medium">{l.name || "Unnamed"}</td>
                      <td className="p-2">{l.phone_number}</td>
                      <td className="p-2">
                        {l.lead_statuses?.name && (
                          <Badge variant="outline" className={statusColor(l.lead_statuses.name)}>
                            {l.lead_statuses.name}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{l.profiles?.full_name ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{formatDate(l.lead_received_date)}</td>
                      <td className="p-2 text-muted-foreground">{formatDate(l.updated_at)}</td>
                      <td className="p-2 text-muted-foreground">{formatDate(l.follow_up_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Clear</Button>
              <ArchiveLeadsDialog
                leadIds={selected}
                onDone={() => { setOpen(false); reset(); }}
                trigger={
                  <Button disabled={selected.length === 0}>
                    Move to Archive{selected.length ? ` (${selected.length})` : ""}
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
