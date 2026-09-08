import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function LeadRemarksInline({ leadId }: { leadId: number }) {
  const { data: remarks, isLoading } = useQuery({
    queryKey: ["remarks", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_remarks")
        .select("id,remark,created_at,profiles:user_id(full_name)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-3 text-sm text-muted-foreground">Loading remarks…</div>;
  if (!remarks || remarks.length === 0)
    return <div className="p-3 text-sm text-muted-foreground">No remarks yet.</div>;

  return (
    <div className="max-h-56 overflow-y-auto">
      {remarks.map((r: any) => (
        <div key={r.id} className="border-b border-border p-3 last:border-b-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{r.profiles?.full_name ?? "Unknown"}</span>
            <span>{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-sm">{r.remark}</div>
        </div>
      ))}
    </div>
  );
}
