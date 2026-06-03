-- Re-lock approve_pending_team permissions after review-time RPC rewrites.
-- This keeps preview branches that ran the earlier function body in the same final grant state.
REVOKE ALL ON FUNCTION public.approve_pending_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_team(UUID, UUID) TO service_role;
