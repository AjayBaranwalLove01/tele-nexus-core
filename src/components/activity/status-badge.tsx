import { cn } from "@/lib/utils";
import type { LiveStatus } from "@/lib/activity/queries";

const MAP: Record<LiveStatus, { label: string; dot: string; text: string }> = {
  online: { label: "Active", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  idle: { label: "Idle", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  offline: { label: "Offline", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

export function StatusBadge({ status, className }: { status: LiveStatus; className?: string }) {
  const s = MAP[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.text, className)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot, status === "online" && "animate-pulse")} />
      {s.label}
    </span>
  );
}
