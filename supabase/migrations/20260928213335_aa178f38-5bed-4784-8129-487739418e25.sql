CREATE OR REPLACE FUNCTION public.reviewvala_transition_response(_response_id uuid, _to_status text, _note text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS reviewvala_responses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  _need_second boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _response FROM public.reviewvala_responses WHERE id = _response_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That response no longer exists'; END IF;

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

  -- Second-approval rule: when the matching approval policy requires it, one
  -- approval is recorded and the response stays pending; a different Admin or
  -- Manager must give the final approval. The same person cannot approve twice.
  -- Priority-specific policies outrank generic rating-range policies.
  IF _to_status = 'Approved' THEN
    SELECT p.require_second_approval INTO _need_second
    FROM public.reviewvala_approval_policies p
    WHERE p.workspace_slug = _review.workspace_slug
      AND p.is_active
      AND _review.rating BETWEEN p.min_rating AND p.max_rating
      AND (p.match_priority IS NULL OR p.match_priority = _review.priority)
    ORDER BY (p.match_priority IS NULL), p.position
    LIMIT 1;

    IF COALESCE(_need_second, false) THEN
      IF _response.first_approver_user_id IS NULL THEN
        UPDATE public.reviewvala_responses
          SET first_approver_user_id = _uid, first_approver_name = _actor, updated_at = now()
        WHERE id = _response_id
        RETURNING * INTO _response;
        INSERT INTO public.reviewvala_response_events (response_id, action, actor_name, actor_role, from_status, to_status, note)
        VALUES (_response_id, 'First approval recorded', _actor, _role::text, 'Pending approval', 'Pending approval',
                'A second approval from a different approver is required before publishing.');
        RETURN _response;
      ELSIF _response.first_approver_user_id = _uid THEN
        RAISE EXCEPTION 'Second approval must come from a different approver — % already approved this response.', _response.first_approver_name;
      END IF;
    END IF;
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