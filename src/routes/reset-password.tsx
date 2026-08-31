import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password — Oxo Lead Manager" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Recovery links arrive with #type=recovery; Supabase exchanges it for a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else if (window.location.hash.includes("type=recovery")) setReady(true);
      else setInvalid(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary grid place-items-center">
            <Phone className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold font-display">Oxo Lead Manager</span>
        </div>
        <h1 className="text-xl font-bold font-display">Set a new password</h1>
        {invalid ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This reset link is invalid or has expired. Go back to the sign-in page and request a new one.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            <div>
              <Label>New password</Label>
              <Input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input type="password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button className="w-full" disabled={loading || !ready}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
            </Button>
          </form>
        )}
        <Button variant="link" className="mt-4 w-full" onClick={() => navigate({ to: "/auth" })}>
          Back to sign in
        </Button>
      </Card>
    </div>
  );
}
