import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useMyProfile } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { clearAuthSession } from "@/integrations/supabase/auth-storage";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data, isLoading } = useMyProfile();
  const profile = data?.profile as { is_approved?: boolean; is_active?: boolean } | null | undefined;

  if (!isLoading && profile && (profile.is_approved === false || profile.is_active === false)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">Waiting for approval</h1>
          <p className="text-sm text-muted-foreground">
            Your account has been created but an administrator still needs to approve it and assign your role.
            You'll get access as soon as that's done.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              clearAuthSession();
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
