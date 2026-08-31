import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { AdminDashboard } from "@/components/admin-dashboard";
import { TelecallerDashboard } from "@/components/telecaller-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Oxo Lead Manager" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useMyProfile();
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  return data?.isAdmin ? <AdminDashboard /> : <TelecallerDashboard />;
}
