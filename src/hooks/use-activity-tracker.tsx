import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuthSession } from "@/hooks/use-auth";
import { startTracking, trackPageChange } from "@/lib/activity/tracker";

export function useActivityTracker() {
  const { user } = useAuthSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user?.id) return;
    void startTracking(user.id, pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void trackPageChange(pathname);
  }, [pathname, user?.id]);
}
