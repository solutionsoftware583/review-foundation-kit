ALTER TABLE public.reviewvala_workspaces
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-IN';

CREATE TABLE public.reviewvala_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL REFERENCES public.reviewvala_workspaces(slug) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  role public.reviewvala_role NOT NULL DEFAULT 'Viewer',
  label text NOT NULL DEFAULT '',
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_by uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewvala_invites TO authenticated;
GRANT ALL ON public.reviewvala_invites TO service_role;
ALTER TABLE public.reviewvala_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read invites" ON public.reviewvala_invites
  FOR SELECT TO authenticated USING (public.reviewvala_is_admin(auth.uid(), workspace_slug));
CREATE POLICY "Admins create invites" ON public.reviewvala_invites
  FOR INSERT TO authenticated WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug) AND created_by = auth.uid());
CREATE POLICY "Admins update invites" ON public.reviewvala_invites
  FOR UPDATE TO authenticated USING (public.reviewvala_is_admin(auth.uid(), workspace_slug))
  WITH CHECK (public.reviewvala_is_admin(auth.uid(), workspace_slug));
CREATE POLICY "Admins delete invites" ON public.reviewvala_invites
  FOR DELETE TO authenticated USING (public.reviewvala_is_admin(auth.uid(), workspace_slug));

CREATE TRIGGER reviewvala_invites_updated_at BEFORE UPDATE ON public.reviewvala_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_reviewvala_updated_at();

CREATE TABLE public.reviewvala_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_slug text NOT NULL,
  actor_user_id uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reviewvala_audit_log TO authenticated;
GRANT ALL ON public.reviewvala_audit_log TO service_role;
ALTER TABLE public.reviewvala_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read audit log" ON public.reviewvala_audit_log
  FOR SELECT TO authenticated USING (public.reviewvala_is_member(auth.uid(), workspace_slug));
CREATE POLICY "Members write audit log" ON public.reviewvala_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.reviewvala_is_member(auth.uid(), workspace_slug) AND actor_user_id = auth.uid());

CREATE INDEX reviewvala_audit_log_workspace_created_idx
  ON public.reviewvala_audit_log (workspace_slug, created_at DESC);

CREATE OR REPLACE FUNCTION public.reviewvala_redeem_invite(_code text)
RETURNS public.reviewvala_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _invite public.reviewvala_invites;
  _email text;
  _name text;
  _row public.reviewvala_members;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _invite FROM public.reviewvala_invites
  WHERE code = upper(trim(_code));

  IF NOT FOUND OR _invite.revoked
     OR (_invite.expires_at IS NOT NULL AND _invite.expires_at < now())
     OR _invite.used_count >= _invite.max_uses THEN
    RAISE EXCEPTION 'This invite link is not valid any more';
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    INTO _email, _name
  FROM auth.users u WHERE u.id = _uid;

  INSERT INTO public.reviewvala_members (user_id, workspace_slug, email, full_name, role, status)
  VALUES (_uid, _invite.workspace_slug, COALESCE(_email,''), COALESCE(_name,''), _invite.role, 'Active')
  ON CONFLICT (user_id, workspace_slug) DO UPDATE
    SET status = 'Active',
        role = CASE WHEN public.reviewvala_members.status = 'Active'
                    THEN public.reviewvala_members.role ELSE EXCLUDED.role END,
        updated_at = now()
  RETURNING * INTO _row;

  UPDATE public.reviewvala_invites SET used_count = used_count + 1, updated_at = now()
  WHERE id = _invite.id;

  INSERT INTO public.reviewvala_audit_log (workspace_slug, actor_user_id, actor_name, action, target, detail)
  VALUES (_invite.workspace_slug, _uid, COALESCE(_name,''), 'Invite redeemed', COALESCE(_email,''), 'Joined as ' || _invite.role);

  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.reviewvala_redeem_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reviewvala_redeem_invite(text) TO authenticated, service_role;