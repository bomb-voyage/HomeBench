import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import {
  intakeResponseSchema,
  projectEstimateSchema,
  previewEstimateSchema,
  validateSpecOptionResultSchema,
  type NextQuestionInput,
  type GenerateEstimateInput,
  type IntakeResponse,
  type ProjectEstimateOutput,
  type PreviewEstimateOutput,
  type EstimateBaseline,
  type ValidateSpecOptionResult,
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
- Prioritize: project type, location/scope within the home, dimensions or area, materials/finish level, and any conditions that affect labor (demolition, electrical, plumbing, permits, accessibility).
- If the user says "I don't know", suggest a reasonable default and move on.
- After EVERY reply, return a complete \\"spec\\" object that includes every fact learned so far, preserving all facts from the previous spec. Do NOT return null or omit it. If absolutely nothing is known, return {}.
- Set "done": true only when you have enough information to estimate (at minimum: project type, scope/location, approximate dimensions/area, and primary materials/finish). When done, "question" must be null. If you are not done, ask the single most important missing question.
- Keep messages short and conversational, 1-2 sentences.

Example response when some facts are known:
{
  "done": false,
  "question": "Roughly how many square feet is the backsplash area?",
  "spec": {
    "project_type": "backsplash install",
    "room": "kitchen",
    "material": "subway tile",
    "finish": "white grout"
  }
}

Return JSON matching this schema exactly:
{
  "done": boolean,
  "question": string | null, // next question; null when done
  "spec": object // key/value summary of all known facts so far
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
  "cheap_cost_low": number | null,   // CHEAPEST method: materials + required tools only (buy or rent, whichever is cheaper; owned tools $0), USD
  "cheap_cost_high": number | null,
  "cheap_hours_low": number | null,  // CHEAPEST method DIY labor hours
  "cheap_hours_high": number | null,
  "fast_cost_low": number | null,    // FASTEST method: cheapest method plus every recommended time-saving tool (buy or rent, whichever is cheaper for this job), USD
  "fast_cost_high": number | null,
  "fast_hours_low": number | null,   // FASTEST method DIY labor hours (cheap hours minus hours saved)
  "fast_hours_high": number | null,
  "estimated_value_added": number | null,  // estimated dollar increase to home value
  "estimated_value_added_pct": number | null, // percentage of home value, e.g. 0.03 = 3%
  "estimate_notes": string | null,         // one paragraph summary of assumptions and caveats
  "spec_options": { [specKey: string]: string[] }, // for each spec key with a discrete choice (material, type, finish, height...), 3-6 realistic alternatives INCLUDING the current value. Omit free-form or dimension keys.
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
- Keep each range TIGHT (high end no more than ~25% above low end). Each method is one specific approach, not a blend. Return "estimate_notes" explaining assumptions.${
    input.targetTotals
      ? `

## Previewed totals (the homeowner already saw and accepted these)
${JSON.stringify(input.targetTotals)}
Your cheap_* and fast_* totals MUST match these previewed numbers (within ~5%). Build the steps and tools so they add up to them.`
      : ""
  }`;
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch && blockMatch[1]) return blockMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
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
  if (Object.keys(input.currentSpec ?? {}).length > 0) {
    messages.push({
      role: "assistant",
      content: `Facts gathered so far: ${JSON.stringify(input.currentSpec)}.`,
    });
  }
  for (const m of input.history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.message });

  try {
    const { text } = await generateText({
      model,
      messages,
      system: intakeSystemPrompt(),
    });

    const parsed = JSON.parse(extractJsonBlock(text));
    const result = intakeResponseSchema.parse(parsed);
    return {
      done: result.done,
      question: result.question ?? null,
      spec: result.spec ?? input.currentSpec ?? null,
    };
  } catch (error) {
    if (error instanceof NoObjectGeneratedError) {
      return {
        done: false,
        question: "Tell me a bit more about what you're hoping to do.",
        spec: input.currentSpec ?? {},
      };
    }
    return {
      done: false,
      question: "Could you clarify what you'd like to do?",
      spec: input.currentSpec ?? {},
    };
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
  });

  const parsed = JSON.parse(extractJsonBlock(text));
  const result = projectEstimateSchema.parse(parsed);
  // Keep legacy combined fields populated: cost from cheapest, hours from fastest..cheapest
  result.estimated_cost_low = result.cheap_cost_low ?? result.estimated_cost_low ?? null;
  result.estimated_cost_high = result.fast_cost_high ?? result.estimated_cost_high ?? null;
  result.estimated_hours_low = result.fast_hours_low ?? result.estimated_hours_low ?? null;
  result.estimated_hours_high = result.cheap_hours_high ?? result.estimated_hours_high ?? null;
  return result;
}

export async function previewProjectEstimate(
  input: GenerateEstimateInput,
  context: { roomName?: string | null; roomType?: string | null; homeSquareFeet?: number | null },
  apiKey: string,
  baseline: EstimateBaseline | null = null,
): Promise<PreviewEstimateOutput> {
  const gateway = createLovableAiGatewayProvider(apiKey, undefined, { structuredOutputs: false });
  // Same model as the full estimate so preview and finalized numbers agree.
  const model = gateway(ESTIMATE_MODEL);
  const baselineBlock = baseline
    ? `
## Current saved estimate (for the ORIGINAL spec below)
Original spec:
${Object.entries(baseline.spec).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
Saved totals: ${JSON.stringify(baseline.totals)}

Start from the saved totals and adjust ONLY for what changed between the original spec and the new spec. Work out the change concretely: quantity (area/length with ~10% waste) x unit price difference of the material, plus any added/removed supplies, underlayment, tools, or labor that the change implies. Unchanged items keep their saved cost and hours.`
    : "";
  const system = `You are Homebench, an expert residential cost estimator for US DIY homeowners.

${homeContextPrompt({ ...input, ...context })}
${baselineBlock}

## New project spec
Title: ${input.title}
${Object.entries(input.spec).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Estimate two methods with TIGHT ranges (high no more than ~25% above low):
- CHEAPEST: materials + permits + supplies + required tools only (buy or rent, whichever is cheaper; owned tools $0).
- FASTEST: cheapest plus recommended time-saving tools (buy or rent, whichever is cheaper).

Return ONLY JSON:
{
  "cheap_cost_low": number, "cheap_cost_high": number, "cheap_hours_low": number, "cheap_hours_high": number,
  "fast_cost_low": number, "fast_cost_high": number, "fast_hours_low": number, "fast_hours_high": number,
  "estimated_value_added": number | null,
  "summary": string // one sentence on what drives the change
}`;
  const { text } = await generateText({
    model,
    system,
    messages: [{ role: "user", content: "Estimate this project." }],
  });
  return previewEstimateSchema.parse(JSON.parse(extractJsonBlock(text)));
}

export async function validateProjectSpecOption(
  input: {
    title: string;
    key: string;
    value: string;
    spec: Record<string, unknown>;
  },
  apiKey: string,
): Promise<ValidateSpecOptionResult> {
  const gateway = createLovableAiGatewayProvider(apiKey, undefined, { structuredOutputs: false });
  const model = gateway(INTAKE_MODEL);
  const system = `You validate one proposed option for a US residential DIY project.

Decide whether the proposed value is a real, practical value for the named project detail and can be used in a cost and labor estimate. Correct spelling and normalize common trade names. Reject unrelated, unsafe, impossible, or too-vague values. Never add a unit unless the detail clearly requires one.

If valid, return a concise normalizedValue and up to 3 closely related alternatives. If invalid, normalizedValue must be null and return 3-5 practical alternatives that fit this exact project and detail.

Return ONLY JSON:
{
  "valid": boolean,
  "normalizedValue": string | null,
  "suggestions": string[],
  "message": string
}`;
  const { text } = await generateText({
    model,
    system,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          project: input.title,
          currentProjectDetails: input.spec,
          detail: input.key,
          proposedValue: input.value,
        }),
      },
    ],
  });
  return validateSpecOptionResultSchema.parse(JSON.parse(extractJsonBlock(text)));
}

export function buildSearchLinks(toolName: string): { buy: string; rent: string } {
  const encoded = encodeURIComponent(toolName);
  return {
    buy: `https://www.homedepot.com/s/${encoded.replace(/%20/g, "+")}`,
    rent: `https://www.google.com/search?q=rent+${encoded.replace(/%20/g, "+")}+near+me`,
  };
}
