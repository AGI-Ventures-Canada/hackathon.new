-- Weighted Score Prizes
--
-- Adds a fifth judging style 'weighted_score' for classic rubric scoring with sliders.
-- Judges fill ONE unified scorecard per submission with all criteria (core + prize-specific).
-- Aggregates produce per-prize rankings (core + prize criteria) AND a core-only ranking.
--
-- Schema additions:
-- 1. Allow 'weighted_score' on prizes.judging_style
-- 2. judge_assignments.assignment_kind to distinguish unified scorecards from per-prize ones
-- 3. hackathon_results.result_kind to distinguish core-only ranking rows from prize rows
-- 4. Index on weighted_score prizes for fast lookup
--
-- Existing fields reused:
-- - judging_criteria.prize_id NULL = core (hackathon-wide), set = prize-specific
-- - judging_criteria.weight reused as absolute % of 100
-- - judging_criteria.max_score = 10 for weighted_score

-- ============================================================
-- 1. Allow weighted_score on prizes.judging_style
-- ============================================================

ALTER TABLE prizes DROP CONSTRAINT IF EXISTS prizes_judging_style_check;
ALTER TABLE prizes ADD CONSTRAINT prizes_judging_style_check
  CHECK (judging_style IN ('bucket_sort', 'gate_check', 'crowd_vote', 'judges_pick', 'weighted_score'));

-- ============================================================
-- 2. Distinguish unified scorecards from per-prize assignments
-- ============================================================

ALTER TABLE judge_assignments
  ADD COLUMN IF NOT EXISTS assignment_kind text
    NOT NULL DEFAULT 'per_prize'
    CHECK (assignment_kind IN ('per_prize', 'unified_weighted_score'));

CREATE INDEX IF NOT EXISTS idx_judge_assignments_kind
  ON judge_assignments(assignment_kind)
  WHERE assignment_kind = 'unified_weighted_score';

-- ============================================================
-- 3. Distinguish core-only result rows from prize result rows
-- ============================================================

ALTER TABLE hackathon_results
  ADD COLUMN IF NOT EXISTS result_kind text
    NOT NULL DEFAULT 'prize'
    CHECK (result_kind IN ('prize', 'core_only'));

CREATE INDEX IF NOT EXISTS idx_hackathon_results_core_only
  ON hackathon_results(hackathon_id, submission_id)
  WHERE result_kind = 'core_only';

-- ============================================================
-- 4. Index for finding weighted_score prizes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_prizes_weighted_score
  ON prizes(hackathon_id) WHERE judging_style = 'weighted_score';
