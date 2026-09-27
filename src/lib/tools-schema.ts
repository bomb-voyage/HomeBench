import { z } from "zod";

export const toolSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
});

export const toolSuggestionsSchema = z.object({
  suggestions: z.array(toolSuggestionSchema).default([]),
});

export type ToolSuggestion = z.infer<typeof toolSuggestionSchema>;

export function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
