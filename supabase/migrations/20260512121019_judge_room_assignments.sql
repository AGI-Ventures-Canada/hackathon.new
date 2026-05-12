CREATE TABLE IF NOT EXISTS judge_room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  judge_participant_id uuid NOT NULL REFERENCES hackathon_participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, judge_participant_id)
);

CREATE INDEX IF NOT EXISTS judge_room_assignments_hackathon_idx ON judge_room_assignments(hackathon_id);
CREATE INDEX IF NOT EXISTS judge_room_assignments_room_idx ON judge_room_assignments(room_id);
CREATE INDEX IF NOT EXISTS judge_room_assignments_judge_idx ON judge_room_assignments(judge_participant_id);

ALTER TABLE judge_room_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to judge_room_assignments" ON judge_room_assignments FOR ALL USING (false);

ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS auto_assign_by_room boolean NOT NULL DEFAULT false;
