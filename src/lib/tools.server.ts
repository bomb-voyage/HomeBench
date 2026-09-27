import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway";
import { toolSuggestionsSchema, type ToolSuggestion } from "./tools-schema";

const TOOL_MODEL = "openai/gpt-6-astra";

function extractJson(text: string): string {
  const t = text.trim();
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block?.[1]) return block[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a !== -1 && b > a ? t.slice(a, b + 1) : t;
}

export async function suggestStandardTools(query: string, apiKey: string): Promise<ToolSuggestion[]> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(TOOL_MODEL),
    system: `You standardize names of tools a US homeowner might own for DIY projects.
Given what the user typed (possibly misspelled, a brand, or vague), return 3-6 standardized tool names they most likely mean, best match first.
Use generic trade names (e.g. "Cordless drill/driver", "Circular saw", "Wet tile saw", "Post hole digger"), not brand or model names. Put any brand in "brand" only if the user typed one.
Category must be one of: Power tools, Hand tools, Measuring, Cutting, Fastening, Painting, Plumbing, Electrical, Outdoor & yard, Safety, Ladders & access, Other.
If the input is not a tool at all, return an empty list.
Return ONLY JSON: {"suggestions":[{"name": string, "category": string, "brand": string | null}]}`,
    messages: [{ role: "user", content: query }],
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  const parsed = toolSuggestionsSchema.safeParse(JSON.parse(extractJson(text)));
  if (!parsed.success) return [];
  return parsed.data.suggestions.slice(0, 6);
}
