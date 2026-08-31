import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LeadFlow CRM — Enterprise Telecalling" },
      { name: "description", content: "Enterprise lead management & telecalling CRM with automated lead distribution, follow-ups, and high-volume imports." },
      { property: "og:title", content: "LeadFlow CRM — Enterprise Telecalling" },
      { name: "twitter:title", content: "LeadFlow CRM — Enterprise Telecalling" },
      { property: "og:description", content: "Enterprise lead management & telecalling CRM with automated lead distribution, follow-ups, and high-volume imports." },
      { name: "twitter:description", content: "Enterprise lead management & telecalling CRM with automated lead distribution, follow-ups, and high-volume imports." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fb0e86d5-cecf-4f75-8083-7d9085fc8afa/id-preview-124e79a5--4ea131b8-b6ae-4454-a74b-e22a9e655962.lovable.app-1780817225704.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fb0e86d5-cecf-4f75-8083-7d9085fc8afa/id-preview-124e79a5--4ea131b8-b6ae-4454-a74b-e22a9e655962.lovable.app-1780817225704.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isProtectedPath =
    ["/dashboard", "/followups", "/import", "/settings", "/telecallers"].includes(pathname) ||
    pathname === "/leads" ||
    pathname.startsWith("/leads/");

  useEffect(() => {
    setMounted(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {isProtectedPath && !mounted ? <ProtectedRouteFallback /> : <Outlet />}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function ProtectedRouteFallback() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 border-r bg-sidebar p-4 text-sidebar-foreground md:block">
        <div className="mb-8 flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary" />
          <div className="h-4 w-24 rounded bg-sidebar-accent" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 rounded-md bg-sidebar-accent/70" />
          ))}
        </div>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="h-14 border-b bg-card" />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 rounded-md bg-primary" />
            <p className="text-sm font-medium text-muted-foreground">Loading workspace…</p>
          </div>
        </div>
      </main>
    </div>
  );
}
