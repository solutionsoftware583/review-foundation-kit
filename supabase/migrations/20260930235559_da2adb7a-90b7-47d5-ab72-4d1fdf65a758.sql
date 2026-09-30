CREATE OR REPLACE FUNCTION public.reviewvala_auto_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rule public.reviewvala_assignment_rules;
BEGIN
  IF NEW.assignee IS NOT NULL AND NEW.assignee <> '' THEN RETURN NEW; END IF;
  SELECT * INTO _rule FROM public.reviewvala_assignment_rules r
  WHERE r.workspace_slug = NEW.workspace_slug AND r.is_active
    AND (r.match_source = 'Any' OR r.match_source = NEW.source)
    AND (r.match_location = 'Any' OR r.match_location = NEW.location)
    AND NEW.rating BETWEEN r.min_rating AND r.max_rating
  ORDER BY r.position LIMIT 1;
  IF FOUND THEN
    NEW.assignee := _rule.assignee;
    IF NEW.status = 'Needs reply' THEN NEW.status := 'Assigned'; END IF;
    INSERT INTO public.reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
    VALUES (NEW.workspace_slug, auth.uid(), 'Assignment rules', 'Review auto-assigned', NEW.reviewer_name,
            'Rule "' || _rule.name || '" → ' || _rule.assignee);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reviewvala_auto_assign() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reviewvala_reviews_auto_assign ON public.reviewvala_reviews;
CREATE TRIGGER reviewvala_reviews_auto_assign BEFORE INSERT ON public.reviewvala_reviews
FOR EACH ROW EXECUTE FUNCTION public.reviewvala_auto_assign();