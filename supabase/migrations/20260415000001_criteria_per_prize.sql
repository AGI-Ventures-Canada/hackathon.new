-- ============================================================
-- Per-prize judging criteria
-- ============================================================
-- Adds prize_id to judging_criteria so gate_check prizes can own
-- their own yes/no criteria. Nullable to preserve existing
-- hackathon-wide / round-scoped criteria (used by rubric mode).
-- ============================================================

ALTER TABLE judging_criteria
  ADD COLUMN IF NOT EXISTS prize_id uuid REFERENCES prizes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_judging_criteria_prize
  ON judging_criteria(prize_id) WHERE prize_id IS NOT NULL;
