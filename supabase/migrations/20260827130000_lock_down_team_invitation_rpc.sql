DROP FUNCTION IF EXISTS public.accept_team_invitation(TEXT, TEXT);

REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.bulk_assign_teams(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_assign_teams(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_assign_teams(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_assign_teams(UUID, JSONB) TO service_role;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at DESC, id DESC) AS position
  FROM public.team_invitations
  WHERE status = 'pending' AND is_captain_invite
)
UPDATE public.team_invitations AS invitation
SET status = 'cancelled', updated_at = NOW()
FROM ranked
WHERE invitation.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_captain_invitation_per_team
ON public.team_invitations(team_id)
WHERE status = 'pending' AND is_captain_invite;
