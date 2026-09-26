# Project page: two estimate paths + "what if" spec changes

## 1. Two estimates instead of one wide range
Each estimate gets split into two methods:
- **Cheapest method**: required tools only (tools you own count as $0). Lowest dollar cost, usually more hours.
- **Fastest method**: adds the recommended tools that save time (buy or rent, whichever is cheaper for the job). Lowest labor hours, usually more dollars.

Each method shows its own cost, labor hours and a narrow range. Value added stays one number (it's the same finished result).

The top of the project page shows two side-by-side cards, "Cheapest" and "Fastest", each with cost and hours. In the work plan, each step shows hours for both methods, and the recommended tools are tagged "Used in fastest method".

## 2. "What if" editing of gathered details
- The Gathered details list becomes editable: each item is a drop-down (when the AI knows the likely options, e.g. tile: porcelain / ceramic / vinyl / natural stone) or a text/number box. The room stays locked.
- Changing any detail enables a **Preview changes** button. It runs a quick estimate for the new details without saving anything.
- Below the current estimate cards, a comparison appears: "With these changes: Cheapest +$320 / −2 hrs, Fastest +$410 / −1 hr", in green for savings and red for increases, plus the new totals.
- Two buttons: **Finalize changes** (saves the new details, replaces the estimate, work plan and tool list across the page) and **Discard** (goes back to the saved details).
- Preview uses a faster, cheaper AI call; Finalize runs the full estimate so the work plan is regenerated properly.

## Technical details
- Database: add `cheap_cost_low/high`, `cheap_hours_low/high`, `fast_cost_low/high`, `fast_hours_low/high` to `projects` and `project_estimates`; add `fast_hours_low/high` to `project_steps`; add `in_fast_method boolean` to `project_tools`. Existing combined columns kept for older projects (shown as a single estimate until re-estimated).
- Intake: AI also returns `spec_options` (per spec key, list of likely choices), stored in `projects.spec` metadata (`_options`) so the editor can render drop-downs.
- Estimation prompt + Zod schema updated to return both methods; `generateEstimate` persists them.
- New server function `previewEstimate` (flash model, costs/hours only, no writes) for the comparison; Finalize = `updateProject({ spec })` then `generateEstimate`.
- UI: new `SpecEditor` and `EstimateComparison` components on `projects.$projectId.tsx`; draft spec held in local state.
- Verify with the existing browser test using a bathroom retile project (porcelain vs ceramic).
