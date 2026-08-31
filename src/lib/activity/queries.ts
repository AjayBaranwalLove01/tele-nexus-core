import { supabase } from "@/integrations/supabase/client";

export type SessionRow = {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  last_activity_at: string;
  last_heartbeat_at: string;
  ip_address: string | null;
  browser: string | null;
  os: string | null;
  device_info: string | null;
  current_page: string | null;
  total_duration: number;
  active_duration: number;
  idle_duration: number;
  status: string;
};

export type ActivityRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  module: string;
  page: string | null;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  duration: number;
  ip_address: string | null;
};

export type AuditRow = {
  id: string;
  user_id: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  status: string;
  ip_address: string | null;
  created_at: string;
};

export type LiveStatus = "online" | "idle" | "offline";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function liveStatus(s?: SessionRow | null): LiveStatus {
  if (!s || s.status === "closed" || s.logout_at) return "offline";
  const age = Date.now() - new Date(s.last_heartbeat_at).getTime();
  if (age > ONLINE_WINDOW_MS) return "offline";
  return s.status === "idle" ? "idle" : "online";
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchSessions(from: string, to: string, userId?: string) {
  let q = supabase
    .from("user_sessions")
    .select("*")
    .gte("login_at", from)
    .lte("login_at", to)
    .order("login_at", { ascending: false });
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SessionRow[];
}

export async function fetchLatestSessions() {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("*")
    .order("last_heartbeat_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as SessionRow[];
}

export async function fetchActivities(params: {
  from: string;
  to: string;
  userId?: string;
  module?: string;
  activityType?: string;
}) {
  let q = supabase
    .from("user_activity_logs")
    .select("*")
    .gte("started_at", params.from)
    .lte("started_at", params.to)
    .order("started_at", { ascending: false })
    .limit(2000);
  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.module) q = q.eq("module", params.module);
  if (params.activityType) q = q.eq("activity_type", params.activityType);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

export async function fetchAudit(params: { from: string; to: string; userId?: string; module?: string }) {
  let q = supabase
    .from("audit_logs_v2")
    .select("*")
    .gte("created_at", params.from)
    .lte("created_at", params.to)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.module) q = q.eq("module", params.module);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

export function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function rangeBounds(fromDate: string, toDate: string) {
  return {
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59.999`).toISOString(),
  };
}
