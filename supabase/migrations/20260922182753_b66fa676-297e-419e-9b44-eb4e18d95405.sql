CREATE TABLE public.reviewvala_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  review_id uuid REFERENCES public.reviewvala_reviews(id) ON DELETE SET NULL,
  source_text text NOT NULL,
  headline text NOT NULL,
  sentiment text NOT NULL DEFAULT 'Mixed',
  severity text NOT NULL DEFAULT 'Medium',
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  root_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_by text NOT NULL DEFAULT 'Riya Sharma',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_insights TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_insights TO authenticated;
GRANT ALL ON public.reviewvala_insights TO service_role;

ALTER TABLE public.reviewvala_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ReviewVala insights are available to the prototype workspace"
  ON public.reviewvala_insights FOR ALL
  TO anon, authenticated
  USING (workspace_slug = 'northstar-group')
  WITH CHECK (workspace_slug = 'northstar-group');

CREATE TRIGGER reviewvala_insights_updated_at
  BEFORE UPDATE ON public.reviewvala_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();