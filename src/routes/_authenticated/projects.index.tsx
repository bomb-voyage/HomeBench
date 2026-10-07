import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, ClipboardList, CheckCircle2, GripVertical } from "lucide-react";
import { reorderProjects } from "@/lib/projects.functions";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { homeQuery } from "@/lib/home-data";
import {
  projectsQuery,
  formatCurrency,
  formatHours,
  estimateStatusLabel,
  completedTotals,
} from "@/lib/projects-data";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Homebench" },
      {
        name: "description",
        content: "Browse your DIY home projects, estimates, and work plans.",
      },
      { property: "og:title", content: "Projects — Homebench" },
      {
        property: "og:description",
        content: "Browse your DIY home projects, estimates, and work plans.",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: home, isLoading: homeLoading } = useQuery(homeQuery);
  const { data: allProjects = [], isLoading: projectsLoading } = useQuery(projectsQuery(home?.id));
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const projects = allProjects
    .filter((p) => p.status !== "done")
    .sort((a, b) => {
      const sa = a.sort_order, sb = b.sort_order;
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return (b.estimated_value_added ?? -Infinity) - (a.estimated_value_added ?? -Infinity);
    });

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = projects.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    const key = projectsQuery(home?.id).queryKey;
    queryClient.setQueryData(key, (old: typeof allProjects | undefined) =>
      (old ?? []).map((p) => (ids.includes(p.id) ? { ...p, sort_order: ids.indexOf(p.id) } : p)),
    );
    await reorderProjects({ data: { ids } });
    queryClient.invalidateQueries({ queryKey: key });
  };
  const completed = allProjects.filter((p) => p.status === "done");
  const totals = completedTotals(allProjects);

  const isLoading = homeLoading || projectsLoading;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Project list</p>
          <h1 className="mt-2 text-3xl font-extrabold">Your project to-do list</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe a project, answer a few questions, and get cost, labor, and value estimates.
          </p>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="size-4" />
            Add project
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="size-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No projects yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Start by describing the first project you're considering — a fence, a bathroom refresh,
              a deck, or anything else on your list.
            </p>
            <Button asChild className="mt-6">
              <Link to="/projects/new">
                Plan your first project
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              draggable
              onDragStart={(e) => {
                setDragId(project.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(project.id);
              }}
              onDragLeave={() => setOverId((id) => (id === project.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                setOverId(null);
                void handleDrop(project.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={`cursor-grab transition-shadow hover:shadow-card active:cursor-grabbing ${dragId === project.id ? "opacity-50" : ""} ${overId === project.id && dragId !== project.id ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                    <CardTitle className="text-lg">{project.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {project.rooms ? (project.rooms as { name: string; room_type: string }).name : project.scope_type}
                    </CardDescription>
                    </div>
                  </div>
                  <Badge variant={project.estimate_status === "estimated" ? "default" : "secondary"}>
                    {estimateStatusLabel(project.estimate_status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="label-caps">Cost</p>
                    <p className="stat-figure mt-1">
                      {project.estimated_cost_low != null && project.estimated_cost_high != null
                        ? `${formatCurrency(project.estimated_cost_low)}–${formatCurrency(project.estimated_cost_high)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="label-caps">Hours</p>
                    <p className="stat-figure mt-1">
                      {project.estimated_hours_low != null && project.estimated_hours_high != null
                        ? `${formatHours(project.estimated_hours_low)}–${formatHours(project.estimated_hours_high)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="label-caps">Value</p>
                    <p className="stat-figure mt-1 text-success">
                      {project.estimated_value_added != null
                        ? `+${formatCurrency(project.estimated_value_added)}`
                        : "—"}
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-5 w-full">
                  <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                    {project.estimate_status === "estimated" ? "View estimate" : "Continue planning"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-extrabold">Your completed projects</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {completed.length} completed · Total cost{" "}
            <span className="stat-figure text-foreground">{formatCurrency(totals.cost)}</span> · Total hours{" "}
            <span className="stat-figure text-foreground">{formatHours(totals.hours)}</span> · Value added{" "}
            <span className="stat-figure text-success">+{formatCurrency(totals.value)}</span>
          </p>
          <Card className="mt-4">
            <CardContent className="divide-y divide-border p-0">
              {completed.map((p) => {
                const pa = p as typeof p & { actual_cost: number | null; actual_hours: number | null };
                return (
                  <Link
                    key={p.id}
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="grid grid-cols-2 gap-2 px-6 py-4 text-sm hover:bg-muted sm:grid-cols-4"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4 text-success" />
                      {p.title}
                    </span>
                    <span>
                      <span className="label-caps mr-2">Cost</span>
                      <span className="stat-figure">{pa.actual_cost != null ? formatCurrency(pa.actual_cost) : "—"}</span>
                    </span>
                    <span>
                      <span className="label-caps mr-2">Hours</span>
                      <span className="stat-figure">{pa.actual_hours != null ? formatHours(pa.actual_hours) : "—"}</span>
                    </span>
                    <span>
                      <span className="label-caps mr-2">Value</span>
                      <span className="stat-figure text-success">
                        {p.estimated_value_added != null ? `+${formatCurrency(p.estimated_value_added)}` : "—"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </AppShell>
  );
}
