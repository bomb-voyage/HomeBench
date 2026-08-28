import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import {
  intakeResponseSchema,
  projectEstimateSchema,
  type NextQuestionInput,
  type GenerateEstimateInput,
  type IntakeResponse,
  type ProjectEstimateOutput,
} from "./projects-schema";

const INTAKE_MODEL = "google/gemini-3.7-flash";
const ESTIMATE_MODEL = "google/gemini-3.1-pro-preview";

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "$—";
  return `$${Math.round(value).toLocaleString()}`;
}

function homeContextPrompt(input: Pick<GenerateEstimateInput, "homeValue" | "scopeType"> & { roomName?: string | null; roomType?: string | null; homeSquareFeet?: number | null }): string {
  const lines = [
    "## Home context",
    `- Project scope: ${input.scopeType === "whole_property" ? "whole property / exterior" : `specific room${input.roomName ? ` (${input.roomName}${input.roomType ? `, ${input.roomType}` : ""})` : ""}`}`,
    input.homeSquareFeet ? `- Home size: ${input.homeSquareFeet} sq ft` : null,
    input.homeValue ? `- Estimated home value: ${formatCurrency(input.homeValue)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function intakeSystemPrompt(): string {
  return `You are Homebench, a friendly DIY home-project planning assistant.

Your job is to interview the homeowner so we can produce a reliable cost, labor, and value-added estimate. Ask ONE concise follow-up question at a time. Never ask more than one question per message.

Rules:
- Confirm what they already told you, then ask the next most important missing detail.
- Prioritize: location/scope within the home, dimensions, materials/finish level, and any conditions that affect labor (demolition, electrical, plumbing, permits, accessibility).
- If the user says "I don't know", suggest a reasonable default and move on.
- When you have enough information to estimate, set "done": true and return a structured spec object summarizing every key detail. Do NOT ask another question when done.
- Keep messages short and conversational, 1-2 sentences.

Return JSON matching this schema exactly:
{
  "done": boolean,
  "question": string | null, // next question; null when done
  "spec": object | null // key/value summary when done; null otherwise
}`;
}

function estimateSystemPrompt(input: GenerateEstimateInput & { roomName?: string | null; roomType?: string | null; homeSquareFeet?: number | null }): string {
  return `You are Homebench, an expert residential cost estimator. Produce a detailed, practical estimate for a DIY homeowner in the United States.

${homeContextPrompt(input)}

## Project spec
Title: ${input.title}
Scope type: ${input.scopeType}
${Object.entries(input.spec)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

Return JSON matching this schema exactly:
{
  "estimated_cost_low": number | null,     // total material cost low end in USD
  "estimated_cost_high": number | null,    // total material cost high end in USD
  "estimated_hours_low": number | null,    // total DIY labor hours low end
  "estimated_hours_high": number | null,   // total DIY labor hours high end
  "estimated_value_added": number | null,  // estimated dollar increase to home value
  "estimated_value_added_pct": number | null, // percentage of home value, e.g. 0.03 = 3%
  "estimate_notes": string | null,         // one paragraph summary of assumptions and caveats
  "steps": [
    {
      "sort_order": number,
      "title": string,
      "description": string | null,
      "estimated_hours_low": number | null,
      "estimated_hours_high": number | null,
      "recommended_tools": [
        {
          "tool_name": string,
          "already_owned": boolean,
          "role": "required" | "recommended",
          "acquisition": "buy" | "rent" | "already_owned",
          "estimated_price": number | null,
          "rental_price_per_day": number | null,
          "hours_saved": number | null,
          "rationale": string | null,
          "search_links": { "buy": string | null, "rent": string | null } | null
        }
      ]
    }
  ],
  "tools": [
    // Flat list of all distinct tools across steps with the same schema as recommended_tools.
    // Mark already_owned false unless the spec clearly says the user owns it.
  ]
}

Guidelines:
- Be specific: use the actual materials, dimensions, and finish level from the spec.
- Cost should cover materials + permits + disposable supplies the DIYer must buy. Exclude tools the user already owns.
- Labor hours should reflect a careful but non-professional DIYer, including cleanup and a small buffer.
- Value-added should be realistic: modest projects often add 50-100% of cost or less; high-impact kitchen/bath work may add more. Use percent of home value where helpful.
- For each step, recommend 0-3 helpful tools. Required tools are necessary to complete the step; recommended tools are optional but save meaningful time/effort. Provide plausible buy and rental search links as URLs to a major retailer or rental search (e.g. The Home Depot, Lowe's, Sunbelt). Set estimated prices to null when truly unknown.
- If a tool would save hours, set hours_saved to a positive number and explain in rationale.
- Keep estimates in a reasonable range. Return "estimate_notes" explaining assumptions.`;
}

export async function askNextIntakeQuestion(
  input: NextQuestionInput,
  apiKey: string,
): Promise<IntakeResponse> {
  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway(INTAKE_MODEL);

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  messages.push({
    role: "assistant",
    content: `Great, let's plan your ${input.scopeType === "whole_property" ? "whole-property" : "room"} project.`,
  });
  for (const m of input.history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.message });

  try {
    const { text } = await generateText({
      model,
      messages,
      system: intakeSystemPrompt(),
      providerOptions: { lovable: { response_format: { type: "json_object" } } },
    });

    const parsed = JSON.parse(text);
    return intakeResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof NoObjectGeneratedError) {
      return {
        done: false,
        question: "Tell me a bit more about what you're hoping to do.",
        spec: null,
      };
    }
    throw error;
  }
}

export async function generateProjectEstimate(
  input: GenerateEstimateInput,
  context: { roomName?: string | null; roomType?: string | null; homeSquareFeet?: number | null },
  apiKey: string,
): Promise<ProjectEstimateOutput> {
  const gateway = createLovableAiGatewayProvider(apiKey, undefined, { structuredOutputs: false });
  const model = gateway(ESTIMATE_MODEL);

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: `Please estimate this DIY project:\n\n${JSON.stringify(input.spec, null, 2)}`,
      },
    ],
    system: estimateSystemPrompt({ ...input, ...context }),
    providerOptions: { lovable: { response_format: { type: "json_object" } } },
  });

  const parsed = JSON.parse(text);
  return projectEstimateSchema.parse(parsed);
}

export function buildSearchLinks(toolName: string): { buy: string; rent: string } {
  const encoded = encodeURIComponent(toolName);
  return {
    buy: `https://www.homedepot.com/s/${encoded.replace(/%20/g, "+")}`,
    rent: `https://www.google.com/search?q=rent+${encoded.replace(/%20/g, "+")}+near+me`,
  };
}
