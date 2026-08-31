import { createFileRoute } from "@tanstack/react-router";
import { useMyProfile } from "@/hooks/use-auth";
import { AdminActivityDashboard } from "@/components/activity/admin-activity-dashboard";
import { MyActivity } from "@/components/activity/my-activity";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Monitoring — LeadFlow CRM" },
      { name: "description", content: "Track employee login sessions, active vs idle time, module usage and audit history." },
      { property: "og:title", content: "Activity Monitoring — LeadFlow CRM" },
      { property: "og:description", content: "Track employee login sessions, active vs idle time, module usage and audit history." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { data, isLoading } = useMyProfile();
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  return data?.isAdmin ? <AdminActivityDashboard /> : <MyActivity />;
}
