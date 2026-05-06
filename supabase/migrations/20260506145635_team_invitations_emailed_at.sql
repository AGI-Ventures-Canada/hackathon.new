ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

UPDATE team_invitations
SET emailed_at = created_at
WHERE emailed_at IS NULL;
