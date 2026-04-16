ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
ALTER TABLE judge_invitations ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
