ALTER TABLE public.projects
  ADD COLUMN cheap_cost_low numeric, ADD COLUMN cheap_cost_high numeric,
  ADD COLUMN cheap_hours_low numeric, ADD COLUMN cheap_hours_high numeric,
  ADD COLUMN fast_cost_low numeric, ADD COLUMN fast_cost_high numeric,
  ADD COLUMN fast_hours_low numeric, ADD COLUMN fast_hours_high numeric;
ALTER TABLE public.project_estimates
  ADD COLUMN cheap_cost_low numeric, ADD COLUMN cheap_cost_high numeric,
  ADD COLUMN cheap_hours_low numeric, ADD COLUMN cheap_hours_high numeric,
  ADD COLUMN fast_cost_low numeric, ADD COLUMN fast_cost_high numeric,
  ADD COLUMN fast_hours_low numeric, ADD COLUMN fast_hours_high numeric;