import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadLeadTemplate } from "@/lib/lead-template";
import { AddLeadDialog } from "@/components/add-lead-dialog";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import Leads — LeadFlow CRM" }] }),
  component: ImportPage,
});

const CHUNK = 2000;

function ImportPage() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<{ total: number; inserted: number; duplicates: number } | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: async () => {
      const { data } = await supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const run = async () => {
    if (!file) return;
    setRunning(true); setProgress(0); setReport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      const normalized = rows.map((r) => {
        const keys = Object.keys(r);
        const nameKey = keys.find((k) => /name/i.test(k));
        const phoneKey = keys.find((k) => /phone|mobile|number/i.test(k));
        return {
          name: nameKey ? String(r[nameKey]).trim() : "",
          phone: phoneKey ? String(r[phoneKey]).trim() : "",
        };
      });

      const { data: { user } } = await supabase.auth.getUser();
      const { data: job, error: jobErr } = await supabase.from("import_jobs").insert({
        created_by: user!.id, filename: file.name, total_rows: normalized.length, status: "running", started_at: new Date().toISOString(),
      }).select().single();
      if (jobErr) throw jobErr;

      let inserted = 0, dups = 0, total = 0;
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const slice = normalized.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("bulk_insert_leads", { _rows: slice, _job_id: job.id });
        if (error) throw error;
        const res = data as any;
        total += res.total; inserted += res.inserted; dups += res.duplicates;
        setProgress(Math.round(((i + slice.length) / normalized.length) * 100));
      }

      await supabase.from("import_jobs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", job.id);
      setReport({ total, inserted, duplicates: dups });
      toast.success(`Imported ${inserted.toLocaleString()} leads`);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Leads</h1>
          <p className="text-sm text-muted-foreground">Upload Excel (.xlsx) or CSV with Name and Phone Number columns. Both fields are optional.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadLeadTemplate}>
            <Download className="h-4 w-4" /> Sample template
          </Button>
          <AddLeadDialog />
        </div>
      </div>


      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} className="max-w-sm mx-auto" />
          {file && <div className="mt-2 text-sm text-muted-foreground">{file.name} · {(file.size/1024).toFixed(1)} KB</div>}
        </div>
        {running && <Progress value={progress} />}
        <Button onClick={run} disabled={!file || running} size="lg" className="w-full">
          <Upload className="h-4 w-4"/> {running ? `Importing... ${progress}%` : "Start Import"}
        </Button>
        {report && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-semibold">{report.total.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Inserted</div><div className="text-xl font-semibold text-success">{report.inserted.toLocaleString()}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-xl font-semibold text-warning">{report.duplicates.toLocaleString()}</div></div>
          </div>
        )}
      </Card>

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
    </div>
  );
}
