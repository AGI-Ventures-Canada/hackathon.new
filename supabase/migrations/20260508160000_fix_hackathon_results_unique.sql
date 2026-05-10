-- Fix: hackathon_results legacy unique index is too restrictive.
--
-- The original index keyed only (hackathon_id, submission_id), which blocks:
-- 1. Weighted-score prizes, where one submission is ranked in multiple prizes
--    plus a core-only row (result_kind='prize' rows for prize_id=A, prize_id=B,
--    plus a result_kind='core_only' row with prize_id=NULL).
-- 2. Any per-prize judging style where a submission competes across multiple
--    prizes within the same hackathon.
--
-- The index now also keys on prize_id (with NULL coalesced) and result_kind so
-- different prizes and prize-vs-core-only rows coexist for the same submission,
-- while still preventing true duplicates within a single (prize, kind) bucket.

DROP INDEX IF EXISTS hackathon_results_legacy_unique;

CREATE UNIQUE INDEX IF NOT EXISTS hackathon_results_legacy_unique
  ON hackathon_results(
    hackathon_id,
    submission_id,
    COALESCE(prize_id, '00000000-0000-0000-0000-000000000000'::uuid),
    result_kind
  )
  WHERE prize_track_id IS NULL AND round_id IS NULL;
