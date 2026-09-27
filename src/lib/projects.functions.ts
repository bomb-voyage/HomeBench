import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  askNextIntakeQuestion,
  generateProjectEstimate,
  previewProjectEstimate,
  validateProjectSpecOption,
  buildSearchLinks,
} from "./projects.server";
import {
  createProjectInputSchema,
  generateEstimateInputSchema,
  listProjectsInputSchema,
  nextQuestionInputSchema,
  projectEstimateSchema,
  updateProjectInputSchema,
  validateSpecOptionInputSchema,
  type ProjectEstimateOutput,
} from "./projects-schema";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listProjectsInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { data: projects, error } = await context.supabase
      .from("projects")
      .select("*, rooms(name, room_type)")
      .eq("home_id", data.homeId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return projects ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*, rooms(name, room_type), project_steps(*), project_tools(*), project_estimates(*)")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();

    if (error) throw new Error(error.message);
    return project;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createProjectInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const insert = {
      user_id: context.userId,
      home_id: data.homeId,
      room_id: data.roomId ?? null,
      scope_type: data.scopeType,
      title: data.title,
      description: data.description ?? null,
      spec: data.spec,
      intake_state: data.intakeState,
      status: "todo" as const,
      estimate_status: "draft" as const,
    };

    const { data: project, error } = await context.supabase
      .from("projects")
      .insert(insert as any)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return project;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateProjectInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const update: Partial<Database["public"]["Tables"]["projects"]["Update"]> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.status !== undefined) update.status = data.status;
    if (data.scopeType !== undefined) update.scope_type = data.scopeType;
    if (data.roomId !== undefined) update.room_id = data.roomId;
    if (data.spec !== undefined) update.spec = data.spec as any;
    if (data.intakeState !== undefined) update.intake_state = data.intakeState as any;

    const { data: project, error } = await context.supabase
      .from("projects")
      .update(update as any)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const nextIntakeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => nextQuestionInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("AI gateway is not configured. Please set LOVABLE_API_KEY.");
    }
    return askNextIntakeQuestion(data, apiKey);
  });

async function loadEstimateContext(
  supabase: SupabaseClient<Database>,
  homeId: string,
  roomId: string | null | undefined,
) {
  const [{ data: home }, { data: room }] = await Promise.all([
    supabase.from("homes").select("square_feet, estimated_value").eq("id", homeId).single(),
    roomId
      ? supabase.from("rooms").select("name, room_type").eq("id", roomId).single()
      : Promise.resolve({ data: null }),
  ]);
  return {
    roomName: room?.name ?? null,
    roomType: room?.room_type ?? null,
    homeSquareFeet: home?.square_feet ?? null,
  };
}

export const generateEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => generateEstimateInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("AI gateway is not configured. Please set LOVABLE_API_KEY.");
    }
    const ctx = await loadEstimateContext(context.supabase, data.homeId, data.roomId);
    const estimate = await generateProjectEstimate(data, ctx, apiKey);
    await saveEstimateInternal(context.supabase, context.userId, data.projectId, data.spec, estimate);
    return estimate;
  });

export const previewEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => generateEstimateInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("AI gateway is not configured. Please set LOVABLE_API_KEY.");
    }
    const ctx = await loadEstimateContext(context.supabase, data.homeId, data.roomId);
    const { data: saved } = await context.supabase
      .from("projects")
      .select("spec, cheap_cost_low, cheap_cost_high, cheap_hours_low, cheap_hours_high, fast_cost_low, fast_cost_high, fast_hours_low, fast_hours_high")
      .eq("id", data.projectId)
      .single();
    const baseline = saved && saved.cheap_cost_low != null
      ? {
          spec: (saved.spec ?? {}) as Record<string, unknown>,
          totals: {
            cheap_cost_low: saved.cheap_cost_low, cheap_cost_high: saved.cheap_cost_high,
            cheap_hours_low: saved.cheap_hours_low, cheap_hours_high: saved.cheap_hours_high,
            fast_cost_low: saved.fast_cost_low, fast_cost_high: saved.fast_cost_high,
            fast_hours_low: saved.fast_hours_low, fast_hours_high: saved.fast_hours_high,
          },
        }
      : null;
    return previewProjectEstimate(data, ctx, apiKey, baseline);
  });

export const validateSpecOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => validateSpecOptionInputSchema.parse(data))
  .handler(async ({ context, data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("AI gateway is not configured. Please set LOVABLE_API_KEY.");
    }
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("title, spec")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .single();
    if (error || !project) throw new Error(error?.message ?? "Project not found");

    return validateProjectSpecOption(
      {
        title: project.title,
        key: data.key,
        value: data.value,
        spec: (project.spec ?? {}) as Record<string, unknown>,
      },
      apiKey,
    );
  });

