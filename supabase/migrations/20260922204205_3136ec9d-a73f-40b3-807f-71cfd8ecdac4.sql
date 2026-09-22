-- ---------------------------------------------------------------- responses --
ALTER TABLE public.reviewvala_responses
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS publish_state text NOT NULL DEFAULT 'Not published',
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_publish_error text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS publish_target text;

CREATE UNIQUE INDEX IF NOT EXISTS reviewvala_responses_idempotency_key_idx
  ON public.reviewvala_responses (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------- templates --
CREATE TABLE IF NOT EXISTS public.reviewvala_response_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  tone text NOT NULL DEFAULT 'Warm',
  body text NOT NULL,
  min_rating integer NOT NULL DEFAULT 1,
  max_rating integer NOT NULL DEFAULT 5,
  platform text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_response_templates TO authenticated;
GRANT ALL ON public.reviewvala_response_templates TO service_role;
ALTER TABLE public.reviewvala_response_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read templates" ON public.reviewvala_response_templates
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Managers write templates" ON public.reviewvala_response_templates
  FOR ALL TO authenticated
  USING (public.reviewvala_member_role(auth.uid(), workspace_slug) IN ('Admin','Manager'))
  WITH CHECK (public.reviewvala_member_role(auth.uid(), workspace_slug) IN ('Admin','Manager'));
CREATE TRIGGER reviewvala_response_templates_updated_at BEFORE UPDATE ON public.reviewvala_response_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

-- -------------------------------------------------------------- compliance --
CREATE TABLE IF NOT EXISTS public.reviewvala_compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'Banned wording',
  value text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'Blocker',
  guidance text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_compliance_rules TO authenticated;
GRANT ALL ON public.reviewvala_compliance_rules TO service_role;
ALTER TABLE public.reviewvala_compliance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read compliance rules" ON public.reviewvala_compliance_rules
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Managers write compliance rules" ON public.reviewvala_compliance_rules
  FOR ALL TO authenticated
  USING (public.reviewvala_member_role(auth.uid(), workspace_slug) IN ('Admin','Manager'))
  WITH CHECK (public.reviewvala_member_role(auth.uid(), workspace_slug) IN ('Admin','Manager'));
CREATE TRIGGER reviewvala_compliance_rules_updated_at BEFORE UPDATE ON public.reviewvala_compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

-- ---------------------------------------------------------------- versions --
CREATE TABLE IF NOT EXISTS public.reviewvala_response_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.reviewvala_responses(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  status_at_save text NOT NULL DEFAULT 'Draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, version)
);
GRANT SELECT, INSERT ON public.reviewvala_response_versions TO authenticated;
GRANT ALL ON public.reviewvala_response_versions TO service_role;
ALTER TABLE public.reviewvala_response_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read response versions" ON public.reviewvala_response_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.reviewvala_responses rr
    JOIN public.reviewvala_reviews r ON r.id = rr.review_id
    WHERE rr.id = response_id AND public.reviewvala_is_member(auth.uid(), r.workspace_slug)));
CREATE POLICY "Contributors insert response versions" ON public.reviewvala_response_versions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.reviewvala_responses rr
    JOIN public.reviewvala_reviews r ON r.id = rr.review_id
    WHERE rr.id = response_id AND public.reviewvala_can_write(auth.uid(), r.workspace_slug)));
CREATE INDEX IF NOT EXISTS reviewvala_response_versions_idx
  ON public.reviewvala_response_versions (response_id, version DESC);

-- ------------------------------------------------------- approval policies --
CREATE TABLE IF NOT EXISTS public.reviewvala_approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  min_rating integer NOT NULL DEFAULT 1,
  max_rating integer NOT NULL DEFAULT 5,
  match_priority text,
  required_role public.reviewvala_role NOT NULL DEFAULT 'Manager',
  require_second_approval boolean NOT NULL DEFAULT false,
  auto_publish boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_approval_policies TO authenticated;
GRANT ALL ON public.reviewvala_approval_policies TO service_role;
ALTER TABLE public.reviewvala_approval_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read approval policies" ON public.reviewvala_approval_policies
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Admins write approval policies" ON public.reviewvala_approval_policies
  FOR ALL TO authenticated
  USING (public.reviewvala_is_admin(auth.uid(), workspace_slug))
  WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));
CREATE TRIGGER reviewvala_approval_policies_updated_at BEFORE UPDATE ON public.reviewvala_approval_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

