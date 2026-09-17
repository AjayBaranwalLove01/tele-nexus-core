import type { QueryClient } from "@tanstack/react-query";

/** Refresh every view that shows lead data after any lead change. */
export function invalidateLeadViews(qc: QueryClient, leadId?: number) {
  const keys = [
    ["leads-list"],
    ["leads"],
    ["my-leads"],
    ["followups"],
    ["admin-dashboard"],
    ["admin-status-distribution"],
    ["my-status-distribution"],
    ["productivity"],
  ];
  keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
  if (leadId !== undefined) {
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-quick", leadId] });
    qc.invalidateQueries({ queryKey: ["remarks", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-history", leadId] });
  }
}
