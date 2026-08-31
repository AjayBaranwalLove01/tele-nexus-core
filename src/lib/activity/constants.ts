export const HEARTBEAT_MS = 30_000;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const MODULES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/followups": "Follow-up Queue",
  "/import": "Import Leads",
  "/telecallers": "Telecallers",
  "/settings": "Settings",
  "/activity": "Activity Monitoring",
  "/auth": "Authentication",
  "/": "Home",
};

export const ACTIVITY_TYPES = [
  "login",
  "logout",
  "page_view",
  "create",
  "edit",
  "delete",
  "search",
  "export",
  "download",
  "upload",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function moduleForPath(path: string): string {
  if (path.startsWith("/leads")) return "Leads";
  return MODULES[path] ?? path.replace("/", "") ?? "Unknown";
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function parseUserAgent(ua: string) {
  const browser =
    /Edg\//.test(ua) ? "Edge"
      : /OPR\//.test(ua) ? "Opera"
        : /Chrome\//.test(ua) ? "Chrome"
          : /Safari\//.test(ua) ? "Safari"
            : /Firefox\//.test(ua) ? "Firefox"
              : "Unknown";
  const os =
    /Windows/.test(ua) ? "Windows"
      : /Android/.test(ua) ? "Android"
        : /iPhone|iPad|iPod/.test(ua) ? "iOS"
          : /Mac OS X/.test(ua) ? "macOS"
            : /Linux/.test(ua) ? "Linux"
              : "Unknown";
  const device = /Mobi|Android|iPhone/.test(ua) ? "Mobile" : /iPad|Tablet/.test(ua) ? "Tablet" : "Desktop";
  return { browser, os, device };
}
