CREATE OR REPLACE FUNCTION public.reviewvala_actor_name(_ws text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(full_name,''), email) FROM public.reviewvala_members WHERE user_id = auth.uid() AND workspace_slug = _ws LIMIT 1),
    CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Member' END)
$$;
REVOKE EXECUTE ON FUNCTION public.reviewvala_actor_name(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reviewvala_audit_reviews()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _changes text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
    VALUES (NEW.workspace_slug, auth.uid(), reviewvala_actor_name(NEW.workspace_slug), 'Review created', NEW.reviewer_name,
      NEW.source || ' · ' || NEW.location || ' · ' || NEW.rating || '★');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
    VALUES (OLD.workspace_slug, auth.uid(), reviewvala_actor_name(OLD.workspace_slug), 'Review deleted', OLD.reviewer_name,
      OLD.source || ' · ' || OLD.location || ' · ' || OLD.rating || '★');
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN _changes := _changes || ('status ' || OLD.status || ' → ' || NEW.status); END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN _changes := _changes || ('priority ' || OLD.priority || ' → ' || NEW.priority); END IF;
  IF NEW.assignee IS DISTINCT FROM OLD.assignee THEN _changes := _changes || ('assignee ' || COALESCE(OLD.assignee,'none') || ' → ' || COALESCE(NEW.assignee,'none')); END IF;
  IF NEW.rating IS DISTINCT FROM OLD.rating THEN _changes := _changes || ('rating ' || OLD.rating || ' → ' || NEW.rating); END IF;
  IF NEW.sentiment IS DISTINCT FROM OLD.sentiment THEN _changes := _changes || ('sentiment ' || OLD.sentiment || ' → ' || NEW.sentiment); END IF;
  IF NEW.review_text IS DISTINCT FROM OLD.review_text THEN _changes := _changes || 'text edited'; END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN _changes := _changes || CASE WHEN NEW.archived_at IS NULL THEN 'restored' ELSE 'archived' END; END IF;
  IF NEW.merged_into IS DISTINCT FROM OLD.merged_into THEN _changes := _changes || 'merged as duplicate'; END IF;
  IF array_length(_changes,1) IS NULL THEN RETURN NEW; END IF;
  INSERT INTO reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
  VALUES (NEW.workspace_slug, auth.uid(), reviewvala_actor_name(NEW.workspace_slug), 'Review updated', NEW.reviewer_name, array_to_string(_changes, ', '));
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reviewvala_audit_reviews() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reviewvala_reviews_audit ON public.reviewvala_reviews;
CREATE TRIGGER reviewvala_reviews_audit AFTER INSERT OR UPDATE OR DELETE ON public.reviewvala_reviews
FOR EACH ROW EXECUTE FUNCTION public.reviewvala_audit_reviews();

CREATE OR REPLACE FUNCTION public.reviewvala_audit_response_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws text; _name text;
BEGIN
  SELECT r.workspace_slug, r.reviewer_name INTO _ws, _name
  FROM reviewvala_responses p JOIN reviewvala_reviews r ON r.id = p.review_id WHERE p.id = NEW.response_id;
  IF _ws IS NULL THEN RETURN NEW; END IF;
  INSERT INTO reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
  VALUES (_ws, auth.uid(), COALESCE(NULLIF(NEW.actor_name,''), reviewvala_actor_name(_ws)), 'Response: ' || NEW.action, 'Reply to ' || _name,
    COALESCE(NEW.from_status || ' → ', '') || NEW.to_status || COALESCE(' · ' || NULLIF(NEW.note,''), ''));
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reviewvala_audit_response_events() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reviewvala_response_events_audit ON public.reviewvala_response_events;
CREATE TRIGGER reviewvala_response_events_audit AFTER INSERT ON public.reviewvala_response_events
FOR EACH ROW EXECUTE FUNCTION public.reviewvala_audit_response_events();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reviewvala_audit_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;