async function saveEstimateInternal(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string,
  spec: Record<string, unknown>,
  estimate: ProjectEstimateOutput,
) {
  const methods = {
    cheap_cost_low: estimate.cheap_cost_low ?? null,
    cheap_cost_high: estimate.cheap_cost_high ?? null,
    cheap_hours_low: estimate.cheap_hours_low ?? null,
    cheap_hours_high: estimate.cheap_hours_high ?? null,
    fast_cost_low: estimate.fast_cost_low ?? null,
    fast_cost_high: estimate.fast_cost_high ?? null,
    fast_hours_low: estimate.fast_hours_low ?? null,
    fast_hours_high: estimate.fast_hours_high ?? null,
  };
  // Snapshot estimate
  const { error: snapshotError } = await supabase.from("project_estimates").insert({
    user_id: userId,
    project_id: projectId,
    spec,
    estimated_cost_low: estimate.estimated_cost_low ?? null,
    estimated_cost_high: estimate.estimated_cost_high ?? null,
    estimated_hours_low: estimate.estimated_hours_low ?? null,
    estimated_hours_high: estimate.estimated_hours_high ?? null,
    ...methods,
    estimated_value_added: estimate.estimated_value_added ?? null,
    estimated_value_added_pct: estimate.estimated_value_added_pct ?? null,
    estimate_notes: estimate.estimate_notes ?? null,
  } as any);
  if (snapshotError) throw new Error(snapshotError.message);

  // Update project top-level estimate
  const { error: projectError } = await supabase
    .from("projects")
    .update({
      estimated_cost_low: estimate.estimated_cost_low ?? null,
      estimated_cost_high: estimate.estimated_cost_high ?? null,
      estimated_hours_low: estimate.estimated_hours_low ?? null,
      estimated_hours_high: estimate.estimated_hours_high ?? null,
      ...methods,
      estimated_value_added: estimate.estimated_value_added ?? null,
      estimated_value_added_pct: estimate.estimated_value_added_pct ?? null,
      estimate_notes: estimate.estimate_notes ?? null,
      estimated_at: new Date().toISOString(),
      estimate_status: "estimated",
      spec,
      ...(estimate.spec_options ? { spec_options: estimate.spec_options } : {}),
    } as any)
    .eq("id", projectId)
    .eq("user_id", userId);
  if (projectError) throw new Error(projectError.message);

  // Delete previous steps and tools for this project, then recreate
  const { error: deleteStepsError } = await supabase
    .from("project_steps")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (deleteStepsError) throw new Error(deleteStepsError.message);

  const { error: deleteToolsError } = await supabase
    .from("project_tools")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (deleteToolsError) throw new Error(deleteToolsError.message);

  // Insert steps
  const stepRows: {
    project_id: string;
    user_id: string;
    sort_order: number;
    title: string;
    description: string | null;
    estimated_hours_low: number | null;
    estimated_hours_high: number | null;
  }[] = [];
  const toolRows: {
    project_id: string;
    user_id: string;
    step_id: string | null;
    tool_id: string | null;
    tool_name: string;
    already_owned: boolean;
    role: string;
    acquisition: string;
    estimated_price: number | null;
    rental_price_per_day: number | null;
    hours_saved: number | null;
    rationale: string | null;
    search_links: Record<string, string>;
    is_optional: boolean;
  }[] = [];

  const stepIds: string[] = [];
  for (const step of estimate.steps) {
    const { data: insertedStep, error: stepError } = await supabase
      .from("project_steps")
      .insert({
        project_id: projectId,
        user_id: userId,
        sort_order: step.sort_order,
        title: step.title,
        description: step.description ?? null,
        estimated_hours_low: step.estimated_hours_low ?? null,
        estimated_hours_high: step.estimated_hours_high ?? null,
      })
      .select()
      .single();
    if (stepError || !insertedStep) throw new Error(stepError?.message ?? "Failed to create step");
    stepIds.push(insertedStep.id);

    for (const tool of step.recommended_tools) {
      const links = tool.search_links ?? buildSearchLinks(tool.tool_name);
      toolRows.push({
        project_id: projectId,
        user_id: userId,
        step_id: insertedStep.id,
        tool_id: null,
        tool_name: tool.tool_name,
        already_owned: tool.already_owned,
        role: tool.role,
        acquisition: tool.acquisition,
        estimated_price: tool.estimated_price ?? null,
        rental_price_per_day: tool.rental_price_per_day ?? null,
        hours_saved: tool.hours_saved ?? null,
        rationale: tool.rationale ?? null,
        search_links: links as Record<string, string>,
        is_optional: tool.role === "recommended",
      });
    }
  }

  // Flat project_tools list (top-level required/recommended tools not tied to a step)
  for (const tool of estimate.tools) {
    const links = tool.search_links ?? buildSearchLinks(tool.tool_name);
    toolRows.push({
      project_id: projectId,
      user_id: userId,
      step_id: null,
      tool_id: null,
      tool_name: tool.tool_name,
      already_owned: tool.already_owned,
      role: tool.role,
      acquisition: tool.acquisition,
      estimated_price: tool.estimated_price ?? null,
      rental_price_per_day: tool.rental_price_per_day ?? null,
      hours_saved: tool.hours_saved ?? null,
      rationale: tool.rationale ?? null,
      search_links: links as Record<string, string>,
      is_optional: tool.role === "recommended",
    });
  }

  if (toolRows.length > 0) {
    const { error: toolsError } = await supabase.from("project_tools").insert(toolRows);
    if (toolsError) throw new Error(toolsError.message);
  }

  return { success: true };
}

export const saveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        projectId: z.string().uuid(),
        spec: z.record(z.unknown()),
        estimate: projectEstimateSchema,
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await saveEstimateInternal(context.supabase, context.userId, data.projectId, data.spec, data.estimate);
    return { success: true };
  });
