ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

-- Backfill existing pending invitations as already-emailed. Pre-PR, the create
-- handler emailed unconditionally on insert, so any pending row already saw
-- a send attempt. Without this, the next go-live transition would replay
-- sendPendingTeamInvitationEmails over every historic invite and spam users.
-- Failed deliveries from before this column existed are accepted as lost; the
-- new path retries within a single go-live, but cannot reach back further.
UPDATE team_invitations
SET emailed_at = created_at
WHERE emailed_at IS NULL
  AND status = 'pending';
