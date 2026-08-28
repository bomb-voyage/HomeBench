# Phase 2 — AI Project Planner

Turn a vague idea ("fencing") into a fully specified project with cost, labor, value-added, a step-by-step work plan, and tool recommendations — all editable afterwards.

## The flow

1. **Start a project.** From the dashboard or a new Projects page, the user types or searches what they want to do. Scope choice: a mapped room, the exterior/yard, or the whole property.
2. **Guided intake.** The AI asks one question at a time, tailored to the project type. Each question comes with suggested answer chips (e.g. "Chain-link", "Wood privacy", "Vinyl") plus a free-text box, so nothing is locked to a preset list. Answers accumulate into a visible spec sheet. The AI stops asking once it has everything needed for a defensible estimate (scope/quantity, material, dimensions, finish, site conditions, permits).
3. **Style confirmation image.** When the answers imply a look (white picket fence, subway tile, shaker cabinets), the app generates an AI reference image and asks "Is this what you have in mind?" The user confirms or refines in words and regenerates. Confirmed image is saved with the project.
4. **Estimate + work plan.** On confirming the spec, the AI returns in one structured pass:
   - Cost range in dollars, itemized: materials, consumables, permits, plus any *required* tools the user doesn't already own (their tool list is sent as context so owned tools cost $0).
   - Total labor hours (low/high) for a DIY homeowner.
   - Estimated home-value impact, as a percent and a dollar figure derived from the home's value baseline, with a short rationale.
   - Ordered subtasks, each with its own hour range and a plain-language description.
5. **Tool recommendations per subtask.** For each step, optional tools that would speed it up: hours saved, an estimated purchase price, an estimated daily rental rate, and outbound search links (Home Depot, Lowe's, Amazon, local rental search) prefilled with the tool name and the user's city/ZIP. Prices are AI estimates and are labeled as such. Anything already in the user's toolbox is filtered out.
6. **Revise, don't restart.** The project page shows the spec as editable fields. Changing height, material, or scope marks the estimate stale and offers "Re-estimate" — one call, same project, history of prior estimates kept so the user can compare the 8-ft privacy fence against the 4-ft picket version side by side.

## Pages

- `/projects` — list of projects with status, cost range, hours, value impact; "New project" button.
- `/projects/new` — the guided intake wizard.
- `/projects/$projectId` — spec sheet, three headline numbers, step-by-step plan with tool recommendations, estimate history, edit/re-estimate controls.
- Dashboard gets a real Projects card replacing the placeholder, plus a Projects nav link.

## Technical notes

**Data model** (migration, RLS + GRANTs per existing pattern):
- `projects`: add `scope_type` (`room` | `exterior` | `whole_property`), `spec jsonb` (the confirmed answers), `intake_state jsonb` (question history while in progress), `reference_image_path`, `estimated_value_added_pct`, `estimate_status` (`draft` | `ready` | `stale`).
- `project_steps`: project_id, sort order, title, description, hours low/high.
- `project_tools`: add `step_id`, `role` (`required` | `recommended`), `rental_price_per_day`, `search_links jsonb`, `rationale`.
- `project_estimates`: immutable snapshots (spec, costs, hours, value pct, created_at) so revisions are comparable.
- Storage bucket `project-images` (private, per-user paths) for confirmation images.

**AI calls** — Lovable AI Gateway, all server-side:
- `nextIntakeQuestion` (`createServerFn`, protected): sends project title + answers so far + home/room context, returns strict-schema JSON `{ done, question, suggestions[], inputType }`. Model: `google/gemini-3.7-flash` for latency.
- `estimateProject` (`createServerFn`, protected): sends spec, home data (sq ft, year built, value, ZIP), room dimensions, and the user's owned tools; returns strict-schema JSON with cost breakdown, hours, value pct, steps, and per-step tool recommendations with buy/rent estimates. Model: `google/gemini-3.1-pro-preview` for estimate quality.
- Reference image: server route `src/routes/api/generate-reference-image.ts` streaming `google/gemini-3.1-flash-image` (streaming can't go through `createServerFn`).
- Gateway errors surfaced per status: only 429/5xx retried with backoff; 402/403 shown as-is.

Tool prices and value-added percentages are model estimates, marked in the UI as estimates rather than quotes, with the schema shaped so a real pricing API can replace the AI numbers later without a data migration.

## Out of scope for phase 2

User photo uploads (AI-generated confirmation images cover the "same page" need for now), contractor bids, scheduling/calendar, purchase tracking.
