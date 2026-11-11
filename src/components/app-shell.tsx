import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Hammer, House, LayoutGrid, LifeBuoy, LogOut, Ruler, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SUPPORT_MAILTO } from "@/lib/support";

const NAV = [
  { to: "/dashboard", label: "Overview", short: "Overview", icon: LayoutGrid },
  { to: "/projects", label: "Projects", short: "Projects", icon: ClipboardList },
  { to: "/rooms", label: "Rooms", short: "Rooms", icon: Ruler },
  { to: "/tools", label: "Tools", short: "Tools", icon: Wrench },
  { to: "/home", label: "Home details", short: "Home", icon: House },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { tab: "signin" }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground">
              <Hammer className="size-4" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">Homebench</span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" className="ml-auto h-10 md:h-9" asChild>
            <a href={SUPPORT_MAILTO}>
              <LifeBuoy className="size-4" />
              <span className="hidden sm:inline">Support</span>
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="h-10 md:h-9" onClick={handleSignOut}>
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl overflow-x-hidden px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:py-8">
        {children}
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className="size-5" />
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
