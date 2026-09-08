import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, FileSpreadsheet, Download, Trash2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadLeadTemplate } from "@/lib/lead-template";
import { toTitleCase } from "@/lib/lead-utils";
import { AddLeadDialog } from "@/components/add-lead-dialog";
import { useMyProfile } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-meta";
import { AssignByPhoneDialog } from "@/components/assign-by-phone-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpdateLeadsFromExcel } from "@/components/update-leads-from-excel";


export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import Leads — Oxo Lead Manager" }] }),
  component: ImportPage,
});

const CHUNK = 2000;

type Row = { name: string; phone: string; email: string; city: string; received_date: string };
type Preview = {
  valid: Row[];
  duplicates: Row[];
  skipped: Row[];
  badPhone: Row[];
  total: number;
};

function ImportPage() {
  const qc = useQueryClient();
  const { data: me } = useMyProfile();
  const { data: settings } = useSettings();
  const enforce10 = (settings as any)?.enforce_10_digit_phone ?? true;
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<{ total: number; inserted: number; duplicates: number; failed: number } | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: async () => {
      const { data } = await supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const parseFile = async (f: File): Promise<Row[]> => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

    const toISODate = (v: any) => {
      if (v === null || v === undefined || String(v).trim() === "") return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "number") {
        const d = XLSX.SSF.parse_date_code(v);
        if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
      const s = String(v).trim();
      const parsed = new Date(s);
      return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
    };

    return rows.map((r) => {
      const keys = Object.keys(r);
      const nameKey = keys.find((k) => /name/i.test(k));
      const phoneKey = keys.find((k) => /phone|mobile/i.test(k)) ?? keys.find((k) => /number/i.test(k) && !/date/i.test(k));
      const emailKey = keys.find((k) => /e-?mail/i.test(k));
      const cityKey = keys.find((k) => /city|town|location/i.test(k));
      const dateKey = keys.find((k) => /date/i.test(k));
      return {
        name: nameKey ? toTitleCase(String(r[nameKey])) : "",
        phone: phoneKey ? String(r[phoneKey]).trim() : "",
        email: emailKey ? String(r[emailKey]).trim() : "",
        city: cityKey ? toTitleCase(String(r[cityKey])) : "",
        received_date: dateKey ? toISODate(r[dateKey]) : "",
      };
    });
  };

  const fetchExistingPhones = async () => {
    const set = new Set<string>();
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase.from("leads").select("phone_number").range(from, from + page - 1);
      if (error) throw error;
      (data ?? []).forEach((r: any) => r.phone_number && set.add(String(r.phone_number).trim()));
      if (!data || data.length < page) break;
    }
    return set;
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true); setReport(null); setPreview(null);
    try {
      const rows = await parseFile(file);
      const existing = await fetchExistingPhones();
      const seen = new Set<string>();
      const valid: Row[] = [], duplicates: Row[] = [], skipped: Row[] = [], badPhone: Row[] = [];
      for (const r of rows) {
        if (!r.name.trim() || !r.phone.trim()) { skipped.push(r); continue; }
        if (enforce10 && r.phone.replace(/\D/g, "").length !== 10) { badPhone.push(r); continue; }
        if (existing.has(r.phone) || seen.has(r.phone)) { duplicates.push(r); continue; }
        seen.add(r.phone);
        valid.push(r);
      }
      setPreview({ valid, duplicates, skipped, badPhone, total: rows.length });
    } catch (e: any) {
      toast.error(e.message ?? "Could not read file");
    } finally {
      setAnalyzing(false);
    }
  };

  const run = async () => {
    if (!file || !preview) return;
    setRunning(true); setProgress(0); setReport(null);
    try {
      const normalized = preview.valid;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: job, error: jobErr } = await supabase.from("import_jobs").insert({
        created_by: user!.id, filename: file.name, total_rows: preview.total, status: "running", started_at: new Date().toISOString(),
      }).select().single();
      if (jobErr) throw jobErr;

      let inserted = 0, dups = preview.duplicates.length, failed = preview.skipped.length;
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const slice = normalized.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("bulk_insert_leads", { _rows: slice, _job_id: job.id });
        if (error) throw error;
        const res = data as any;
        inserted += res.inserted; dups += res.duplicates;
        setProgress(Math.round(((i + slice.length) / Math.max(normalized.length, 1)) * 100));
      }

      await supabase.from("import_jobs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", job.id);
      setReport({ total: preview.total, inserted, duplicates: dups, failed });
      setPreview(null);
      toast.success(`Imported ${inserted.toLocaleString()} leads`);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["leads-list"] });
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setRunning(false);
    }
  };

  const deleteAll = async () => {
    try {
      const { error } = await supabase.from("leads").delete().gt("id", 0);
      if (error) throw error;
      toast.success("All leads deleted");
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  const PreviewTable = ({ rows, title }: { rows: Row[]; title: string }) => (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title} <Badge variant="outline">{rows.length.toLocaleString()}</Badge></div>
      {rows.length > 0 && (
        <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="p-2">Received</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Email</th><th className="p-2">City</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 text-muted-foreground">{r.received_date || "Today"}</td>
                  <td className="p-2">{r.name || "—"}</td>
                  <td className="p-2">{r.phone || "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.email || "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.city || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 0 && <div className="p-2 text-xs text-muted-foreground">Showing all {rows.length.toLocaleString()} records.</div>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Leads</h1>
          <p className="text-sm text-muted-foreground">Upload Excel (.xlsx) or CSV with Lead Received Date, Name, Phone Number, Email and City columns. Preview the data, then confirm to insert.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadLeadTemplate}>
            <Download className="h-4 w-4" /> Sample template
          </Button>
          <AddLeadDialog />
          {me?.isAdmin && <AssignByPhoneDialog />}

          {me?.isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="h-4 w-4" /> Delete all leads</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete every lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes all leads and their remarks from the database. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteAll}>Delete all</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">Import new leads</TabsTrigger>
          <TabsTrigger value="update">Update existing leads</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6 mt-4">
      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e)=>{ setFile(e.target.files?.[0] ?? null); setPreview(null); setReport(null); }} className="max-w-sm mx-auto" />
          {file && <div className="mt-2 text-sm text-muted-foreground">{file.name} · {(file.size/1024).toFixed(1)} KB</div>}
          <div className="mt-4 mx-auto max-w-md rounded-md bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Excel column format (header row):</div>
            <div className="font-mono">Lead Received Date | Name | Phone Number | Email | City</div>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li><span className="font-medium text-foreground">Name</span> and <span className="font-medium text-foreground">Phone Number</span> are mandatory — rows missing either are skipped.</li>
              <li>Lead Received Date is optional (defaults to today). Use YYYY-MM-DD format.</li>
              <li>Email and City are optional.</li>
              <li>Download the <span className="font-medium text-foreground">Sample template</span> above to start from the correct format.</li>
            </ul>
          </div>
        </div>
        {running && <Progress value={progress} />}
        {!preview ? (
          <Button onClick={analyze} disabled={!file || analyzing} size="lg" className="w-full">
            <Eye className="h-4 w-4" /> {analyzing ? "Analyzing..." : "Preview data"}
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={run} disabled={running || preview.valid.length === 0} size="lg" className="flex-1">
              <Upload className="h-4 w-4" /> {running ? `Importing... ${progress}%` : `Confirm & import ${preview.valid.length.toLocaleString()}`}
            </Button>
            <Button variant="outline" size="lg" onClick={() => setPreview(null)} disabled={running}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        )}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-semibold">{report.total.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Inserted</div><div className="text-xl font-semibold text-success">{report.inserted.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-xl font-semibold text-warning">{report.duplicates.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Skipped (missing name/phone)</div><div className="text-xl font-semibold text-destructive">{report.failed.toLocaleString()}</div></div>
          </div>
        )}
      </Card>

      {preview && (
        <Card className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Rows in file</div><div className="text-xl font-semibold">{preview.total.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">To insert</div><div className="text-xl font-semibold text-success">{preview.valid.length.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-xl font-semibold text-warning">{preview.duplicates.length.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Skipped (missing name/phone)</div><div className="text-xl font-semibold text-destructive">{preview.skipped.length.toLocaleString()}</div></div>
          </div>
          <PreviewTable rows={preview.valid} title="Will be inserted" />
          <PreviewTable rows={preview.duplicates} title="Duplicates (skipped)" />
          <PreviewTable rows={preview.skipped} title="Skipped — missing name or phone" />
          {enforce10 && <PreviewTable rows={preview.badPhone} title="Rejected — phone number is not 10 digits" />}
        </Card>
      )}

      <Card className="p-5">
        <div className="font-semibold mb-3">Recent imports</div>
        <div className="space-y-2">
          {jobs?.length === 0 && <div className="text-sm text-muted-foreground">No imports yet.</div>}
          {jobs?.map((j: any) => (
            <div key={j.id} className="flex items-center justify-between text-sm border-b pb-2">
              <div>
                <div className="font-medium">{j.filename}</div>
                <div className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div>{j.inserted_rows.toLocaleString()} / {j.total_rows.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{j.duplicate_rows} dupes · {j.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="update" className="mt-4">
          <UpdateLeadsFromExcel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
