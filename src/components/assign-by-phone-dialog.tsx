import { useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTelecallers, useSettings } from "@/hooks/use-meta";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";

export function AssignByPhoneDialog() {
  const qc = useQueryClient();
  const { data: telecallers } = useTelecallers();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [phones, setPhones] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: settings } = useSettings();
  const enforce10 = (settings as any)?.enforce_10_digit_phone ?? true;

  const onFile = async (f: File | null) => {
    setPhones([]); setRejected([]); setFileName("");
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const list: string[] = [];
      const bad: string[] = [];
      for (const r of rows) {
        const keys = Object.keys(r);
        const key = keys.find((k) => /phone|mobile|number|contact/i.test(k)) ?? keys[0];
        const v = String(r[key] ?? "").trim();
        const digits = v.replace(/\D/g, "");
        if (!digits) continue;
        if (enforce10 && digits.length !== 10) { bad.push(v); continue; }
        list.push(v);
      }
      setPhones(Array.from(new Set(list)));
      setRejected(Array.from(new Set(bad)));
      setFileName(f.name);
      if (!list.length) toast.error("No valid phone numbers found in the file");
    } catch (e: any) {
      toast.error(e.message ?? "Could not read file");
    }
  };

  const submit = async () => {
    if (!assignee) return toast.error("Choose a telecaller");
    if (!phones.length) return toast.error("Upload a file with phone numbers");
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("assign_leads_by_phone", {
        _telecaller: assignee,
        _phones: phones,
      });
      if (error) throw error;
      const matched = (data as any)?.matched ?? 0;
      toast.success(`${matched} of ${phones.length} lead(s) assigned`);
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setOpen(false); setPhones([]); setFileName(""); setAssignee("");
    } catch (e: any) {
      toast.error(e.message ?? "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserCheck className="h-4 w-4" /> Assign by phone list</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign leads from a phone list</DialogTitle>
          <DialogDescription>
            Upload an Excel/CSV file with a phone number column. Matching leads are assigned to the chosen telecaller.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Telecaller</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Select telecaller" /></SelectTrigger>
              <SelectContent>
                {telecallers?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.email ?? t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="assign-file">Phone numbers file</Label>
            <Input id="assign-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {fileName && (
              <div className="text-sm text-muted-foreground">
                {fileName} · <Badge variant="outline">{phones.length} number(s)</Badge>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !phones.length || !assignee}>
            {busy ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
