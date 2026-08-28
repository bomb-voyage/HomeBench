-- Phase 2: AI project planner schema additions

ALTER TABLE public.projects
  ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'room',
  ADD COLUMN spec JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN intake_state JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN reference_image_path TEXT,
  ADD COLUMN estimated_value_added_pct NUMERIC,
  ADD COLUMN estimate_status TEXT NOT NULL DEFAULT 'draft';

CREATE INDEX projects_estimate_status_idx ON public.projects(estimate_status);

CREATE TABLE public.project_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  estimated_hours_low NUMERIC,
  estimated_hours_high NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_steps_project_id_idx ON public.project_steps(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_steps TO authenticated;
GRANT ALL ON public.project_steps TO service_role;
ALTER TABLE public.project_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_steps_own" ON public.project_steps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.project_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_low NUMERIC,
  estimated_cost_high NUMERIC,
  estimated_hours_low NUMERIC,
  estimated_hours_high NUMERIC,
  estimated_value_added NUMERIC,
  estimated_value_added_pct NUMERIC,
  estimate_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_estimates_project_id_idx ON public.project_estimates(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_estimates TO authenticated;
GRANT ALL ON public.project_estimates TO service_role;
ALTER TABLE public.project_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_estimates_own" ON public.project_estimates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.project_tools
  ADD COLUMN step_id UUID REFERENCES public.project_steps(id) ON DELETE SET NULL,
  ADD COLUMN role TEXT NOT NULL DEFAULT 'required',
  ADD COLUMN rental_price_per_day NUMERIC,
  ADD COLUMN search_links JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN rationale TEXT;

CREATE INDEX project_tools_step_id_idx ON public.project_tools(step_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tools TO authenticated;
GRANT ALL ON public.project_tools TO service_role;

CREATE TRIGGER project_steps_updated_at BEFORE UPDATE ON public.project_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
