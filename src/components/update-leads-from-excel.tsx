import { useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileSpreadsheet, Eye, Upload, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useStatuses, useTelecallers } from "@/hooks/use-meta";
import { useMyProfile } from "@/hooks/use-auth";
import { formatDate, toTitleCase } from "@/lib/lead-utils";

type RawRow = { rowNo: number; phone: string; status: string; callDate: string; caller: string };

type Change = {
  rowNo: number;
  phone: string;
  leadId: number;
  existingStatus: string | null;
  newStatus: string | null;
  newStatusId: string | null;
  existingCallDate: string | null;
  newCallDate: string | null;
  existingCaller: string | null;
  newCaller: string | null;
  newCallerId: string | null;
  changed: { status: boolean; callDate: boolean; caller: boolean };
};

type Reject = { rowNo: number; phone: string; reason: string; raw: RawRow };

type Review = {
  total: number;
  found: number;
  ready: Change[];
  noChange: Change[];
  notFound: Reject[];
  invalid: Reject[];
  duplicates: Reject[];
};

const digits = (v: string) => v.replace(/\D/g, "");

const toISODate = (v: any): string => {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "INVALID" : parsed.toISOString().slice(0, 10);
};

export function UpdateLeadsFromExcel() {
  const qc = useQueryClient();
  const { data: me } = useMyProfile();
  const { data: statuses } = useStatuses();
  const { data: telecallers } = useTelecallers();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ total: number; updated: number; noChange: number; notFound: number; invalid: number; failed: Reject[] } | null>(null);

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true); setReview(null); setResult(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (!rows.length) throw new Error("The file has no data rows");

      const keys = Object.keys(rows[0]);
      const phoneKey = keys.find((k) => /phone|mobile|contact/i.test(k));
      const statusKey = keys.find((k) => /status/i.test(k));
      const dateKey = keys.find((k) => /call/i.test(k) && /date/i.test(k)) ?? keys.find((k) => /date/i.test(k));
      const callerKey = keys.find((k) => /caller|telecaller|assigned|agent/i.test(k));
      const missing = [
        !phoneKey && "Phone Number", !statusKey && "Status",
        !dateKey && "Calling Date", !callerKey && "Caller Name",
      ].filter(Boolean);
      if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}`);

      const raw: RawRow[] = rows.map((r, i) => ({
        rowNo: i + 2,
        phone: String(r[phoneKey!] ?? "").trim(),
        status: String(r[statusKey!] ?? "").trim(),
        callDate: String(toISODate(r[dateKey!])),
        caller: String(r[callerKey!] ?? "").trim(),
      }));

      // existing leads
      const leadMap = new Map<string, any>();
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase
          .from("leads").select("id,phone_number,status_id,call_date,assigned_to")
          .range(from, from + page - 1);
        if (error) throw error;
        (data ?? []).forEach((l: any) => {
          const d = digits(String(l.phone_number ?? ""));
          if (d && !leadMap.has(d)) leadMap.set(d, l);
        });
        if (!data || data.length < page) break;
      }

      const statusById = new Map((statuses ?? []).map((s: any) => [s.id, s.name]));
      const statusByName = new Map((statuses ?? []).map((s: any) => [String(s.name).toLowerCase(), s]));
      const callerById = new Map((telecallers ?? []).map((t: any) => [t.id, t.full_name ?? t.email]));
      const callerByName = new Map<string, any>();
      (telecallers ?? []).forEach((t: any) => {
        if (t.full_name) callerByName.set(String(t.full_name).toLowerCase(), t);
        if (t.email) callerByName.set(String(t.email).toLowerCase(), t);
      });

      const ready: Change[] = [], noChange: Change[] = [];
      const notFound: Reject[] = [], invalid: Reject[] = [], duplicates: Reject[] = [];
      const seen = new Set<string>();

      for (const r of raw) {
        const d = digits(r.phone);
        if (!d || d.length < 6) { invalid.push({ rowNo: r.rowNo, phone: r.phone, reason: "Invalid or missing phone number", raw: r }); continue; }
        if (seen.has(d)) { duplicates.push({ rowNo: r.rowNo, phone: r.phone, reason: "Duplicate phone number in the file — only the first row is used", raw: r }); continue; }
        seen.add(d);

        if (r.callDate === "INVALID") { invalid.push({ rowNo: r.rowNo, phone: r.phone, reason: "Calling date could not be read", raw: r }); continue; }
        const st = r.status ? statusByName.get(r.status.toLowerCase()) : null;
        if (r.status && !st) { invalid.push({ rowNo: r.rowNo, phone: r.phone, reason: `Unknown status "${r.status}"`, raw: r }); continue; }
        const cl = r.caller ? callerByName.get(r.caller.toLowerCase()) : null;
        if (r.caller && !cl) { invalid.push({ rowNo: r.rowNo, phone: r.phone, reason: `Caller "${r.caller}" not found in the team`, raw: r }); continue; }
        if (r.caller && cl && !me?.isAdmin) { invalid.push({ rowNo: r.rowNo, phone: r.phone, reason: "Only an admin can change the caller", raw: r }); continue; }

        const lead = leadMap.get(d);
        if (!lead) { notFound.push({ rowNo: r.rowNo, phone: r.phone, reason: "No lead with this phone number", raw: r }); continue; }

        const change: Change = {
          rowNo: r.rowNo, phone: r.phone, leadId: lead.id,
          existingStatus: statusById.get(lead.status_id) ?? null,
          newStatus: st ? st.name : null,
          newStatusId: st ? st.id : null,
          existingCallDate: lead.call_date ?? null,
          newCallDate: r.callDate || null,
          existingCaller: callerById.get(lead.assigned_to) ?? null,
          newCaller: cl ? (cl.full_name ?? cl.email) : null,
          newCallerId: cl ? cl.id : null,
          changed: {
            status: !!st && st.id !== lead.status_id,
            callDate: !!r.callDate && r.callDate !== (lead.call_date ?? null),
            caller: !!cl && cl.id !== lead.assigned_to,
          },
        };
        if (change.changed.status || change.changed.callDate || change.changed.caller) ready.push(change);
        else noChange.push(change);
      }

      setReview({ total: raw.length, found: ready.length + noChange.length, ready, noChange, notFound, invalid, duplicates });
    } catch (e: any) {
      toast.error(e.message ?? "Could not read the file");
    } finally {
      setAnalyzing(false);
    }
  };

  const runUpdate = async () => {
    if (!review) return;
    setRunning(true); setProgress(0);
    const failed: Reject[] = [];
    let updated = 0;
    for (let i = 0; i < review.ready.length; i++) {
      const c = review.ready[i];
      const patch: { status_id?: string | null; call_date?: string | null; assigned_to?: string | null; assigned_at?: string | null } = {};
      if (c.changed.status) patch.status_id = c.newStatusId;
      if (c.changed.callDate) patch.call_date = c.newCallDate;
      if (c.changed.caller) { patch.assigned_to = c.newCallerId; patch.assigned_at = new Date().toISOString(); }
      const { error } = await supabase.from("leads").update(patch).eq("id", c.leadId);
      if (error) failed.push({ rowNo: c.rowNo, phone: c.phone, reason: error.message, raw: { rowNo: c.rowNo, phone: c.phone, status: c.newStatus ?? "", callDate: c.newCallDate ?? "", caller: c.newCaller ?? "" } });
      else updated++;
      setProgress(Math.round(((i + 1) / review.ready.length) * 100));
    }
    setResult({
      total: review.total, updated, noChange: review.noChange.length,
      notFound: review.notFound.length, invalid: review.invalid.length + review.duplicates.length, failed,
    });
    setReview(null); setRunning(false);
    toast.success(`${updated.toLocaleString()} lead(s) updated`);
    qc.invalidateQueries({ queryKey: ["leads-list"] });
    qc.invalidateQueries({ queryKey: ["my-leads"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const Cell = ({ from, to, changed }: { from: string | null; to: string | null; changed: boolean }) => (
    <td className={`p-2 ${changed ? "font-medium text-success" : "text-muted-foreground"}`}>
      {changed ? <>{from ?? "—"} <span className="text-muted-foreground">→</span> {to ?? "—"}</> : (from ?? "—")}
    </td>
  );

  const ChangeTable = ({ rows }: { rows: Change[] }) => (
    rows.length === 0 ? <div className="text-sm text-muted-foreground p-2">Nothing here.</div> : (
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="text-left"><th className="p-2">Phone</th><th className="p-2">Status</th><th className="p-2">Calling date</th><th className="p-2">Caller</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.rowNo} className="border-t">
                <td className="p-2">{c.phone}</td>
                <Cell from={c.existingStatus} to={c.newStatus} changed={c.changed.status} />
                <Cell from={formatDate(c.existingCallDate)} to={formatDate(c.newCallDate)} changed={c.changed.callDate} />
                <Cell from={c.existingCaller} to={c.newCaller} changed={c.changed.caller} />
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 0 && <div className="p-2 text-xs text-muted-foreground">Showing all {rows.length.toLocaleString()} records.</div>}
      </div>
    )
  );

  const RejectTable = ({ rows }: { rows: Reject[] }) => (
    rows.length === 0 ? <div className="text-sm text-muted-foreground p-2">Nothing here.</div> : (
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="text-left"><th className="p-2">Row</th><th className="p-2">Phone</th><th className="p-2">Status</th><th className="p-2">Calling date</th><th className="p-2">Caller</th><th className="p-2">Reason</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.rowNo}-${i}`} className="border-t">
                <td className="p-2 text-muted-foreground">{r.rowNo}</td>
                <td className="p-2">{r.phone || "—"}</td>
                <td className="p-2 text-muted-foreground">{r.raw.status || "—"}</td>
                <td className="p-2 text-muted-foreground">{r.raw.callDate || "—"}</td>
                <td className="p-2 text-muted-foreground">{toTitleCase(r.raw.caller) || "—"}</td>
                <td className="p-2 text-destructive">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 0 && <div className="p-2 text-xs text-muted-foreground">Showing all {rows.length.toLocaleString()} records.</div>}
      </div>
    )
  );

  const Stat = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${tone ?? ""}`}>{value.toLocaleString()}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <Input type="file" accept=".xlsx,.xls,.csv" className="max-w-sm mx-auto"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReview(null); setResult(null); }} />
          <div className="mt-2 text-xs text-muted-foreground">
            Required columns: Phone Number, Status, Calling Date, Caller Name. Leads are matched by phone number — no new leads are created.
          </div>
          {file && <div className="mt-2 text-sm text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(1)} KB</div>}
        </div>
        {running && <Progress value={progress} />}
        {!review ? (
          <Button onClick={analyze} disabled={!file || analyzing} size="lg" className="w-full">
            <Eye className="h-4 w-4" /> {analyzing ? "Checking file..." : "Review changes"}
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="lg" className="flex-1" disabled={running || review.ready.length === 0} onClick={() => setConfirmOpen(true)}>
              <Upload className="h-4 w-4" /> {running ? `Updating... ${progress}%` : `Confirm & update ${review.ready.length.toLocaleString()}`}
            </Button>
            <Button variant="outline" size="lg" onClick={() => setReview(null)} disabled={running}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        )}
      </Card>

      {review && (
        <Card className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Rows in file" value={review.total} />
            <Stat label="Leads found" value={review.found} />
            <Stat label="Will update" value={review.ready.length} tone="text-success" />
            <Stat label="No changes" value={review.noChange.length} />
            <Stat label="Not found" value={review.notFound.length} tone="text-warning" />
            <Stat label="Invalid / duplicate" value={review.invalid.length + review.duplicates.length} tone="text-destructive" />
          </div>
          <Tabs defaultValue="ready">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="ready">Ready to update <Badge variant="outline" className="ml-2">{review.ready.length}</Badge></TabsTrigger>
              <TabsTrigger value="same">No changes <Badge variant="outline" className="ml-2">{review.noChange.length}</Badge></TabsTrigger>
              <TabsTrigger value="missing">Lead not found <Badge variant="outline" className="ml-2">{review.notFound.length}</Badge></TabsTrigger>
              <TabsTrigger value="bad">Invalid / duplicate <Badge variant="outline" className="ml-2">{review.invalid.length + review.duplicates.length}</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="ready" className="mt-3"><ChangeTable rows={review.ready} /></TabsContent>
            <TabsContent value="same" className="mt-3"><ChangeTable rows={review.noChange} /></TabsContent>
            <TabsContent value="missing" className="mt-3"><RejectTable rows={review.notFound} /></TabsContent>
            <TabsContent value="bad" className="mt-3"><RejectTable rows={[...review.invalid, ...review.duplicates]} /></TabsContent>
          </Tabs>
        </Card>
      )}

      {result && (
        <Card className="p-5 space-y-4">
          <div className="font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Update completed</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat label="Rows in file" value={result.total} />
            <Stat label="Updated" value={result.updated} tone="text-success" />
            <Stat label="No changes" value={result.noChange} />
            <Stat label="Not found" value={result.notFound} tone="text-warning" />
            <Stat label="Invalid / duplicate" value={result.invalid} tone="text-destructive" />
          </div>
          {result.failed.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-destructive">Failed updates ({result.failed.length})</div>
              <RejectTable rows={result.failed} />
            </div>
          )}
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update {review?.ready.length.toLocaleString()} lead(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes the status, calling date and caller shown in the review. Leads that were not found or are invalid stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runUpdate}>Confirm & update</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
