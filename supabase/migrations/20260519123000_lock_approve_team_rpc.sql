-- Re-lock approve_pending_team permissions after review-time RPC rewrites.
REVOKE ALL ON FUNCTION public.approve_pending_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_team(UUID, UUID) TO service_role;
