import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Clock,
  DollarSign,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  projectQuery,
  formatCurrency,
  formatHours,
  formatPercent,
  statusLabel,
  estimateStatusLabel,
} from "@/lib/projects-data";
import { homeQuery } from "@/lib/home-data";
import {
  updateProject,
  deleteProject,
  generateEstimate,
  nextIntakeQuestion,
} from "@/lib/projects.functions";
import { PROJECT_STATUSES, PROJECT_SCOPE_TYPES, type IntakeMessage, type IntakeResponse } from "@/lib/projects-schema";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Homebench" },
      {
        name: "description",
        content: "View and refine your DIY project estimate, work plan, and tool list.",
      },
      { property: "og:title", content: "Project — Homebench" },
      {
        property: "og:description",
        content: "View and refine your DIY project estimate, work plan, and tool list.",
      },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: home } = useQuery(homeQuery);
  const { data: project, isLoading } = useQuery(projectQuery(projectId));

  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  const estimateMutation = useMutation({
    mutationFn: () =>
      generateEstimate({
        data: {
          projectId,
          homeId: project!.home_id,
          roomId: project!.room_id,
          scopeType: project!.scope_type as (typeof PROJECT_SCOPE_TYPES)[number],
          title: project!.title,
          spec: project!.spec as Record<string, unknown>,
        },
      }),
    onMutate: () => setIsEstimating(true),
    onSuccess: () => {
      setIsEstimating(false);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
    },
    onError: () => {
      setIsEstimating(false);
    },
  });

  useEffect(() => {
    if (project) {
      setDraftTitle(project.title);
      setDraftDescription(project.description ?? "");
    }
  }, [project?.title, project?.description]);

  const updateMutation = useMutation({
    mutationFn: (values: { title?: string; description?: string | null; status?: string; scopeType?: string; roomId?: string | null; spec?: Record<string, unknown>; intakeState?: IntakeMessage[] }) =>
      updateProject({
        data: {
          id: projectId,
          ...values,
        },
      }),
    onMutate: () => setIsSaving(true),
    onSuccess: () => {
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
    },
    onError: () => setIsSaving(false),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject({ data: { id: projectId } }),
    onMutate: () => setIsDeleting(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
      navigate({ to: "/projects" });
    },
    onError: () => setIsDeleting(false),
  });

  const chatMutation = useMutation<IntakeResponse, Error, string>({
    mutationFn: (message) =>
      nextIntakeQuestion({
        data: {
          projectId,
          homeId: project!.home_id,
          roomId: project!.room_id,
          scopeType: project!.scope_type as (typeof PROJECT_SCOPE_TYPES)[number],
          title: project!.title,
          message,
          history: (project!.intake_state as IntakeMessage[]) ?? [],
        },
      }),
    onMutate: (message) => {
      setChatInput("");
      setIsChatting(true);
      const current = (project!.intake_state as IntakeMessage[]) ?? [];
      updateMutation.mutate({
        intakeState: [...current, { role: "user", content: message }],
      });
    },
    onSuccess: (response) => {
      setIsChatting(false);
      const current = (project!.intake_state as IntakeMessage[]) ?? [];
      const updatedHistory: IntakeMessage[] = [
        ...current,
        { role: "assistant", content: response.question ?? "All set — ready to re-estimate." },
      ];
      const updatedSpec = response.spec ? { ...project!.spec, ...response.spec } : project!.spec;
      updateMutation.mutate({
        intakeState: updatedHistory,
        spec: updatedSpec as Record<string, unknown>,
      });
    },
    onError: () => setIsChatting(false),
  });

  if (isLoading || !project) {
    return (
      <AppShell>
        <div className="h-32 animate-pulse rounded bg-muted" />
      </AppShell>
    );
  }

  const steps = (project.project_steps ?? []) as Array<{
    id: string;
    sort_order: number;
    title: string;
    description: string | null;
    estimated_hours_low: number | null;
    estimated_hours_high: number | null;
  }>;

  const tools = (project.project_tools ?? []) as Array<{
    id: string;
    tool_name: string;
    role: string;
    acquisition: string;
    estimated_price: number | null;
    rental_price_per_day: number | null;
    hours_saved: number | null;
    rationale: string | null;
    search_links: Record<string, string> | null;
    step_id: string | null;
    already_owned: boolean;
  }>;

  const toolsByStep = new Map<string, typeof tools>();
  const topLevelTools: typeof tools = [];
  for (const tool of tools) {
    if (tool.step_id) {
      if (!toolsByStep.has(tool.step_id)) toolsByStep.set(tool.step_id, []);
      toolsByStep.get(tool.step_id)!.push(tool);
    } else {
      topLevelTools.push(tool);
    }
  }

  const spec = (project.spec as Record<string, unknown>) ?? {};

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/projects" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-4" />
          Projects
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => {
                if (draftTitle !== project.title) {
                  updateMutation.mutate({ title: draftTitle });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="h-auto w-auto min-w-[240px] border-none bg-transparent px-0 text-3xl font-extrabold shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{project.scope_type === "whole_property" ? "Whole property" : "Room project"}</Badge>
            <Badge variant={project.estimate_status === "estimated" ? "default" : "secondary"}>
              {estimateStatusLabel(project.estimate_status)}
            </Badge>
            <Select
              value={project.status}
              onValueChange={(value) => updateMutation.mutate({ status: value })}
            >
              <SelectTrigger className="h-7 w-auto text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => estimateMutation.mutate()}
            disabled={isEstimating}
          >
            {isEstimating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Re-estimate
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate()}
            disabled={isDeleting}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <EstimateCard
          icon={<DollarSign className="size-5" />}
          label="Estimated cost"
          value={
            project.estimated_cost_low != null && project.estimated_cost_high != null
              ? `${formatCurrency(project.estimated_cost_low)}–${formatCurrency(project.estimated_cost_high)}`
              : "—"
          }
        />
        <EstimateCard
          icon={<Clock className="size-5" />}
          label="DIY labor hours"
          value={
            project.estimated_hours_low != null && project.estimated_hours_high != null
              ? `${formatHours(project.estimated_hours_low)}–${formatHours(project.estimated_hours_high)}`
              : "—"
          }
        />
        <EstimateCard
          icon={<TrendingUp className="size-5" />}
          label="Estimated value added"
          value={
            project.estimated_value_added != null
              ? `${formatCurrency(project.estimated_value_added)} (${formatPercent(project.estimated_value_added_pct)})`
              : "—"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {project.estimate_notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Estimate notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{project.estimate_notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Step-by-step work plan</CardTitle>
              <CardDescription>
                {steps.length === 0 ? "Estimate this project to see a work plan." : `${steps.length} steps`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No work plan yet. Use Re-estimate to generate one.
                </p>
              ) : (
                <ol className="space-y-6">
                  {steps
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((step, idx) => (
                      <li key={step.id} className="relative pl-8">
                        <span className="absolute left-0 top-0 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {idx + 1}
                        </span>
                        <h3 className="font-semibold">{step.title}</h3>
                        {step.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                        )}
                        <p className="mt-1 text-sm">
                          <span className="label-caps">Hours</span>{" "}
                          {step.estimated_hours_low != null && step.estimated_hours_high != null
                            ? `${formatHours(step.estimated_hours_low)}–${formatHours(step.estimated_hours_high)}`
                            : "—"}
                        </p>
                        <StepTools tools={toolsByStep.get(step.id) ?? []} />
                      </li>
                    ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project specs</CardTitle>
              <CardDescription>Edit any detail and re-estimate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scope">Scope</Label>
                <Select
                  value={project.scope_type}
                  onValueChange={(value) =>
                    updateMutation.mutate({ scopeType: value as (typeof PROJECT_SCOPE_TYPES)[number] })
                  }
                >
                  <SelectTrigger id="scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Specific room</SelectItem>
                    <SelectItem value="whole_property">Whole property / exterior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Notes</Label>
                <Textarea
                  id="description"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onBlur={() => {
                    if (draftDescription !== (project.description ?? "")) {
                      updateMutation.mutate({ description: draftDescription });
                    }
                  }}
                  placeholder="Add any extra context…"
                  rows={3}
                />
              </div>
              {Object.keys(spec).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Gathered details</p>
                  <ul className="space-y-1 rounded bg-muted p-3 text-sm">
                    {Object.entries(spec).map(([key, value]) => (
                      <li key={key} className="flex justify-between gap-2">
                        <span className="capitalize text-muted-foreground">{key.replace(/_/g, " ")}</span>
                        <span>{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tool list</CardTitle>
              <CardDescription>Required and recommended tools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tools listed yet. Generate an estimate to see required and recommended tools.
                </p>
              ) : (
                tools.map((tool) => <ToolRow key={tool.id} tool={tool} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Refine by chat</CardTitle>
              <CardDescription>Ask to change materials, scope, or style</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim() || isChatting) return;
                  chatMutation.mutate(chatInput.trim());
                }}
              >
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="e.g., Use cedar instead of pine"
                  disabled={isChatting}
                />
                <Button type="submit" size="icon" disabled={!chatInput.trim() || isChatting}>
                  {isChatting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function EstimateCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="label-caps">{label}</p>
          <p className="stat-figure mt-1 text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StepTools({ tools }: { tools: Array<{
  id: string;
  tool_name: string;
  role: string;
  acquisition: string;
  estimated_price: number | null;
  rental_price_per_day: number | null;
  hours_saved: number | null;
  rationale: string | null;
  search_links: Record<string, string> | null;
  already_owned: boolean;
}> }) {
  if (tools.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {tools.map((tool) => (
        <div key={tool.id} className="rounded border border-border bg-card p-2 text-sm">
          <div className="flex items-center gap-2">
            {tool.role === "required" ? (
              <Badge variant="default" className="text-[10px]">Required</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
            )}
            <span className="font-medium">{tool.tool_name}</span>
            {tool.already_owned && <CheckCircle2 className="size-3 text-success" />}
          </div>
          {tool.rationale && <p className="mt-1 text-xs text-muted-foreground">{tool.rationale}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {tool.estimated_price != null && (
              <span>Buy ~{formatCurrency(tool.estimated_price)}</span>
            )}
            {tool.rental_price_per_day != null && (
              <span>Rent ~{formatCurrency(tool.rental_price_per_day)}/day</span>
            )}
            {tool.hours_saved != null && tool.hours_saved > 0 && (
              <span className="text-success">Saves {formatHours(tool.hours_saved)}</span>
            )}
            {tool.search_links?.buy && (
              <a
                href={tool.search_links.buy}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Buy <ExternalLink className="size-3" />
              </a>
            )}
            {tool.search_links?.rent && (
              <a
                href={tool.search_links.rent}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Rent <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolRow({ tool }: { tool: {
  id: string;
  tool_name: string;
  role: string;
  acquisition: string;
  estimated_price: number | null;
  rental_price_per_day: number | null;
  hours_saved: number | null;
  rationale: string | null;
  search_links: Record<string, string> | null;
  already_owned: boolean;
} }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{tool.tool_name}</span>
        <Badge variant={tool.role === "required" ? "default" : "secondary"} className="text-[10px]">
          {tool.role === "required" ? "Required" : "Recommended"}
        </Badge>
      </div>
      {tool.rationale && <p className="text-xs text-muted-foreground">{tool.rationale}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {tool.estimated_price != null && <span>Buy ~{formatCurrency(tool.estimated_price)}</span>}
        {tool.rental_price_per_day != null && <span>Rent ~{formatCurrency(tool.rental_price_per_day)}/day</span>}
        {tool.hours_saved != null && tool.hours_saved > 0 && (
          <span className="text-success">Saves {formatHours(tool.hours_saved)}</span>
        )}
      </div>
    </div>
  );
}
