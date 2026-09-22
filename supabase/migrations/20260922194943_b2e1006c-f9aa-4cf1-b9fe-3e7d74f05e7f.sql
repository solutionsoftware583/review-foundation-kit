
REVOKE ALL ON FUNCTION public.reviewvala_member_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reviewvala_is_member(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reviewvala_can_write(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reviewvala_is_admin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reviewvala_claim_membership(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_reviewvala_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reviewvala_member_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reviewvala_is_member(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reviewvala_can_write(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reviewvala_is_admin(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reviewvala_claim_membership(text) TO authenticated;
