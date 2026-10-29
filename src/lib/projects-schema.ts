import { z } from "zod";

export const PROJECT_SCOPE_TYPES = ["room", "whole_property"] as const;
export const PROJECT_STATUSES = ["todo", "in_progress", "done", "archived"] as const;
export const ESTIMATE_STATUSES = ["draft", "estimating", "estimated", "error"] as const;
export const TOOL_ROLES = ["required", "recommended"] as const;
export const TOOL_ACQUISITIONS = ["buy", "rent", "already_owned"] as const;

export const intakeMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string(),
});

export type IntakeMessage = z.infer<typeof intakeMessageSchema>;

export const projectSpecSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
).describe("Free-form key/value project specifications");

export type ProjectSpec = z.infer<typeof projectSpecSchema>;

export const toolEstimateSchema = z.object({
  tool_name: z.string(),
  already_owned: z.boolean().default(false),
  role: z.enum(TOOL_ROLES).default("required"),
  acquisition: z.enum(TOOL_ACQUISITIONS).default("buy"),
  estimated_price: z.number().nullable().optional(),
  rental_price_per_day: z.number().nullable().optional(),
  hours_saved: z.number().nullable().optional(),
  rationale: z.string().nullable().optional(),
  search_links: z.record(z.union([z.string(), z.null()])).nullable().optional(),
});

export type ToolEstimate = z.infer<typeof toolEstimateSchema>;

export const stepEstimateSchema = z.object({
  sort_order: z.number().int().default(0),
  title: z.string(),
  description: z.string().nullable().optional(),
  estimated_hours_low: z.number().nullable().optional(),
  estimated_hours_high: z.number().nullable().optional(),
  recommended_tools: z.array(toolEstimateSchema).default([]),
});

export type StepEstimate = z.infer<typeof stepEstimateSchema>;

const methodFields = {
  cheap_cost_low: z.number().nullable().optional(),
  cheap_cost_high: z.number().nullable().optional(),
  cheap_hours_low: z.number().nullable().optional(),
  cheap_hours_high: z.number().nullable().optional(),
  fast_cost_low: z.number().nullable().optional(),
  fast_cost_high: z.number().nullable().optional(),
  fast_hours_low: z.number().nullable().optional(),
  fast_hours_high: z.number().nullable().optional(),
};

export const projectEstimateSchema = z.object({
  estimated_cost_low: z.number().nullable().optional(),
  estimated_cost_high: z.number().nullable().optional(),
  estimated_hours_low: z.number().nullable().optional(),
  estimated_hours_high: z.number().nullable().optional(),
  ...methodFields,
  estimated_value_added: z.number().nullable().optional(),
  estimated_value_added_pct: z.number().nullable().optional(),
  estimate_notes: z.string().nullable().optional(),
  spec_options: z.record(z.array(z.string())).nullable().optional(),
  steps: z.array(stepEstimateSchema).default([]),
  tools: z.array(toolEstimateSchema).default([]),
});

export type ProjectEstimateOutput = z.infer<typeof projectEstimateSchema>;

export const previewEstimateSchema = z.object({
  ...methodFields,
  estimated_value_added: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type PreviewEstimateOutput = z.infer<typeof previewEstimateSchema>;

export const validateSpecOptionInputSchema = z.object({
  projectId: z.string().uuid(),
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(2).max(80),
});

export const validateSpecOptionResultSchema = z.object({
  valid: z.boolean(),
  normalizedValue: z.string().trim().min(1).max(80).nullable(),
  suggestions: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
  message: z.string().trim().min(1).max(240),
});

export type ValidateSpecOptionResult = z.infer<typeof validateSpecOptionResultSchema>;

export const intakeResponseSchema = z.object({
  done: z.boolean().default(false),
  question: z.string().nullable().optional(),
  material_options: z.array(z.string().trim().min(1).max(80)).max(4).nullable().optional(),
  spec: projectSpecSchema,
});

export type IntakeResponse = z.infer<typeof intakeResponseSchema>;

export const nextQuestionInputSchema = z.object({
  projectId: z.string().uuid().optional(),
  homeId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  scopeType: z.enum(PROJECT_SCOPE_TYPES),
  title: z.string().min(1).optional(),
  message: z.string().min(1),
  history: z.array(intakeMessageSchema).default([]),
  currentSpec: projectSpecSchema.default({}),
});

export type NextQuestionInput = z.infer<typeof nextQuestionInputSchema>;

export const generateEstimateInputSchema = z.object({
  projectId: z.string().uuid(),
  homeId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  scopeType: z.enum(PROJECT_SCOPE_TYPES),
  title: z.string().min(1),
  spec: projectSpecSchema,
  homeValue: z.number().nullable().optional(),
  // Totals from a preview the user accepted; finalize must stay consistent with them.
  targetTotals: z.object(methodFields).nullable().optional(),
});

export type EstimateBaseline = {
  spec: Record<string, unknown>;
  totals: Record<string, number | null>;
};

export type GenerateEstimateInput = z.infer<typeof generateEstimateInputSchema>;

export const createProjectInputSchema = z.object({
  homeId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  scopeType: z.enum(PROJECT_SCOPE_TYPES).default("room"),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  spec: projectSpecSchema.default({}),
  intakeState: z.array(intakeMessageSchema).default([]),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  scopeType: z.enum(PROJECT_SCOPE_TYPES).optional(),
  roomId: z.string().uuid().nullable().optional(),
  spec: projectSpecSchema.optional(),
  intakeState: z.array(intakeMessageSchema).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const listProjectsInputSchema = z.object({
  homeId: z.string().uuid(),
});

export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;
