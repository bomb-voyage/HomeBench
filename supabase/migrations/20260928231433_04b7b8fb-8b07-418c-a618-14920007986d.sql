ALTER TABLE public.projects ADD COLUMN actual_cost numeric, ADD COLUMN actual_hours numeric, ADD COLUMN completed_at timestamptz;

CREATE TABLE public.project_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_title text NOT NULL,
  scope_type text,
  room_type text,
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_cost numeric,
  actual_hours numeric,
  estimated_cost_low numeric,
  estimated_cost_high numeric,
  estimated_hours_low numeric,
  estimated_hours_high numeric,
  estimated_value_added numeric,
  tools_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_owned jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_completions TO authenticated;
GRANT ALL ON public.project_completions TO service_role;
ALTER TABLE public.project_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_completions_own ON public.project_completions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);