-- -------------------------------------------------------- publish targets --
CREATE TABLE IF NOT EXISTS public.reviewvala_publish_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL DEFAULT 'northstar-group',
  platform text NOT NULL,
  mode text NOT NULL DEFAULT 'Internal only',
  character_limit integer NOT NULL DEFAULT 4000,
  max_attempts integer NOT NULL DEFAULT 3,
  is_enabled boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_slug, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_publish_targets TO authenticated;
GRANT ALL ON public.reviewvala_publish_targets TO service_role;
ALTER TABLE public.reviewvala_publish_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read publish targets" ON public.reviewvala_publish_targets
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Admins write publish targets" ON public.reviewvala_publish_targets
  FOR ALL TO authenticated
  USING (public.reviewvala_is_admin(auth.uid(), workspace_slug))
  WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));
CREATE TRIGGER reviewvala_publish_targets_updated_at BEFORE UPDATE ON public.reviewvala_publish_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

-- --------------------------------------------------- transactional moves --
CREATE OR REPLACE FUNCTION public.reviewvala_transition_response(
  _response_id uuid,
  _to_status text,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS public.reviewvala_responses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _response public.reviewvala_responses;
  _review public.reviewvala_reviews;
  _role public.reviewvala_role;
  _member public.reviewvala_members;
  _actor text;
  _from text;
  _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _response FROM public.reviewvala_responses WHERE id = _response_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That response no longer exists'; END IF;

  -- idempotent replay: same key, already applied
  IF _idempotency_key IS NOT NULL AND _response.idempotency_key = _idempotency_key
     AND _response.response_status = _to_status THEN
    RETURN _response;
  END IF;

  SELECT * INTO _review FROM public.reviewvala_reviews WHERE id = _response.review_id;
  _role := public.reviewvala_member_role(_uid, _review.workspace_slug);
  IF _role IS NULL THEN RAISE EXCEPTION 'You are not an active member of this workspace'; END IF;

  SELECT * INTO _member FROM public.reviewvala_members
  WHERE user_id = _uid AND workspace_slug = _review.workspace_slug;
  _actor := COALESCE(NULLIF(_member.full_name, ''), _member.email, 'Member');
  _from := _response.response_status;

  _allowed := CASE
    WHEN _to_status = 'Pending approval' THEN _from IN ('Draft','Changes requested','Rejected')
    WHEN _to_status = 'Approved' THEN _from = 'Pending approval'
    WHEN _to_status = 'Rejected' THEN _from = 'Pending approval'
    WHEN _to_status = 'Changes requested' THEN _from IN ('Pending approval','Approved')
    WHEN _to_status = 'Published' THEN _from = 'Approved'
    WHEN _to_status = 'Draft' THEN _from IN ('Draft','Changes requested','Rejected')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'A response cannot move from % to %', _from, _to_status;
  END IF;

  IF _to_status IN ('Approved','Rejected','Changes requested') AND _role NOT IN ('Admin','Manager') THEN
    RAISE EXCEPTION 'Only an Admin or Manager can approve, reject or request changes';
  END IF;
  IF _to_status = 'Published' AND _role NOT IN ('Admin','Manager') THEN
    RAISE EXCEPTION 'Only an Admin or Manager can publish a response';
  END IF;
  IF _to_status IN ('Pending approval','Draft') AND _role NOT IN ('Admin','Manager','Responder') THEN
    RAISE EXCEPTION 'Your role cannot change response drafts';
  END IF;

  UPDATE public.reviewvala_responses SET
    response_status = _to_status,
    idempotency_key = COALESCE(_idempotency_key, idempotency_key),
    submitted_at = CASE WHEN _to_status = 'Pending approval' THEN now() ELSE submitted_at END,
    approved_at = CASE WHEN _to_status = 'Approved' THEN now() ELSE approved_at END,
    published_at = CASE WHEN _to_status = 'Published' THEN now() ELSE published_at END,
    publish_state = CASE WHEN _to_status = 'Published' THEN 'Published' ELSE publish_state END,
    publish_attempts = CASE WHEN _to_status = 'Published' THEN publish_attempts + 1 ELSE publish_attempts END,
    last_publish_error = CASE WHEN _to_status = 'Published' THEN NULL ELSE last_publish_error END,
    updated_at = now()
  WHERE id = _response_id
  RETURNING * INTO _response;

  INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, note)
  VALUES (_response_id,
    CASE _to_status
      WHEN 'Pending approval' THEN 'Submitted for approval'
      WHEN 'Approved' THEN 'Approved'
      WHEN 'Rejected' THEN 'Rejected'
      WHEN 'Changes requested' THEN 'Changes requested'
      WHEN 'Published' THEN 'Published internally'
      ELSE 'Draft saved' END,
    _actor, _role::text, _from, _to_status, _note);

  IF _to_status = 'Published' THEN
    UPDATE public.reviewvala_reviews SET status = 'Replied', updated_at = now() WHERE id = _response.review_id;
  END IF;

  RETURN _response;
