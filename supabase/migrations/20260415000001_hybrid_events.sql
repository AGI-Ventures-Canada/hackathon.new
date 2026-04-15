-- Hybrid events: allow events to be both in-person and virtual
-- Teams declare their mode; prizes can limit which modes can qualify.

-- 1. Extend location_type enum with 'hybrid'
ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'hybrid';

-- 2. Add team_mode enum + column on teams (nullable: null = not a hybrid event)
CREATE TYPE team_mode AS ENUM ('in_person', 'virtual');

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS mode team_mode;

CREATE INDEX IF NOT EXISTS idx_teams_mode ON teams(mode);

-- 3. Add allowed_team_modes on prizes (null = any team mode can win)
ALTER TABLE prizes
  ADD COLUMN IF NOT EXISTS allowed_team_modes team_mode[];

COMMENT ON COLUMN teams.mode IS 'How this team is participating. Only meaningful when the event is hybrid. Null for non-hybrid events.';
COMMENT ON COLUMN prizes.allowed_team_modes IS 'Restricts which team modes can qualify for this prize. Null means any team mode qualifies.';
