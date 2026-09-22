ALTER TABLE public.reviewvala_reviews
  ADD COLUMN IF NOT EXISTS review_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS assignee text;

ALTER TABLE public.reviewvala_reviews
  ADD CONSTRAINT reviewvala_reviews_priority_check CHECK (priority IN ('Low','Normal','High','Urgent'));

UPDATE public.reviewvala_reviews SET priority = 'Urgent' WHERE rating <= 2;
UPDATE public.reviewvala_reviews SET priority = 'High' WHERE rating = 3;
UPDATE public.reviewvala_reviews SET assignee = 'Riya Sharma' WHERE status <> 'Needs reply';
UPDATE public.reviewvala_reviews SET review_date = (now() - interval '9 days')::date WHERE review_date = CURRENT_DATE;

CREATE TABLE IF NOT EXISTS public.reviewvala_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviewvala_reviews(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  author_name text NOT NULL DEFAULT 'Riya Sharma',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_review_notes TO anon, authenticated;
GRANT ALL ON public.reviewvala_review_notes TO service_role;
ALTER TABLE public.reviewvala_review_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReviewVala notes follow prototype reviews" ON public.reviewvala_review_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.reviewvala_reviews r WHERE r.id = review_id AND r.workspace_slug = 'northstar-group'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_reviews r WHERE r.id = review_id AND r.workspace_slug = 'northstar-group'));

CREATE TABLE IF NOT EXISTS public.reviewvala_response_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.reviewvala_responses(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_name text NOT NULL DEFAULT 'Riya Sharma',
  actor_role text NOT NULL DEFAULT 'Admin',
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_response_events TO anon, authenticated;
GRANT ALL ON public.reviewvala_response_events TO service_role;
ALTER TABLE public.reviewvala_response_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReviewVala response events follow prototype responses" ON public.reviewvala_response_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.reviewvala_responses rr JOIN public.reviewvala_reviews r ON r.id = rr.review_id WHERE rr.id = response_id AND r.workspace_slug = 'northstar-group'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_responses rr JOIN public.reviewvala_reviews r ON r.id = rr.review_id WHERE rr.id = response_id AND r.workspace_slug = 'northstar-group'));

INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, created_at)
SELECT id, 'Response created', author_name, 'Responder', NULL, 'Draft', created_at FROM public.reviewvala_responses;

INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, created_at)
SELECT id, 'Submitted for approval', author_name, 'Responder', 'Draft', 'Pending approval', created_at + interval '5 minutes'
FROM public.reviewvala_responses WHERE response_status IN ('Pending approval','Approved','Published');

INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, created_at)
SELECT id, 'Approved', 'Riya Sharma', 'Manager', 'Pending approval', 'Approved', created_at + interval '20 minutes'
FROM public.reviewvala_responses WHERE response_status IN ('Approved','Published');

INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, created_at)
SELECT id, 'Published internally', 'Riya Sharma', 'Manager', 'Approved', 'Published', created_at + interval '35 minutes'
FROM public.reviewvala_responses WHERE response_status = 'Published';

INSERT INTO public.reviewvala_review_notes (review_id, note_text, author_name, created_at)
SELECT id, 'Escalated to the location manager for a same-day call back.', 'Riya Sharma', now() - interval '2 days'
FROM public.reviewvala_reviews WHERE status = 'Escalated';