import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/hooks/use-auth";
import { dayBounds, fetchActivities, fetchSessions } from "@/lib/activity/queries";
import { formatDuration } from "@/lib/activity/constants";

export function MyActivity() {
  const { user } = useAuthSession();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const bounds = dayBounds(date);

  const { data, isLoading } = useQuery({
    queryKey: ["my-activity", user?.id, date],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [sessions, activities] = await Promise.all([
        fetchSessions(bounds.from, bounds.to, user!.id),
        fetchActivities({ from: bounds.from, to: bounds.to, userId: user!.id }),
      ]);
      return { sessions, activities };
    },
  });

  const sessions = data?.sessions ?? [];
  const active = sessions.reduce((n, s) => n + s.active_duration, 0);
  const idle = sessions.reduce((n, s) => n + s.idle_duration, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Activity</h1>
          <p className="text-sm text-muted-foreground">Your own sessions and work time.</p>
        </div>
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Logins", value: String(sessions.length) },
          { label: "Active time", value: formatDuration(active) },
          { label: "Idle time", value: formatDuration(idle) },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold">Timeline</h2>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ol className="relative space-y-3 border-l pl-5">
            {[...(data?.activities ?? [])]
              .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
              .map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(a.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium">{a.module}</span>
                    <Badge variant="secondary" className="text-[10px] uppercase">{a.activity_type.replace("_", " ")}</Badge>
                    {a.duration > 0 && <span className="text-xs text-muted-foreground">{formatDuration(a.duration)}</span>}
                  </div>
                </li>
              ))}
            {(data?.activities ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No activity recorded for this day.</p>
            )}
          </ol>
        )}
      </Card>
    </div>
  );
}
