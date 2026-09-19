import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ReactNode, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Upload, ListTodo, CalendarClock, Copy,
  Settings, LogOut, Phone, Menu, Activity, ShieldCheck, BarChart3, Archive,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/use-auth";
import { useActivityTracker } from "@/hooks/use-activity-tracker";
import { endTracking } from "@/lib/activity/tracker";
import { toast } from "sonner";


function NavItems() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data } = useMyProfile();
  const isAdmin = data?.isAdmin;
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const closeSidebarOnMobile = () => {
    setOpenMobile(false);
  };

  useEffect(() => {
    setOpenMobile(false);
  }, [path, setOpenMobile]);

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/followups", label: "Follow-up Queue", icon: CalendarClock, show: true },
    { to: "/leads", label: "Leads", icon: ListTodo, show: true },
    { to: "/duplicate-leads", label: "Duplicate Leads", icon: Copy, show: true },
    { to: "/archive", label: "Archive", icon: Archive, show: isAdmin },
    { to: "/import", label: "Import Leads", icon: Upload, show: isAdmin },
    { to: "/telecallers", label: "Telecallers", icon: Users, show: isAdmin },
    { to: "/users", label: "User Access", icon: ShieldCheck, show: isAdmin },
    { to: "/productivity", label: "Productivity", icon: BarChart3, show: true },
    { to: "/activity", label: isAdmin ? "Activity Monitor" : "My Activity", icon: Activity, show: true },
    { to: "/settings", label: "Settings", icon: Settings, show: isAdmin },
  ];


  return (
    <SidebarMenu>
      {items.filter((i) => i.show).map((i) => (
        <SidebarMenuItem key={i.to}>
          <SidebarMenuButton asChild isActive={path === i.to || path.startsWith(i.to + "/")}>
            <Link to={i.to} onClick={closeSidebarOnMobile}>
              <i.icon className="h-4 w-4" />
              {!collapsed && <span>{i.label}</span>}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function AppSidebar() {
  const { data } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const signOut = async () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    await endTracking();
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary grid place-items-center shrink-0">
            <Phone className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && <span className="font-semibold tracking-tight font-display">Oxo</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <NavItems />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 space-y-2">
          {!collapsed && (
            <div className="text-xs text-sidebar-foreground/60">
              <div className="font-medium text-sidebar-foreground truncate">{data?.profile?.full_name ?? "—"}</div>
              <div className="truncate">{data?.isAdmin ? "Administrator" : "Telecaller"}</div>
            </div>
          )}
          <Button onClick={signOut} variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useActivityTracker();
  return (
    <SidebarProvider>

      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center px-3 sticky top-0 z-30">
            <SidebarTrigger className="lg:hidden mr-2">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <SidebarTrigger className="hidden lg:flex mr-2" />
            <div className="text-sm font-medium text-muted-foreground">Lead Management & Telecalling</div>
          </header>
          <main className="flex-1 p-4 lg:p-6 min-w-0 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
