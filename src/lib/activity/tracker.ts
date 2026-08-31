import { supabase } from "@/integrations/supabase/client";
import { getClientIp } from "./client-meta.functions";
import {
  HEARTBEAT_MS,
  IDLE_TIMEOUT_MS,
  moduleForPath,
  parseUserAgent,
  type ActivityType,
} from "./constants";

const SESSION_KEY = "lf_activity_session";

type StoredSession = { id: string; userId: string };

let sessionId: string | null = null;
let currentUserId: string | null = null;
let clientIp: string | null = null;
let lastActivityAt = Date.now();
let lastTickAt = Date.now();
let activeSeconds = 0;
let idleSeconds = 0;
let currentPage = "/";
let currentActivityId: string | null = null;
let currentActivityStart = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;
let starting: Promise<void> | null = null;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "click", "scroll", "touchstart", "wheel"];

function markActivity() {
  lastActivityAt = Date.now();
}

function isIdle() {
  return Date.now() - lastActivityAt > IDLE_TIMEOUT_MS;
}

function readStored(userId: string): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.userId === userId ? parsed.id : null;
  } catch {
    return null;
  }
}

function writeStored(userId: string, id: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, userId } satisfies StoredSession));
  } catch {
    /* ignore */
  }
}

function clearStored() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function getSessionId() {
  return sessionId;
}

export async function startTracking(userId: string, path: string) {
  if (typeof window === "undefined") return;
  if (currentUserId === userId && sessionId) return;
  if (starting) return starting;

  starting = (async () => {
    currentUserId = userId;
    currentPage = path;
    lastActivityAt = Date.now();
    lastTickAt = Date.now();

    try {
      clientIp = (await getClientIp()).ip;
    } catch {
      clientIp = null;
    }

    // Reuse the session for this browser tab so refresh/navigation never duplicates it.
    const existing = readStored(userId);
    if (existing) {
      const { data } = await supabase
        .from("user_sessions")
        .select("id, active_duration, idle_duration, status")
        .eq("id", existing)
        .maybeSingle();
      if (data && data.status !== "closed") {
        sessionId = data.id;
        activeSeconds = data.active_duration ?? 0;
        idleSeconds = data.idle_duration ?? 0;
      }
    }

    if (!sessionId) {
      const ua = navigator.userAgent;
      const { browser, os, device } = parseUserAgent(ua);
      const { data, error } = await supabase
        .from("user_sessions")
        .insert({
          user_id: userId,
          ip_address: clientIp,
          user_agent: ua,
          browser,
          os,
          device_info: `${device} · ${screen.width}x${screen.height}`,
          current_page: path,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !data) return;
      sessionId = data.id;
      activeSeconds = 0;
      idleSeconds = 0;
      writeStored(userId, sessionId);
      await logActivity({ module: "Authentication", page: path, activityType: "login" });
    }

    bindListeners();
    await startPageActivity(path);

    if (!heartbeatTimer) heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  })();

  await starting;
  starting = null;
}

function bindListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") markActivity();
    else void heartbeat();
  });
  window.addEventListener("pagehide", () => {
    void heartbeat();
  });
}

async function heartbeat() {
  if (!sessionId) return;
  const now = Date.now();
  const delta = Math.round((now - lastTickAt) / 1000);
  lastTickAt = now;
  if (delta <= 0) return;

  const idle = isIdle() || (typeof document !== "undefined" && document.visibilityState === "hidden");
  if (idle) idleSeconds += delta;
  else activeSeconds += delta;

  await supabase
    .from("user_sessions")
    .update({
      last_heartbeat_at: new Date(now).toISOString(),
      last_activity_at: new Date(lastActivityAt).toISOString(),
      current_page: currentPage,
      active_duration: activeSeconds,
      idle_duration: idleSeconds,
      total_duration: activeSeconds + idleSeconds,
      status: idle ? "idle" : "active",
    })
    .eq("id", sessionId);
}

async function endPageActivity() {
  if (!currentActivityId) return;
  const id = currentActivityId;
  currentActivityId = null;
  const duration = Math.max(0, Math.round((Date.now() - currentActivityStart) / 1000));
  await supabase
    .from("user_activity_logs")
    .update({ ended_at: new Date().toISOString(), duration })
    .eq("id", id);
}

async function startPageActivity(path: string) {
  if (!sessionId || !currentUserId) return;
  currentActivityStart = Date.now();
  const { data } = await supabase
    .from("user_activity_logs")
    .insert({
      user_id: currentUserId,
      session_id: sessionId,
      module: moduleForPath(path),
      page: path,
      activity_type: "page_view",
      ip_address: clientIp,
    })
    .select("id")
    .single();
  currentActivityId = data?.id ?? null;
}

export async function trackPageChange(path: string) {
  if (!sessionId || path === currentPage) return;
  currentPage = path;
  markActivity();
  await endPageActivity();
  await startPageActivity(path);
}

export async function logActivity(opts: {
  module: string;
  page?: string;
  activityType: ActivityType;
  metadata?: Record<string, unknown>;
}) {
  if (!currentUserId) return;
  await supabase.from("user_activity_logs").insert({
    user_id: currentUserId,
    session_id: sessionId,
    module: opts.module,
    page: opts.page ?? currentPage,
    activity_type: opts.activityType,
    ended_at: new Date().toISOString(),
    duration: 0,
    ip_address: clientIp,
    metadata: (opts.metadata ?? null) as never,
  });
}

export async function logAudit(opts: {
  module: string;
  action: string;
  entityType?: string;
  entityId?: string | number;
  description?: string;
  status?: "success" | "failed";
}) {
  if (!currentUserId) return;
  await supabase.from("audit_logs_v2").insert({
    user_id: currentUserId,
    session_id: sessionId,
    module: opts.module,
    action: opts.action,
    entity_type: opts.entityType ?? null,
    entity_id: opts.entityId != null ? String(opts.entityId) : null,
    description: opts.description ?? null,
    status: opts.status ?? "success",
    ip_address: clientIp,
  });
}

export async function endTracking() {
  if (!sessionId) return;
  await heartbeat();
  await endPageActivity();
  await logActivity({ module: "Authentication", activityType: "logout" });
  const now = new Date().toISOString();
  await supabase
    .from("user_sessions")
    .update({
      logout_at: now,
      status: "closed",
      active_duration: activeSeconds,
      idle_duration: idleSeconds,
      total_duration: activeSeconds + idleSeconds,
    })
    .eq("id", sessionId);

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  sessionId = null;
  currentUserId = null;
  currentActivityId = null;
  activeSeconds = 0;
  idleSeconds = 0;
  clearStored();
}
