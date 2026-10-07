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

/** Split combined tool names ("Pry bar and putty knife", "Pry bar / putty knife") into individual normalized tools. */
export function toolNameParts(name: string): string[] {
  const cleaned = name.toLowerCase().replace(/\([^)]*\)/g, " ");
  const parts = cleaned
    .split(/\s*(?:\/|&|\+|,|;|\band\b|\bor\b|\bwith\b)\s*/)
    .map((p) => normalizeToolName(p))
    .filter((p) => p.length > 1)
    .map((p) => p.replace(/ives$/, "ife").replace(/(\w{3,}[^s])s$/, "$1"));
  const whole = normalizeToolName(name);
  return Array.from(new Set([whole, ...parts]));
}

export function toolNamesMatch(a: string, b: string): boolean {
  const pa = new Set(toolNameParts(a));
  return toolNameParts(b).some((p) => pa.has(p));
}