END;
$function$;

REVOKE ALL ON FUNCTION public.reviewvala_transition_response(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reviewvala_transition_response(uuid, text, text, text) TO authenticated, service_role;

-- -------------------------------------------------------------- seed rows --
INSERT INTO public.reviewvala_publish_targets (workspace_slug, platform, mode, character_limit, max_attempts, notes) VALUES
  ('northstar-group','Google','Manual copy',4096,3,'Paste the approved reply into the Google Business Profile owner reply box.'),
  ('northstar-group','Trustpilot','Manual copy',5000,3,'Trustpilot business account replies are posted by the location manager.'),
  ('northstar-group','Facebook','Manual copy',8000,3,'Page admins post the reply from Meta Business Suite.'),
  ('northstar-group','Tripadvisor','Manual copy',3500,3,'Management responses go through the Tripadvisor owner dashboard.'),
  ('northstar-group','Internal','Internal only',5000,1,'Internal records stay inside ReviewVala.')
ON CONFLICT (workspace_slug, platform) DO NOTHING;

INSERT INTO public.reviewvala_response_templates (workspace_slug, name, category, tone, body, min_rating, max_rating, created_by_name) VALUES
  ('northstar-group','Delighted guest thank you','Praise','Warm','Hi {{first_name}}, thank you so much for the kind words about {{location}}. The team will be thrilled to hear it — we look forward to welcoming you back soon.',4,5,'Riya Sharma'),
  ('northstar-group','Service recovery — slow service','Service recovery','Apologetic','Hi {{first_name}}, I am sorry your visit to {{location}} was slower than it should have been. That is not the standard we hold ourselves to. I have shared your feedback with the floor team and would like to make it right — please reply here so we can follow up directly.',1,3,'Riya Sharma'),
  ('northstar-group','Billing concern','Billing','Professional','Hi {{first_name}}, thank you for flagging this. I want to review the charge on your visit to {{location}} personally. Please share your booking reference and I will come back to you with a resolution.',1,3,'Riya Sharma'),
  ('northstar-group','Mixed feedback follow up','Mixed','Balanced','Hi {{first_name}}, thank you for the balanced feedback on {{location}} — it is genuinely useful. I am glad {{highlight}} worked well, and we are already looking at the part that fell short.',3,4,'Riya Sharma')
ON CONFLICT DO NOTHING;

INSERT INTO public.reviewvala_compliance_rules (workspace_slug, name, kind, value, severity, guidance) VALUES
  ('northstar-group','No guarantees','Banned wording','guarantee','Blocker','Avoid promising outcomes we cannot control.'),
  ('northstar-group','No legal admissions','Banned wording','our fault','Blocker','Express regret without admitting legal liability.'),
  ('northstar-group','No refunds in public','Banned wording','refund','Warning','Move refund conversations to a private channel.'),
  ('northstar-group','No customer personal data','Banned wording','phone number','Blocker','Never repeat personal details in a public reply.'),
  ('northstar-group','Thank the reviewer','Required wording','thank','Warning','Open every reply by thanking the customer.'),
  ('northstar-group','Keep replies concise','Maximum length','900','Warning','Replies over 900 characters lose the reader.')
ON CONFLICT DO NOTHING;

INSERT INTO public.reviewvala_approval_policies (workspace_slug, name, position, min_rating, max_rating, match_priority, required_role, require_second_approval, auto_publish) VALUES
  ('northstar-group','Low ratings need a Manager',0,1,2,NULL,'Manager',false,false),
  ('northstar-group','Urgent reviews need an Admin',1,1,5,'Urgent','Admin',true,false),
  ('northstar-group','Positive replies auto publish',2,4,5,NULL,'Manager',false,true)
ON CONFLICT DO NOTHING;