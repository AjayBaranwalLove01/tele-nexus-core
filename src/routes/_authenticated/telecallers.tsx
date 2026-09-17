import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Send, UserPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-meta";
import { createTelecaller, deleteTelecaller } from "@/lib/telecallers.functions";
import { LeadRequestsPanel } from "@/components/lead-requests-panel";

export const Route = createFileRoute("/_authenticated/telecallers")({
  head: () => ({ meta: [{ title: "Telecallers — Oxo Lead Manager" }] }),
  component: TelecallersPage,
});

function TelecallersPage() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [perCaller, setPerCaller] = useState<number>(0);
  const createFn = useServerFn(createTelecaller);
  const deleteFn = useServerFn(deleteTelecaller);

  const { data: callers, isLoading } = useQuery({
    queryKey: ["telecallers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "telecaller");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      const stats = await Promise.all(ids.map(async (uid) => {
        const [assigned, completed] = await Promise.all([
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("assigned_to", uid).is("archived_at", null).is("completed_at", null),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("assigned_to", uid).is("archived_at", null).not("completed_at", "is", null),
        ]);
        return { uid, active: assigned.count ?? 0, completed: completed.count ?? 0 };
      }));
      return (profs ?? []).map((p) => ({ ...p, ...stats.find((s) => s.uid === p.id)! }));
    },
  });

  const distribute = useMutation({
    mutationFn: async (n: number) => {
      const { data, error } = await supabase.rpc("distribute_leads", { _per_caller: n });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d: any) => { toast.success(`Distributed ${d.total} leads`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const recall = useMutation({
    mutationFn: async (uid?: string) => {
      const { data, error } = await supabase.rpc("recall_unused_leads", uid ? { _telecaller: uid } : {});
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Recalled ${n} unused leads`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["telecallers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const editName = useMutation({
    mutationFn: async ({ id, full_name }: { id: string; full_name: string }) => {
      const { error } = await supabase.from("profiles").update({ full_name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["telecallers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; password: string; full_name: string }) =>
      createFn({ data: input }),
    onSuccess: () => { toast.success("Telecaller added"); qc.invalidateQueries({ queryKey: ["telecallers"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to add"),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => { toast.success("Telecaller deleted"); qc.invalidateQueries({ queryKey: ["telecallers"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telecallers</h1>
          <p className="text-sm text-muted-foreground">Manage telecallers and distribute leads.</p>
        </div>
        <AddTelecallerDialog onCreate={(v) => createMut.mutate(v)} pending={createMut.isPending} />
      </div>

      <LeadRequestsPanel />

      <Card className="p-5">
        <div className="font-semibold mb-3 flex items-center gap-2"><Send className="h-4 w-4"/>Bulk Distribute</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Leads per telecaller</Label>
            <Input type="number" min={1} placeholder={String(settings?.leads_per_telecaller ?? 50)} value={perCaller || ""} onChange={(e)=>setPerCaller(Number(e.target.value))} className="w-40"/>
          </div>
          <Button onClick={()=>distribute.mutate(perCaller || settings?.leads_per_telecaller || 50)} disabled={distribute.isPending}>
            Distribute Now
          </Button>
          <Button variant="outline" onClick={()=>recall.mutate(undefined)} disabled={recall.isPending}>
            <RotateCcw className="h-4 w-4"/>Recall All Unused
          </Button>
        </div>
      </Card>

      {isLoading ? <Skeleton className="h-64"/> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Active leads</th>
                <th className="p-3">Completed</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {callers?.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3 font-medium">{c.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="p-3 tabular-nums">{c.active}</td>
                  <td className="p-3 tabular-nums">{c.completed}</td>
                  <td className="p-3"><Switch checked={c.is_active} onCheckedChange={(v)=>toggleActive.mutate({id:c.id, active:v})}/></td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <EditTelecallerDialog
                        id={c.id}
                        name={c.full_name ?? ""}
                        onSave={(full_name) => editName.mutate({ id: c.id, full_name })}
                      />
                      <Button size="sm" variant="ghost" onClick={()=>recall.mutate(c.id)}>Recall</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4"/>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete telecaller?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes {c.full_name || c.email}. Their leads will be unassigned and returned to the pool.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={()=>deleteMut.mutate(c.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {callers?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No telecallers yet. Click "Add Telecaller" to create one.</td></tr>}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function AddTelecallerDialog({ onCreate, pending }: { onCreate: (v: { email: string; password: string; full_name: string }) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = () => {
    if (!full_name || !email || password.length < 8) {
      toast.error("Name, email, and 8+ char password required");
      return;
    }
    onCreate({ full_name, email, password });
    setOpen(false);
    setName(""); setEmail(""); setPassword("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4"/>Add Telecaller</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Telecaller</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={full_name} onChange={(e)=>setName(e.target.value)}/></div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></div>
          <div><Label>Temporary password</Label><Input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="At least 8 characters"/></div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTelecallerDialog({ id, name, onSave }: { id: string; name: string; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(name);
  return (
    <Dialog open={open} onOpenChange={(o)=>{ setOpen(o); if (o) setVal(name); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil className="h-4 w-4"/></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit telecaller</DialogTitle></DialogHeader>
        <div><Label>Full name</Label><Input value={val} onChange={(e)=>setVal(e.target.value)}/></div>
        <DialogFooter>
          <Button onClick={()=>{ onSave(val); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
