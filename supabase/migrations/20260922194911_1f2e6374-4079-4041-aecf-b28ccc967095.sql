
CREATE TYPE public.reviewvala_role AS ENUM ('Admin','Manager','Responder','Viewer');

CREATE TABLE public.reviewvala_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role public.reviewvala_role NOT NULL DEFAULT 'Viewer',
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Active','Suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_slug)
);

GRANT SELECT, UPDATE ON public.reviewvala_members TO authenticated;
GRANT ALL ON public.reviewvala_members TO service_role;
ALTER TABLE public.reviewvala_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER reviewvala_members_updated_at
BEFORE UPDATE ON public.reviewvala_members
FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

-- security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.reviewvala_member_role(_user_id uuid, _workspace text)
RETURNS public.reviewvala_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.reviewvala_members
  WHERE user_id = _user_id AND workspace_slug = _workspace AND status = 'Active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.reviewvala_is_member(_user_id uuid, _workspace text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.reviewvala_member_role(_user_id, _workspace) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.reviewvala_can_write(_user_id uuid, _workspace text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.reviewvala_member_role(_user_id, _workspace)
         IN ('Admin','Manager','Responder')
$$;

CREATE OR REPLACE FUNCTION public.reviewvala_is_admin(_user_id uuid, _workspace text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.reviewvala_member_role(_user_id, _workspace) = 'Admin'
$$;

-- membership claim: first user of a workspace becomes active Admin, everyone else Pending
CREATE OR REPLACE FUNCTION public.reviewvala_claim_membership(_workspace text DEFAULT 'northstar-group')
RETURNS public.reviewvala_members
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
  _row public.reviewvala_members;
  _first boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _row FROM public.reviewvala_members
  WHERE user_id = _uid AND workspace_slug = _workspace;
  IF FOUND THEN
    RETURN _row;
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    INTO _email, _name
  FROM auth.users u WHERE u.id = _uid;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.reviewvala_members WHERE workspace_slug = _workspace
  ) INTO _first;

  INSERT INTO public.reviewvala_members (user_id, workspace_slug, email, full_name, role, status)
  VALUES (
    _uid, _workspace, COALESCE(_email,''), COALESCE(_name,''),
    CASE WHEN _first THEN 'Admin'::public.reviewvala_role ELSE 'Viewer'::public.reviewvala_role END,
    CASE WHEN _first THEN 'Active' ELSE 'Pending' END
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.reviewvala_claim_membership(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reviewvala_claim_membership(text) TO authenticated;

CREATE POLICY "Members can read their own row"
ON public.reviewvala_members FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can read workspace members"
ON public.reviewvala_members FOR SELECT TO authenticated
USING (public.reviewvala_is_admin(auth.uid(), workspace_slug));

CREATE POLICY "Admins can update workspace members"
ON public.reviewvala_members FOR UPDATE TO authenticated
USING (public.reviewvala_is_admin(auth.uid(), workspace_slug))
WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));

-- ============ lock down the data tables ============
REVOKE ALL ON public.reviewvala_reviews FROM anon;
REVOKE ALL ON public.reviewvala_responses FROM anon;
REVOKE ALL ON public.reviewvala_response_events FROM anon;
REVOKE ALL ON public.reviewvala_review_notes FROM anon;
REVOKE ALL ON public.reviewvala_rating_snapshots FROM anon;
REVOKE ALL ON public.reviewvala_insights FROM anon;

DROP POLICY IF EXISTS "ReviewVala reviews are available to the prototype workspace" ON public.reviewvala_reviews;
DROP POLICY IF EXISTS "ReviewVala responses follow prototype reviews" ON public.reviewvala_responses;
DROP POLICY IF EXISTS "ReviewVala response events follow prototype responses" ON public.reviewvala_response_events;
DROP POLICY IF EXISTS "ReviewVala notes follow prototype reviews" ON public.reviewvala_review_notes;
DROP POLICY IF EXISTS "ReviewVala ratings are available to the prototype workspace" ON public.reviewvala_rating_snapshots;
DROP POLICY IF EXISTS "ReviewVala insights are available to the prototype workspace" ON public.reviewvala_insights;

-- reviews
CREATE POLICY "Members read reviews" ON public.reviewvala_reviews FOR SELECT TO authenticated
USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Contributors insert reviews" ON public.reviewvala_reviews FOR INSERT TO authenticated
WITH CHECK (public.reviewvala_can_write(auth.uid(), workspace_slug));
CREATE POLICY "Contributors update reviews" ON public.reviewvala_reviews FOR UPDATE TO authenticated
USING (public.reviewvala_can_write(auth.uid(), workspace_slug))
WITH CHECK (public.reviewvala_can_write(auth.uid(), workspace_slug));
CREATE POLICY "Admins delete reviews" ON public.reviewvala_reviews FOR DELETE TO authenticated
USING (public.reviewvala_is_admin(auth.uid(), workspace_slug));

-- rating snapshots
CREATE POLICY "Members read ratings" ON public.reviewvala_rating_snapshots FOR SELECT TO authenticated
USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Contributors insert ratings" ON public.reviewvala_rating_snapshots FOR INSERT TO authenticated
WITH CHECK (public.reviewvala_can_write(auth.uid(), workspace_slug));

-- insights
CREATE POLICY "Members read insights" ON public.reviewvala_insights FOR SELECT TO authenticated
USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Contributors insert insights" ON public.reviewvala_insights FOR INSERT TO authenticated
WITH CHECK (public.reviewvala_can_write(auth.uid(), workspace_slug));

-- responses (scoped through the parent review)
CREATE POLICY "Members read responses" ON public.reviewvala_responses FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_responses.review_id
    AND public.reviewvala_is_member(auth.uid(), r.workspace_slug)));
CREATE POLICY "Contributors insert responses" ON public.reviewvala_responses FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_responses.review_id
    AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)));
CREATE POLICY "Contributors update responses" ON public.reviewvala_responses FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_responses.review_id
    AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)))
WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_responses.review_id
    AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)));

-- response events
CREATE POLICY "Members read response events" ON public.reviewvala_response_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.reviewvala_responses rr
  JOIN public.reviewvala_reviews r ON r.id = rr.review_id
  WHERE rr.id = reviewvala_response_events.response_id
    AND public.reviewvala_is_member(auth.uid(), r.workspace_slug)));
CREATE POLICY "Contributors insert response events" ON public.reviewvala_response_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_responses rr
  JOIN public.reviewvala_reviews r ON r.id = rr.review_id
  WHERE rr.id = reviewvala_response_events.response_id
    AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)));

-- notes
CREATE POLICY "Members read notes" ON public.reviewvala_review_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_review_notes.review_id
    AND public.reviewvala_is_member(auth.uid(), r.workspace_slug)));
CREATE POLICY "Contributors insert notes" ON public.reviewvala_review_notes FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.reviewvala_reviews r
  WHERE r.id = reviewvala_review_notes.review_id
    AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)));
