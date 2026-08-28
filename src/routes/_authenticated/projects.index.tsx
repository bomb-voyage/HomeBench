import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, ArrowRight, ClipboardList } from "lucide-react";

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
  formatPercent,
  statusLabel,
  estimateStatusLabel,
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
  const { data: projects = [], isLoading: projectsLoading } = useQuery(projectsQuery(home?.id));

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
            <Card key={project.id} className="transition-shadow hover:shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{project.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {project.rooms ? (project.rooms as { name: string; room_type: string }).name : project.scope_type}
                    </CardDescription>
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
                    <p className="stat-figure mt-1">
                      {project.estimated_value_added_pct != null
                        ? formatPercent(project.estimated_value_added_pct)
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
    </AppShell>
  );
}
