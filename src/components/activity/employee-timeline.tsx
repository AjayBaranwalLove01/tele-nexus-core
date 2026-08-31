import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dayBounds, fetchActivities, fetchSessions } from "@/lib/activity/queries";
import { formatDuration } from "@/lib/activity/constants";

type Props = {
  userId: string | null;
  name: string;
  date: string;
  onOpenChange: (open: boolean) => void;
};

export function EmployeeTimelineDialog({ userId, name, date, onOpenChange }: Props) {
  const bounds = dayBounds(date);
  const { data, isLoading } = useQuery({
    queryKey: ["employee-timeline", userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const [sessions, activities] = await Promise.all([
        fetchSessions(bounds.from, bounds.to, userId!),
        fetchActivities({ from: bounds.from, to: bounds.to, userId: userId! }),
      ]);
      return { sessions, activities };
    },
  });

  const sessions = data?.sessions ?? [];
  const activities = [...(data?.activities ?? [])].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  const active = sessions.reduce((n, s) => n + s.active_duration, 0);
  const idle = sessions.reduce((n, s) => n + s.idle_duration, 0);
  const login = sessions.reduce((n, s) => n + Math.max(s.total_duration, s.active_duration + s.idle_duration), 0);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <Dialog open={!!userId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {name} · {new Date(date).toLocaleDateString()}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Login duration", value: formatDuration(login) },
                { label: "Active time", value: formatDuration(active) },
                { label: "Idle time", value: formatDuration(idle) },
              ].map((m) => (
                <Card key={m.label} className="p-3">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{m.value}</div>
                </Card>
              ))}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">Sessions</h3>
              {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions on this day.</p>}
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
                    <Badge variant="outline">{time(s.login_at)} → {s.logout_at ? time(s.logout_at) : "open"}</Badge>
                    <span className="text-muted-foreground">{s.browser} · {s.os} · {s.device_info}</span>
                    <span className="ml-auto text-muted-foreground">{s.ip_address ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">Activity timeline</h3>
              {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded.</p>}
              <ol className="relative space-y-3 border-l pl-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{time(a.started_at)}</span>
                      <span className="font-medium">{a.module}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">{a.activity_type.replace("_", " ")}</Badge>
                      {a.duration > 0 && (
                        <span className="text-xs text-muted-foreground">{formatDuration(a.duration)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
