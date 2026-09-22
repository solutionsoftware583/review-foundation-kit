ALTER TABLE public.reviewvala_reviews
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.reviewvala_reviews(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

CREATE INDEX IF NOT EXISTS reviewvala_reviews_workspace_idx ON public.reviewvala_reviews (workspace_slug, created_at DESC);

CREATE TABLE public.reviewvala_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  owner_user_id uuid NOT NULL,
  owner_name text NOT NULL DEFAULT '',
  name text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_saved_views TO authenticated;
GRANT ALL ON public.reviewvala_saved_views TO service_role;
ALTER TABLE public.reviewvala_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read shared and own views" ON public.reviewvala_saved_views
  FOR SELECT TO authenticated
  USING (public.reviewvala_is_member(auth.uid(), workspace_slug) AND (is_shared OR owner_user_id = auth.uid()));
CREATE POLICY "Members create own views" ON public.reviewvala_saved_views
  FOR INSERT TO authenticated
  WITH CHECK (public.reviewvala_is_member(auth.uid(), workspace_slug) AND owner_user_id = auth.uid());
CREATE POLICY "Owners update own views" ON public.reviewvala_saved_views
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners or admins delete views" ON public.reviewvala_saved_views
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR public.reviewvala_is_admin(auth.uid(), workspace_slug));

CREATE TRIGGER reviewvala_saved_views_updated_at BEFORE UPDATE ON public.reviewvala_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

CREATE TABLE public.reviewvala_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  name text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  match_source text NOT NULL DEFAULT 'Any',
  match_location text NOT NULL DEFAULT 'Any',
  min_rating integer NOT NULL DEFAULT 1,
  max_rating integer NOT NULL DEFAULT 5,
  assignee text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_assignment_rules TO authenticated;
GRANT ALL ON public.reviewvala_assignment_rules TO service_role;
ALTER TABLE public.reviewvala_assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read assignment rules" ON public.reviewvala_assignment_rules
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Admins write assignment rules" ON public.reviewvala_assignment_rules
  FOR ALL TO authenticated
  USING (public.reviewvala_is_admin(auth.uid(), workspace_slug))
  WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));

CREATE TRIGGER reviewvala_assignment_rules_updated_at BEFORE UPDATE ON public.reviewvala_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();