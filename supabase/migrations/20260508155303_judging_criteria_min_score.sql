-- Add min_score to judging_criteria so weighted-score criteria can have a
-- custom slider range. max_score already exists.
--
-- Default is 0 to remain valid for legacy rows (e.g. gate_check uses
-- max_score=1, weight=1). Weighted-score criteria explicitly default to
-- min_score=1 in the service layer.

ALTER TABLE judging_criteria
  ADD COLUMN IF NOT EXISTS min_score integer NOT NULL DEFAULT 0
    CHECK (min_score >= 0);

ALTER TABLE judging_criteria
  ADD CONSTRAINT judging_criteria_min_lt_max
    CHECK (min_score < max_score);
