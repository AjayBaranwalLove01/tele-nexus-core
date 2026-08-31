import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMyProfile } from "@/hooks/use-auth";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "User Access — Oxo Lead Manager" },
      { name: "description", content: "Approve new accounts and assign admin or telecaller roles in Oxo Lead Manager." },
      { property: "og:title", content: "User Access — Oxo Lead Manager" },
      { property: "og:description", content: "Approve new accounts and assign roles for your calling team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  is_approved: boolean;
  role: "admin" | "telecaller" | null;
};

function UsersPage() {
  const qc = useQueryClient();
  const { data: me } = useMyProfile();

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users"],
    enabled: !!me?.isAdmin,
    queryFn: async (): Promise<Row[]> => {
      const [{ data: profs, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,is_active,is_approved").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (error) throw error;
      return (profs ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role ?? null,
      }));
    },
  });

  const setApproved = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_approved: approved, is_active: approved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Access updated"); qc.invalidateQueries({ queryKey: ["all-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "telecaller" }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", id);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["all-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!me?.isAdmin) {
    return <Card className="p-8 text-center text-muted-foreground">Admins only.</Card>;
  }

  const pending = users?.filter((u) => !u.is_approved) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Access</h1>
        <p className="text-sm text-muted-foreground">Approve new sign-ups and assign roles.</p>
      </div>

      {pending.length > 0 && (
        <Card className="p-4 border-primary/40">
          <div className="font-semibold flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4" />{pending.length} account(s) waiting for approval</div>
          <p className="text-sm text-muted-foreground">They can sign in but cannot use the app until you approve them below.</p>
        </Card>
      )}

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Approved</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-3 font-medium">
                      {u.full_name || "—"}
                      {u.id === me.profile?.id && <Badge variant="outline" className="ml-2">You</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{u.email || "—"}</td>
                    <td className="p-3">
                      <Select
                        value={u.role ?? undefined}
                        onValueChange={(v) => setRole.mutate({ id: u.id, role: v as "admin" | "telecaller" })}
                        disabled={u.id === me.profile?.id}
                      >
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="No role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="telecaller">Telecaller</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={u.is_approved}
                        disabled={u.id === me.profile?.id}
                        onCheckedChange={(v) => setApproved.mutate({ id: u.id, approved: v })}
                      />
                    </td>
                    <td className="p-3 text-right">
                      {!u.is_approved && (
                        <Button size="sm" onClick={() => setApproved.mutate({ id: u.id, approved: true })}>
                          Approve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {users?.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
