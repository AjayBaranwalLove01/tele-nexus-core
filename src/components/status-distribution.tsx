import { useMemo, type ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LabelList } from "recharts";
import { Card } from "@/components/ui/card";

const STATUS_ORDER = [
  "New", "Contacted", "Interested", "Follow Up", "Callback", "Converted", "Not Interested", "Closed", "—",
];

const STATUS_COLORS: Record<string, string> = {
  New: "oklch(0.55 0.02 260)",
  Contacted: "oklch(0.55 0.12 260)",
  Interested: "oklch(0.55 0.16 220)",
  "Follow Up": "oklch(0.62 0.17 75)",
  Callback: "oklch(0.65 0.15 85)",
  Converted: "oklch(0.55 0.18 145)",
  "Not Interested": "oklch(0.55 0.18 25)",
  Closed: "oklch(0.45 0.05 25)",
  "—": "oklch(0.55 0.02 260)",
};

function StatusTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const percent = total ? Math.round((item.value / total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-center gap-2 font-medium">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </div>
      <div className="mt-1 text-sm tabular-nums">
        <span className="text-xl font-semibold">{item.value}</span>
        <span className="ml-1 text-muted-foreground">leads</span>
      </div>
      <div className="text-xs text-muted-foreground">{percent}% of these leads</div>
    </div>
  );
}

export function StatusDistribution({
  counts,
  title = "Lead Status Distribution",
  subtitle,
  toolbar,
}: {
  counts: Record<string, number>;
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
}) {
  const { statusData, total } = useMemo(() => {
    const ordered = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0);
    const others = Object.keys(counts).filter((s) => !STATUS_ORDER.includes(s));
    return {
      statusData: [...ordered, ...others].map((name) => ({
        name,
        value: counts[name],
        color: STATUS_COLORS[name] ?? "oklch(0.55 0.02 260)",
      })),
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }, [counts]);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="font-medium">{title}</div>
        <div className="flex items-center gap-2">
          {toolbar}
          <div className="text-xs text-muted-foreground">{total.toLocaleString()} leads</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {subtitle ?? "Color-coded by status. Bars show count and share of these leads."}
      </p>
      {total === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No assigned leads to show yet.
        </div>
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={statusData.length > 5 ? -30 : 0}
                  textAnchor={statusData.length > 5 ? "end" : "middle"}
                  height={statusData.length > 5 ? 50 : 30}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.3)" }} content={<StatusTooltip total={total} />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number) => `${v}${total ? ` (${Math.round((v / total) * 100)}%)` : ""}`}
                    className="fill-foreground text-[10px] font-medium"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusData.map((s) => (
              <div
                key={s.name}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
                <span className="tabular-nums text-muted-foreground">{s.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
