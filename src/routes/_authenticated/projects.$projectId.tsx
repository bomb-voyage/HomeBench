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
  previewEstimate,
  validateSpecOption,
  nextIntakeQuestion,
} from "@/lib/projects.functions";
import { CompleteProjectDialog } from "@/components/complete-project-dialog";
import {
  PROJECT_STATUSES,
  PROJECT_SCOPE_TYPES,
  type IntakeMessage,
  type IntakeResponse,
  type PreviewEstimateOutput,
  type ValidateSpecOptionResult,
} from "@/lib/projects-schema";

const OTHER_OPTION = "__other__";

type N = number | null | undefined;
function rangeText(low: N, high: N, fmt: (v: number) => string): string {
  if (low == null || high == null) return "—";
  return low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;
}
function mid(low: N, high: N): number | null {
  if (low == null || high == null) return null;
  return (low + high) / 2;
}

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

  // Projects estimated before the cheapest/fastest split only have the old combined range:
  // re-estimate them once automatically so both method cards fill in.
  const needsSplit =
    !!project &&
    project.estimated_cost_low != null &&
    (project as Record<string, unknown>)["fast_cost_low"] == null &&
    (project as Record<string, unknown>)["cheap_cost_low"] == null;
  const [autoSplitTried, setAutoSplitTried] = useState(false);
  useEffect(() => {
    if (needsSplit && !autoSplitTried && !estimateMutation.isPending) {
      setAutoSplitTried(true);
      estimateMutation.mutate();
    }
  }, [needsSplit, autoSplitTried]);

  useEffect(() => {
    if (project) {
      setDraftTitle(project.title);
      setDraftDescription(project.description ?? "");
    }
  }, [project?.title, project?.description]);

  const [draftSpec, setDraftSpec] = useState<Record<string, string | number | boolean | null>>({});
  const [preview, setPreview] = useState<PreviewEstimateOutput | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, boolean>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [customResults, setCustomResults] = useState<Record<string, ValidateSpecOptionResult>>({});
  const savedSpecJson = JSON.stringify(project?.spec ?? {});
  useEffect(() => {
    setDraftSpec(JSON.parse(savedSpecJson));
    setPreview(null);
    setCustomFields({});
    setCustomInputs({});
    setCustomResults({});
  }, [savedSpecJson]);

  const setDraftField = (key: string, value: string | number) => {
    setDraftSpec((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
  };
  const discardDraft = () => {
    setDraftSpec(JSON.parse(savedSpecJson));
    setPreview(null);
  };

  const estimateArgs = (s: Record<string, string | number | boolean | null>) => ({
    projectId,
    homeId: project!.home_id,
    roomId: project!.room_id,
    scopeType: project!.scope_type as (typeof PROJECT_SCOPE_TYPES)[number],
    title: project!.title,
    spec: s,
  });

  const previewMutation = useMutation({
    mutationFn: () => previewEstimate({ data: estimateArgs(draftSpec) }),
    onSuccess: (result) => setPreview(result as PreviewEstimateOutput),
  });

  const validateOptionMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      validateSpecOption({ data: { projectId, key, value } }),
    onSuccess: (result, variables) => {
      const checked = result as ValidateSpecOptionResult;
      setCustomResults((prev) => ({ ...prev, [variables.key]: checked }));
      if (checked.valid && checked.normalizedValue) {
        setDraftField(variables.key, checked.normalizedValue);
        setCustomFields((prev) => ({ ...prev, [variables.key]: false }));
      }
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await updateProject({ data: { id: projectId, spec: draftSpec } });
      const targetTotals = preview
        ? {
            cheap_cost_low: preview.cheap_cost_low ?? null,
            cheap_cost_high: preview.cheap_cost_high ?? null,
            cheap_hours_low: preview.cheap_hours_low ?? null,
            cheap_hours_high: preview.cheap_hours_high ?? null,
            fast_cost_low: preview.fast_cost_low ?? null,
            fast_cost_high: preview.fast_cost_high ?? null,
            fast_hours_low: preview.fast_hours_low ?? null,
            fast_hours_high: preview.fast_hours_high ?? null,
          }
        : null;
      return generateEstimate({ data: { ...estimateArgs(draftSpec), targetTotals } });
    },
    onSuccess: () => {
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
    },
  });

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
          currentSpec: (project!.spec ?? {}) as Record<string, unknown>,
        },
      }) as Promise<IntakeResponse>,
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
      const currentSpec = (project!.spec ?? {}) as Record<string, unknown>;
      const updatedSpec = response.spec ? { ...currentSpec, ...response.spec } : currentSpec;
      updateMutation.mutate({
        intakeState: updatedHistory,
        spec: updatedSpec,
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

  // Deduplicate the flat tool list by normalized name — the same tool can
  // appear under several steps and in the top-level list.
  const uniqueTools: typeof tools = [];
  const seenToolNames = new Set<string>();
  for (const tool of tools) {
    const key = tool.tool_name.trim().toLowerCase();
    if (seenToolNames.has(key)) continue;
    seenToolNames.add(key);
    uniqueTools.push(tool);
  }

  const spec = (project.spec as Record<string, unknown>) ?? {};
  const p = project as typeof project & Record<string, number | null>;
  const specOptions = ((project as { spec_options?: unknown }).spec_options ?? {}) as Record<string, string[]>;
  const isDirty = JSON.stringify(draftSpec) !== JSON.stringify(spec);

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
            <CompleteProjectDialog projectId={projectId} isDone={project.status === "done"} size="sm" />
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
        <MethodCard
          icon={<DollarSign className="size-5" />}
          label="Cheapest method"
          hint="Your tools + required tools"
          cost={rangeText(p.cheap_cost_low ?? project.estimated_cost_low, p.cheap_cost_high ?? project.estimated_cost_high, formatCurrency)}
          hours={rangeText(p.cheap_hours_low ?? project.estimated_hours_low, p.cheap_hours_high ?? project.estimated_hours_high, formatHours)}
        />
        <MethodCard
          icon={<Clock className="size-5" />}
          label="Fastest method"
          hint="Adds recommended time-savers"
          cost={rangeText(p.fast_cost_low, p.fast_cost_high, formatCurrency)}
          hours={rangeText(p.fast_hours_low, p.fast_hours_high, formatHours)}
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

      {preview && (
        <Card className="mt-4 border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">If you make these changes</CardTitle>
            {preview.summary && <CardDescription>{preview.summary}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <DeltaBlock
                label="Cheapest method"
                costNow={mid(p.cheap_cost_low ?? project.estimated_cost_low, p.cheap_cost_high ?? project.estimated_cost_high)}
                costNew={mid(preview.cheap_cost_low, preview.cheap_cost_high)}
                hoursNow={mid(p.cheap_hours_low ?? project.estimated_hours_low, p.cheap_hours_high ?? project.estimated_hours_high)}
                hoursNew={mid(preview.cheap_hours_low, preview.cheap_hours_high)}
                costRange={rangeText(preview.cheap_cost_low, preview.cheap_cost_high, formatCurrency)}
                hoursRange={rangeText(preview.cheap_hours_low, preview.cheap_hours_high, formatHours)}
              />
              <DeltaBlock
                label="Fastest method"
                costNow={mid(p.fast_cost_low, p.fast_cost_high)}
                costNew={mid(preview.fast_cost_low, preview.fast_cost_high)}
                hoursNow={mid(p.fast_hours_low, p.fast_hours_high)}
                hoursNew={mid(preview.fast_hours_low, preview.fast_hours_high)}
                costRange={rangeText(preview.fast_cost_low, preview.fast_cost_high, formatCurrency)}
                hoursRange={rangeText(preview.fast_hours_low, preview.fast_hours_high, formatHours)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
                {finalizeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Finalize changes
              </Button>
              <Button variant="ghost" onClick={discardDraft} disabled={finalizeMutation.isPending}>
                Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
          <div className="flex justify-end">
            <CompleteProjectDialog projectId={projectId} isDone={project.status === "done"} size="lg" />
          </div>
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
                <div className="space-y-3">
                  <p className="text-sm font-medium">Gathered details</p>
                  {Object.keys(spec).map((key) => {
                    const locked = key.toLowerCase() === "room";
                    const value = draftSpec[key];
                    const current = value == null ? "" : String(value);
                    const opts = specOptions[key] ?? [];
                    const choices = opts.includes(current) || !current ? opts : [current, ...opts];
                    const changed = String(spec[key] ?? "") !== current;
                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs capitalize text-muted-foreground">
                          {key.replace(/_/g, " ")}
                          {changed && <span className="ml-1 text-primary">• changed</span>}
                        </Label>
                        {locked ? (
                          <p className="text-sm">{current}</p>
                        ) : choices.length > 1 ? (
                          <div className="space-y-2">
                            <Select
                              value={customFields[key] ? OTHER_OPTION : current}
                              onValueChange={(v) => {
                                if (v === OTHER_OPTION) {
                                  setCustomFields((prev) => ({ ...prev, [key]: true }));
                                  setCustomInputs((prev) => ({ ...prev, [key]: "" }));
                                  setCustomResults((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                  return;
                                }
                                setCustomFields((prev) => ({ ...prev, [key]: false }));
                                setDraftField(key, v);
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {choices.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                                <SelectItem value={OTHER_OPTION}>Other…</SelectItem>
                              </SelectContent>
                            </Select>
                            {customFields[key] && (
                              <div className="space-y-2 rounded border border-border p-3">
                                <div className="flex gap-2">
                                  <Input
                                    className="h-8 text-sm"
                                    value={customInputs[key] ?? ""}
                                    maxLength={80}
                                    autoComplete="off"
                                    placeholder={`Enter another ${key.replace(/_/g, " ")}`}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setCustomInputs((prev) => ({ ...prev, [key]: value }));
                                      setCustomResults((prev) => {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const value = (customInputs[key] ?? "").trim();
                                        if (value.length >= 2 && !validateOptionMutation.isPending) {
                                          validateOptionMutation.mutate({ key, value });
                                        }
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={(customInputs[key] ?? "").trim().length < 2 || validateOptionMutation.isPending}
                                    onClick={() => validateOptionMutation.mutate({ key, value: (customInputs[key] ?? "").trim() })}
                                  >
                                    {validateOptionMutation.isPending && validateOptionMutation.variables?.key === key ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      "Check"
                                    )}
                                  </Button>
                                </div>
                                {customResults[key] && !customResults[key].valid && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-destructive">{customResults[key].message}</p>
                                    {customResults[key].suggestions.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {customResults[key].suggestions.map((suggestion) => (
                                          <Button
                                            key={suggestion}
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="h-7 text-xs"
                                            onClick={() => {
                                              setDraftField(key, suggestion);
                                              setCustomFields((prev) => ({ ...prev, [key]: false }));
                                            }}
                                          >
                                            {suggestion}
                                          </Button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {validateOptionMutation.isError && validateOptionMutation.variables?.key === key && (
                                  <p className="text-xs text-destructive">Couldn't check that option. Try again.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Input
                            className="h-8 text-sm"
                            value={current}
                            onChange={(e) =>
                              setDraftField(
                                key,
                                typeof spec[key] === "number" && e.target.value !== "" && !Number.isNaN(Number(e.target.value))
                                  ? Number(e.target.value)
                                  : e.target.value,
                              )
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                  {isDirty && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => previewMutation.mutate()}
                      disabled={previewMutation.isPending}
                    >
                      {previewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      Preview changes
                    </Button>
                  )}
                  {previewMutation.isError && (
                    <p className="text-xs text-destructive">Couldn't preview those changes. Try again.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tool list</CardTitle>
              <CardDescription>Owned, required and recommended tools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {uniqueTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tools listed yet. Generate an estimate to see required and recommended tools.
                </p>
              ) : (
                uniqueTools.map((tool) => <ToolRow key={tool.id} tool={tool} />)
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

function MethodCard({
  icon,
  label,
  hint,
  cost,
  hours,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  cost: string;
  hours: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="label-caps">{label}</p>
          <p className="stat-figure mt-1 text-xl font-semibold">{cost}</p>
          <p className="text-sm text-muted-foreground">{hours === "—" ? "—" : `${hours} labor`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBlock({
  label,
  costNow,
  costNew,
  hoursNow,
  hoursNew,
  costRange,
  hoursRange,
}: {
  label: string;
  costNow: number | null;
  costNew: number | null;
  hoursNow: number | null;
  hoursNew: number | null;
  costRange: string;
  hoursRange: string;
}) {
  const delta = (now: number | null, next: number | null, fmt: (v: number) => string) => {
    if (now == null || next == null) return null;
    const d = next - now;
    if (Math.abs(d) < 0.5) return <span className="text-muted-foreground">no change</span>;
    return (
      <span className={d > 0 ? "text-destructive" : "text-success"}>
        {d > 0 ? "+" : "−"}
        {fmt(Math.abs(d))}
      </span>
    );
  };
  return (
    <div className="rounded border border-border p-3 text-sm">
      <p className="label-caps">{label}</p>
      <p className="mt-1">
        Cost: {delta(costNow, costNew, formatCurrency)} <span className="text-muted-foreground">→ {costRange}</span>
      </p>
      <p>
        Hours: {delta(hoursNow, hoursNew, formatHours)} <span className="text-muted-foreground">→ {hoursRange}</span>
      </p>
    </div>
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
            {tool.already_owned ? (
              <Badge variant="outline" className="border-success text-[10px] text-success">Owned</Badge>
            ) : tool.role === "required" ? (
              <Badge variant="default" className="text-[10px]">Required</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
            )}
            <span className="font-medium">{tool.tool_name}</span>
          </div>
          {tool.rationale && <p className="mt-1 text-xs text-muted-foreground">{tool.rationale}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {!tool.already_owned && tool.estimated_price != null && (
              <span>Buy ~{formatCurrency(tool.estimated_price)}</span>
            )}
            {!tool.already_owned && tool.rental_price_per_day != null && (
              <span>Rent ~{formatCurrency(tool.rental_price_per_day)}/day</span>
            )}
            {tool.hours_saved != null && tool.hours_saved > 0 && (
              <span className="text-success">Saves {formatHours(tool.hours_saved)}</span>
            )}
            {tool.search_links?.["buy"] && (
              <a
                href={tool.search_links["buy"]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Buy <ExternalLink className="size-3" />
              </a>
            )}
            {tool.search_links?.["rent"] && (
              <a
                href={tool.search_links["rent"]}
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
        {tool.already_owned ? (
          <Badge variant="outline" className="border-success text-[10px] text-success">Owned</Badge>
        ) : (
          <Badge variant={tool.role === "required" ? "default" : "secondary"} className="text-[10px]">
            {tool.role === "required" ? "Required" : "Recommended"}
          </Badge>
        )}
      </div>
      {tool.rationale && <p className="text-xs text-muted-foreground">{tool.rationale}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {tool.already_owned && <span className="text-success">In your toolkit · $0</span>}
        {!tool.already_owned && tool.estimated_price != null && <span>Buy ~{formatCurrency(tool.estimated_price)}</span>}
        {!tool.already_owned && tool.rental_price_per_day != null && <span>Rent ~{formatCurrency(tool.rental_price_per_day)}/day</span>}
        {tool.hours_saved != null && tool.hours_saved > 0 && (
          <span className="text-success">Saves {formatHours(tool.hours_saved)}</span>
        )}
      </div>
    </div>
  );
}
