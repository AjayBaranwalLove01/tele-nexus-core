import { useMemo } from "react";
import { Phone, MessageCircle, Flame, Thermometer, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { followupBadge, statusColor, tempColor, formatDate } from "@/lib/lead-utils";
import { Link } from "@tanstack/react-router";
import { LeadQuickUpdate } from "@/components/lead-quick-update";

type Lead = {
  id: number;
  name: string | null;
  phone_number: string | null;
  email?: string | null;
  city?: string | null;
  lead_received_date?: string | null;
  call_date?: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  status_name?: string | null;
  temperature_name?: string | null;
};

export function LeadRow({ lead }: { lead: Lead }) {
  const fu = followupBadge(lead.follow_up_date);
  const tempIcon = useMemo(() => {
    const n = lead.temperature_name?.toLowerCase();
    if (n === "hot") return <Flame className="h-3 w-3" />;
    if (n === "warm") return <Thermometer className="h-3 w-3" />;
    if (n === "cold") return <Snowflake className="h-3 w-3" />;
    return null;
  }, [lead.temperature_name]);

  const wa = lead.phone_number?.replace(/\D/g, "");
  return (
    <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/leads/$id" params={{ id: String(lead.id) }} className="font-medium hover:underline truncate">
            {lead.name || "Unnamed lead"}
          </Link>
          <Badge variant="outline" className={fu.cls}>{fu.label}</Badge>
          {lead.status_name && <Badge variant="outline" className={statusColor(lead.status_name)}>{lead.status_name}</Badge>}
          {lead.temperature_name && (
            <Badge variant="outline" className={tempColor(lead.temperature_name)}>
              <span className="flex items-center gap-1">{tempIcon}{lead.temperature_name}</span>
            </Badge>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
          <span>{lead.phone_number || "No phone"}</span>
          {lead.email && <span>{lead.email}</span>}
          {lead.city && <span>{lead.city}</span>}
          {lead.lead_received_date && <span>Recd: {formatDate(lead.lead_received_date)}</span>}
          {lead.call_date && <span>Last call: {formatDate(lead.call_date)}</span>}
          <span>FU: {formatDate(lead.follow_up_date)}{lead.follow_up_time ? ` ${lead.follow_up_time.slice(0,5)}` : ""}</span>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {lead.phone_number && (
          <>
            <Button asChild size="sm" variant="default"><a href={`tel:${lead.phone_number}`}><Phone className="h-4 w-4" />Call</a></Button>
            {wa && <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a></Button>}
          </>
        )}
        <LeadQuickUpdate leadId={lead.id} leadName={lead.name} />
      </div>
    </Card>
  );
}
