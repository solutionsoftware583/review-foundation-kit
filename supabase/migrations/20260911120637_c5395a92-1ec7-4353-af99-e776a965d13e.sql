CREATE OR REPLACE FUNCTION public.update_reviewvala_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.reviewvala_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  reviewer_initials text NOT NULL,
  reviewer_name text NOT NULL,
  source text NOT NULL,
  location text NOT NULL,
  rating integer NOT NULL,
  time_label text NOT NULL,
  status text NOT NULL DEFAULT 'Needs reply',
  sentiment text NOT NULL DEFAULT 'Positive',
  review_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviewvala_reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_reviews TO anon, authenticated;
GRANT ALL ON public.reviewvala_reviews TO service_role;
ALTER TABLE public.reviewvala_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReviewVala reviews are available to the prototype workspace" ON public.reviewvala_reviews FOR ALL TO anon, authenticated USING (workspace_slug = 'northstar-group') WITH CHECK (workspace_slug = 'northstar-group');
CREATE TRIGGER reviewvala_reviews_updated_at BEFORE UPDATE ON public.reviewvala_reviews FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

CREATE TABLE public.reviewvala_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviewvala_reviews(id) ON DELETE CASCADE,
  response_text text NOT NULL,
  response_status text NOT NULL DEFAULT 'Draft',
  author_name text NOT NULL DEFAULT 'Riya Sharma',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_responses TO anon, authenticated;
GRANT ALL ON public.reviewvala_responses TO service_role;
ALTER TABLE public.reviewvala_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReviewVala responses follow prototype reviews" ON public.reviewvala_responses FOR ALL TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.reviewvala_reviews r WHERE r.id = review_id AND r.workspace_slug = 'northstar-group')) WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_reviews r WHERE r.id = review_id AND r.workspace_slug = 'northstar-group'));
CREATE TRIGGER reviewvala_responses_updated_at BEFORE UPDATE ON public.reviewvala_responses FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

CREATE TABLE public.reviewvala_rating_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  channel text NOT NULL,
  rating numeric(3,2) NOT NULL,
  period_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviewvala_rating_snapshots_rating_range CHECK (rating BETWEEN 0 AND 5)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_rating_snapshots TO anon, authenticated;
GRANT ALL ON public.reviewvala_rating_snapshots TO service_role;
ALTER TABLE public.reviewvala_rating_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReviewVala ratings are available to the prototype workspace" ON public.reviewvala_rating_snapshots FOR ALL TO anon, authenticated USING (workspace_slug = 'northstar-group') WITH CHECK (workspace_slug = 'northstar-group');

INSERT INTO public.reviewvala_reviews (id, workspace_slug, reviewer_initials, reviewer_name, source, location, rating, time_label, status, sentiment, review_text) VALUES
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d101', 'northstar-group', 'AK', 'Aarav Kapoor', 'Google', 'Indiranagar, Bengaluru', 5, '18 min ago', 'Needs reply', 'Positive', 'The onboarding was effortless and the support team explained everything clearly. Priya was especially patient and helpful.'),
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d102', 'northstar-group', 'SM', 'Sofia Martinez', 'Trustpilot', 'SoHo, New York', 3, '1 hr ago', 'Assigned', 'Mixed', 'Good product overall, but I waited longer than expected for an update on my request.'),
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d103', 'northstar-group', 'JL', 'James Liu', 'Facebook', 'Shoreditch, London', 1, '3 hrs ago', 'Escalated', 'Negative', 'My issue is still unresolved after two conversations. I need someone to take ownership.'),
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d104', 'northstar-group', 'NP', 'Nina Patel', 'Google', 'Indiranagar, Bengaluru', 5, 'Yesterday', 'Replied', 'Positive', 'Fast, thoughtful and genuinely friendly service. Would recommend to any growing business.');

INSERT INTO public.reviewvala_responses (review_id, response_text, response_status, author_name) VALUES
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d101', 'Thank you for your kind words, Aarav. We’re delighted Priya made your onboarding feel effortless.', 'Approved', 'Riya Sharma'),
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d102', 'Thank you for sharing this. We understand how important timely updates are, and we’re reviewing your experience.', 'Pending approval', 'Riya Sharma'),
  ('7e59b8e0-22d9-4b8b-ae5b-01a9d4d7d103', 'James, we’re sorry this remained unresolved. We’re escalating this to a senior owner today.', 'Draft', 'Riya Sharma');

INSERT INTO public.reviewvala_rating_snapshots (workspace_slug, channel, rating, period_label) VALUES
  ('northstar-group', 'Google', 4.70, 'Apr'),
  ('northstar-group', 'Trustpilot', 4.40, 'Apr'),
  ('northstar-group', 'Facebook', 4.50, 'Apr'),
  ('northstar-group', 'Google', 4.80, 'Sep'),
  ('northstar-group', 'Trustpilot', 4.60, 'Sep'),
  ('northstar-group', 'Facebook', 4.50, 'Sep');