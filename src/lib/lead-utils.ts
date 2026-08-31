export const tempColor = (name?: string | null) => {
  switch (name?.toLowerCase()) {
    case "hot": return "bg-hot/15 text-hot border-hot/30";
    case "warm": return "bg-warm/15 text-warm border-warm/30";
    case "cold": return "bg-cold/15 text-cold border-cold/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export const statusColor = (name?: string | null) => {
  switch (name) {
    case "Converted": return "bg-success/15 text-success border-success/30";
    case "Not Interested":
    case "Closed": return "bg-destructive/15 text-destructive border-destructive/30";
    case "Interested": return "bg-info/15 text-info border-info/30";
    case "Follow Up":
    case "Callback": return "bg-warning/15 text-warning border-warning/30";
    case "Contacted": return "bg-accent text-accent-foreground border-border";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export const followupBadge = (date?: string | null) => {
  if (!date) return { label: "No follow-up", cls: "bg-muted text-muted-foreground border-border" };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return { label: "Overdue", cls: "bg-destructive/15 text-destructive border-destructive/30" };
  if (diff === 0) return { label: "Today", cls: "bg-warning/15 text-warning border-warning/30" };
  if (diff === 1) return { label: "Tomorrow", cls: "bg-info/15 text-info border-info/30" };
  return { label: "Upcoming", cls: "bg-accent text-accent-foreground border-border" };
};

export const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
