import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, Wrench, TrendingUp, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import {
  formatAddress,
  formatCurrency,
  formatNumber,
  homeQuery,
  roomsQuery,
  totalRoomArea,
} from "@/lib/home-data";
import { roomTypeLabel } from "@/lib/property-schema";
import { projectsQuery, formatHours, formatPercent } from "@/lib/projects-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Homebench" },
      {
        name: "description",
        content: "Your home profile at a glance: property details, mapped rooms, and total area.",
      },
      { property: "og:title", content: "Dashboard — Homebench" },
      {
        property: "og:description",
        content: "Your home profile at a glance in Homebench.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: home, isLoading } = useQuery(homeQuery);
  const { data: rooms = [] } = useQuery(roomsQuery(home?.id));
  const { data: projects = [] } = useQuery(projectsQuery(home?.id));

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!home) {
    return (
      <AppShell>
        <div className="max-w-xl">
          <p className="label-caps">Welcome</p>
          <h1 className="mt-2 text-3xl font-extrabold">Let's set up your home</h1>
          <p className="mt-3 text-muted-foreground">
            Everything else — project costs, labor hours, value added, tool gaps — is built on top of
            an accurate home profile. It takes a couple of minutes.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/home">
              Start with your address
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const mapped = totalRoomArea(rooms);
  const coverage =
    home.square_feet && home.square_feet > 0
      ? Math.min(100, Math.round((mapped / home.square_feet) * 100))
      : null;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Home profile</p>
          <h1 className="mt-2 text-3xl font-extrabold">{formatAddress(home)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Property details {home.lookup_source === "manual" ? "entered manually" : `from ${home.lookup_source}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/home">Edit details</Link>
          </Button>
          <Button asChild>
            <Link to="/rooms">Manage rooms</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Finished sq ft" value={formatNumber(home.square_feet)} />
        <Stat label="Beds / baths" value={`${home.bedrooms ?? "—"} / ${home.bathrooms ?? "—"}`} />
        <Stat label="Year built" value={home.year_built?.toString() ?? "—"} />
        <Stat label="Value baseline" value={formatCurrency(home.estimated_value)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Rooms mapped</CardTitle>
                <CardDescription>
                  {rooms.length === 0
                    ? "No rooms yet — add them to unlock per-room estimates."
                    : `${rooms.length} room${rooms.length === 1 ? "" : "s"} · ${formatNumber(mapped, " sq ft")}${
                        coverage !== null ? ` · ${coverage}% of recorded area` : ""
                      }`}
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/rooms">Add room</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Start with the rooms you're most likely to work on: kitchen and bathrooms.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rooms.map((room) => (
                  <li key={room.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium">{room.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {roomTypeLabel(room.room_type)} · {roomTypeLabel(room.floor_level)} floor
                      </p>
                    </div>
                    <p className="stat-figure text-sm">
                      {room.area_sqft ? `${Math.round(room.area_sqft).toLocaleString()} sq ft` : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-primary" />
                  <p className="font-semibold">Projects</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/projects/new">
                    <Plus className="size-3" />
                    Add
                  </Link>
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {projects.length === 0
                  ? "No projects yet. Describe one to get cost and labor estimates."
                  : `${projects.length} project${projects.length === 1 ? "" : "s"} on your list.`}
              </p>
              {projects.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {projects.slice(0, 3).map((project) => (
                    <li key={project.id}>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="flex items-center justify-between rounded p-2 text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{project.title}</span>
                        <span className="stat-figure text-xs text-muted-foreground">
                          {project.estimated_cost_low != null
                            ? `${formatCurrency(project.estimated_cost_low)}–${formatCurrency(project.estimated_cost_high)}`
                            : "Draft"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Upcoming
            icon={Wrench}
            title="Tool inventory"
            body="Track what you own so each project only lists the gaps."
          />
          <Upcoming
            icon={TrendingUp}
            title="Value added"
            body="See the estimated resale impact of each completed project."
          />
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="label-caps">{label}</p>
        <p className="stat-figure mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Upcoming({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ClipboardList;
  title: string;
  body: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            <p className="font-semibold">{title}</p>
          </div>
          <Badge variant="secondary">Next</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
