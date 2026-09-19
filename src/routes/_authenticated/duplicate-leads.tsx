import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Search, RefreshCw, Phone, Mail, MapPin, ExternalLink,
  Copy, FileText, Trash2, Calendar, Users, AlertCircle, ArrowUpRight
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/duplicate-leads")({
  head: () => ({
    meta: [
      { title: "Duplicate Leads — Oxo Lead Manager" },
      { name: "description", content: "List and manage duplicate inquiries by unique 10-digit mobile number." },
    ],
  }),
  component: DuplicateLeadsPage,
});

interface DuplicateLeadRecord {
  id: number;
  original_lead_id: number | null;
  name: string | null;
  phone_number: string;
  email: string | null;
  city: string | null;
  source: string | null;
  remarks: string | null;
  raw_payload: any;
  created_at: string;
}

function DuplicateLeadsPage() {
  const { data: me } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLead, setSelectedLead] = useState<DuplicateLeadRecord | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Fetch duplicate leads
  const { data: duplicateLeads = [], isLoading, isRefetching, refetch } = useQuery<DuplicateLeadRecord[]>({
    queryKey: ["duplicate-leads", search, sourceFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase.from("duplicate_leads") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (sourceFilter !== "all") {
        q = q.eq("source", sourceFilter);
      }
      if (dateFrom) {
        q = q.gte("created_at", `${dateFrom}T00:00:00Z`);
      }
      if (dateTo) {
        q = q.lte("created_at", `${dateTo}T23:59:59Z`);
      }

      const term = search.trim();
      if (term) {
        // Search by phone, name, email, city, or remarks
        q = q.or(`name.ilike.%${term}%,phone_number.ilike.%${term}%,email.ilike.%${term}%,city.ilike.%${term}%,remarks.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) {
        console.error("Error fetching duplicate leads:", error);
        throw error;
      }
      return data || [];
    },
  });

  // Distinct sources for dropdown filter
  const sources = useMemo(() => {
    const list = duplicateLeads.map((d) => d.source).filter(Boolean) as string[];
    return Array.from(new Set(list)).sort();
  }, [duplicateLeads]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = duplicateLeads.length;
    const uniquePhones = new Set(duplicateLeads.map((d) => d.phone_number)).size;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = duplicateLeads.filter((d) => d.created_at.startsWith(todayStr)).length;
    return { total, uniquePhones, todayCount };
  }, [duplicateLeads]);

  // Delete duplicate record mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase.from("duplicate_leads") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Duplicate record removed");
      queryClient.invalidateQueries({ queryKey: ["duplicate-leads"] });
      setDeleteTargetId(null);
    },
    onError: (err: any) => {
      toast.error("Failed to delete record: " + (err.message || String(err)));
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Duplicate Leads</h1>
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              Unique Mobile Number Guard
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Inquiries matching existing 10-digit mobile numbers are securely isolated here and linked to the traveler&apos;s original lead timeline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm" variant="default">
            <Link to="/leads">
              View Active Leads
              <ArrowUpRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Duplicate Inquiries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Inquiries prevented from cluttering the active pipeline</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Unique Mobile Numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{metrics.uniquePhones}</div>
            <p className="text-xs text-muted-foreground mt-1">Distinct travelers who submitted multiple inquiries</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Received Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{metrics.todayCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Recent duplicate submissions today</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by 10-digit mobile, name, city, remarks..."
                className="pl-9"
              />
            </div>

            {/* Source Filter */}
            <div className="md:col-span-3">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sources.map((src) => (
                    <SelectItem key={src} value={src}>
                      {src}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="md:col-span-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From Date"
                className="text-xs"
              />
            </div>

            {/* Date To */}
            <div className="md:col-span-2">
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To Date"
                className="text-xs"
              />
            </div>
          </div>

          {(search || sourceFilter !== "all" || dateFrom || dateTo) && (
            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span>Filtered results: {duplicateLeads.length} records found</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setSearch("");
                  setSourceFilter("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Reset Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="py-3 px-4 text-left">Date & Time</th>
                <th className="py-3 px-4 text-left">Traveler Name</th>
                <th className="py-3 px-4 text-left">10-Digit Mobile</th>
                <th className="py-3 px-4 text-left">City / Dest</th>
                <th className="py-3 px-4 text-left">Lead Source</th>
                <th className="py-3 px-4 text-left">Original Lead</th>
                <th className="py-3 px-4 text-center">Inquiry Details</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-4 text-center"><Skeleton className="h-7 w-20 mx-auto" /></td>
                    <td className="p-4 text-right"><Skeleton className="h-7 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : duplicateLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="font-medium text-foreground">No duplicate leads found</p>
                    <p className="text-xs mt-1">All incoming leads currently have unique mobile numbers.</p>
                  </td>
                </tr>
              ) : (
                duplicateLeads.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Traveler Name */}
                    <td className="py-3.5 px-4 font-medium text-foreground">
                      <div className="flex flex-col">
                        <span>{item.name || "Website Traveler"}</span>
                        {item.email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3" />
                            {item.email}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 10-Digit Mobile */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground tracking-wide">
                          {item.phone_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.phone_number, "Phone number")}
                          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                          title="Copy phone number"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* City / Destination */}
                    <td className="py-3.5 px-4 text-xs">
                      {item.city ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[140px]">{item.city}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {item.source || "WordPress CF7"}
                      </Badge>
                    </td>

                    {/* Original Lead Link */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.original_lead_id ? (
                        <Link
                          to={`/leads/${item.original_lead_id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                          Lead #{item.original_lead_id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Original Removed</span>
                      )}
                    </td>

                    {/* Inquiry Details Modal Trigger */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setSelectedLead(item)}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        View Remarks
                      </Button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.original_lead_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Open Original Lead"
                            onClick={() => navigate({ to: `/leads/${item.original_lead_id}` })}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {me?.isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete duplicate record"
                            onClick={() => setDeleteTargetId(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View Full Inquiry Remarks Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Travel Inquiry Submission</span>
              {selectedLead?.phone_number && (
                <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded font-normal">
                  {selectedLead.phone_number}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Full details submitted by traveler on{" "}
              {selectedLead?.created_at &&
                new Date(selectedLead.created_at).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Meta Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-md">
              <div>
                <span className="text-muted-foreground">Traveler:</span>{" "}
                <span className="font-semibold">{selectedLead?.name || "Website Traveler"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                <span>{selectedLead?.source || "WordPress CF7"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">City:</span>{" "}
                <span>{selectedLead?.city || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Original Lead ID:</span>{" "}
                <span className="font-mono font-semibold">#{selectedLead?.original_lead_id || "None"}</span>
              </div>
            </div>

            {/* Formatted Remarks Block */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Submitted Travel Fields (Field: Value)
              </label>
              <div className="bg-slate-950 text-slate-50 p-4 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                {selectedLead?.remarks || "No formatted remarks provided."}
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setSelectedLead(null)}>
              Close
            </Button>
            {selectedLead?.original_lead_id && (
              <Button
                onClick={() => {
                  const origId = selectedLead.original_lead_id;
                  setSelectedLead(null);
                  navigate({ to: `/leads/${origId}` });
                }}
              >
                Go to Original Lead #{selectedLead.original_lead_id}
                <ExternalLink className="h-4 w-4 ml-1.5" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Inquiry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this specific duplicate submission record. The original lead in the main leads table will remain unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
