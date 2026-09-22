CREATE TABLE public.reviewvala_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  website text,
  industry text,
  plan text NOT NULL DEFAULT 'Growth',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_workspaces TO authenticated;
GRANT ALL ON public.reviewvala_workspaces TO service_role;
ALTER TABLE public.reviewvala_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their workspace" ON public.reviewvala_workspaces
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), slug));
CREATE POLICY "Admins update their workspace" ON public.reviewvala_workspaces
  FOR UPDATE TO authenticated USING (public.reviewvala_is_admin(auth.uid(), slug)) WITH CHECK (public.reviewvala_is_admin(auth.uid(), slug));
CREATE POLICY "Admins delete their workspace" ON public.reviewvala_workspaces
  FOR DELETE TO authenticated USING (public.reviewvala_is_admin(auth.uid(), slug));
CREATE POLICY "Authenticated create workspaces" ON public.reviewvala_workspaces
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

CREATE TABLE public.reviewvala_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL REFERENCES public.reviewvala_workspaces(slug) ON DELETE CASCADE,
  name text NOT NULL,
  location_label text NOT NULL,
  city text,
  country text,
  category text,
  website text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_slug, location_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_businesses TO authenticated;
GRANT ALL ON public.reviewvala_businesses TO service_role;
ALTER TABLE public.reviewvala_businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read businesses" ON public.reviewvala_businesses
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Admins write businesses" ON public.reviewvala_businesses
  FOR ALL TO authenticated USING (public.reviewvala_is_admin(auth.uid(), workspace_slug)) WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));

CREATE TRIGGER reviewvala_workspaces_updated_at BEFORE UPDATE ON public.reviewvala_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();
CREATE TRIGGER reviewvala_businesses_updated_at BEFORE UPDATE ON public.reviewvala_businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

INSERT INTO public.reviewvala_workspaces (slug, name, website, industry, plan)
VALUES ('northstar-group', 'Northstar Group', 'https://northstargroup.co', 'Hospitality & Retail', 'Growth');

INSERT INTO public.reviewvala_businesses (workspace_slug, name, location_label, city, country, category)
SELECT DISTINCT 'northstar-group', 'Northstar Group', r.location,
  split_part(r.location, ',', 1),
  NULLIF(trim(split_part(r.location, ',', 2)), ''),
  'Hospitality & Retail'
FROM public.reviewvala_reviews r
WHERE r.workspace_slug = 'northstar-group';