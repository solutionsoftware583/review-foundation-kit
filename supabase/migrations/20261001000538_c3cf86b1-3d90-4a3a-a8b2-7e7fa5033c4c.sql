CREATE OR REPLACE FUNCTION public.reviewvala_create_workspace(_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _slug text; _email text; _fname text; _base text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 OR length(trim(_name)) > 80 THEN RAISE EXCEPTION 'Workspace name must be 2–80 characters'; END IF;
  _base := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base = '' THEN _base := 'workspace'; END IF;
  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM reviewvala_workspaces WHERE slug = _slug) LOOP
    _slug := _base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;
  SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) INTO _email, _fname FROM auth.users u WHERE u.id = _uid;
  INSERT INTO reviewvala_workspaces (slug, name, owner_user_id) VALUES (_slug, trim(_name), _uid);
  INSERT INTO reviewvala_members (user_id, workspace_slug, email, full_name, role, status)
  VALUES (_uid, _slug, COALESCE(_email,''), COALESCE(_fname,''), 'Admin', 'Active');
  INSERT INTO reviewvala_publish_targets (workspace_slug, platform, mode, character_limit, max_attempts, is_enabled, notes)
  SELECT _slug, platform, mode, character_limit, max_attempts, is_enabled, notes FROM reviewvala_publish_targets WHERE workspace_slug = 'northstar-group';
  INSERT INTO reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
  VALUES (_slug, _uid, COALESCE(_fname,''), 'Workspace created', trim(_name), 'Creator joined as Admin');
  RETURN _slug;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reviewvala_create_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reviewvala_create_workspace(text) TO authenticated;