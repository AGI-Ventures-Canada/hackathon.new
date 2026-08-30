-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - JUDGING AND RESULTS
-- Adds planned/active/complete rounds, weighted rubrics, judge work, partial
-- scoring, final results, and prize assignments.
-- Depends on: 25_rich_lifecycle_programs.sql
-- ============================================================================

WITH judging_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
round_rows AS (
  SELECT judging_events.*, round_number
  FROM judging_events
  CROSS JOIN generate_series(1, 2) AS round_number
)
INSERT INTO judging_rounds (
  id,
  hackathon_id,
  name,
  round_type,
  is_active,
  display_order,
  style,
  status,
  advancement,
  advancement_config,
  created_at,
  updated_at
)
SELECT
  md5('rich-round-' || theme_slug || '-' || target_status || '-' || round_number)::uuid,
  hackathon_id,
  CASE round_number WHEN 1 THEN 'First look' ELSE 'Final scorecards' END,
  CASE round_number WHEN 1 THEN 'preliminary' ELSE 'finals' END,
  lifecycle_index = 5 AND round_number = 2,
  round_number - 1,
  CASE round_number WHEN 1 THEN 'gate_check'::judging_style ELSE 'points'::judging_style END,
  CASE
    WHEN lifecycle_index = 5 AND round_number = 1 THEN 'advanced'::round_status
    WHEN lifecycle_index = 5 THEN 'active'::round_status
    ELSE 'complete'::round_status
  END,
  CASE round_number WHEN 1 THEN 'top_n'::advancement_rule ELSE 'manual'::advancement_rule END,
  CASE round_number
    WHEN 1 THEN jsonb_build_object('count', 12, 'tie_breaker', 'judge discussion')
    ELSE jsonb_build_object('publish_after_review', true)
  END,
  now() - interval '8 days',
  now()
FROM round_rows
ON CONFLICT (id) DO NOTHING;

WITH final_rounds AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    round.id AS round_id
  FROM hackathons h
  JOIN judging_rounds round
    ON round.id = md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
criteria_rows AS (
  SELECT final_rounds.*, criterion_number
  FROM final_rounds
  CROSS JOIN generate_series(1, 4) AS criterion_number
)
INSERT INTO judging_criteria (
  id,
  hackathon_id,
  round_id,
  name,
  description,
  min_score,
  max_score,
  weight,
  category,
  display_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-criterion-' || theme_slug || '-' || target_status || '-' || criterion_number)::uuid,
  hackathon_id,
  round_id,
  (ARRAY['Problem and people', 'Working build', 'Useful impact', 'Clear and inclusive demo'])[criterion_number],
  (ARRAY[
    'The team names a real problem, shows who has it, and explains what they learned from people.',
    'The main task works in the live demo. The team can explain the hard parts and the choices they made.',
    'The next step is practical. The team names risks, limits, and a useful way to measure progress.',
    'The demo is easy to follow, uses plain words, includes captions, and gives every teammate a role.'
  ])[criterion_number],
  0,
  10,
  25,
  'core'::criterion_category,
  criterion_number - 1,
  now() - interval '7 days',
  now()
FROM criteria_rows
ON CONFLICT (id) DO NOTHING;

WITH prize_rounds AS (
  SELECT
    prize.id AS prize_id,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  JOIN prizes prize ON prize.hackathon_id = h.id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
)
UPDATE prizes
SET round_id = prize_rounds.round_id,
    updated_at = now()
FROM prize_rounds
WHERE prizes.id = prize_rounds.prize_id;

WITH judging_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
judges AS (
  SELECT
    judging_events.*,
    participant.id AS judge_participant_id,
    row_number() OVER (PARTITION BY judging_events.hackathon_id ORDER BY participant.clerk_user_id) AS judge_number
  FROM judging_events
  JOIN hackathon_participants participant
    ON participant.hackathon_id = judging_events.hackathon_id
   AND participant.role = 'judge'
),
projects AS (
  SELECT
    submission.id AS submission_id,
    submission.hackathon_id,
    (submission.metadata->'seed'->>'project_number')::int AS project_number
  FROM submissions submission
  JOIN judging_events ON judging_events.hackathon_id = submission.hackathon_id
  WHERE submission.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
assignment_rows AS (
  SELECT
    judges.*,
    projects.submission_id,
    projects.project_number,
    CASE
      WHEN judges.lifecycle_index >= 6 THEN true
      ELSE (projects.project_number + judges.judge_number) % 2 = 0
    END AS is_complete
  FROM judges
  JOIN projects ON projects.hackathon_id = judges.hackathon_id
)
INSERT INTO judge_assignments (
  id,
  hackathon_id,
  judge_participant_id,
  submission_id,
  round_id,
  assignment_kind,
  notes,
  viewed_at,
  is_complete,
  completed_at,
  assigned_at
)
SELECT
  md5('rich-assignment-' || theme_slug || '-' || target_status || '-' || project_number || '-' || judge_number)::uuid,
  hackathon_id,
  judge_participant_id,
  submission_id,
  round_id,
  'unified_weighted_score',
  CASE WHEN is_complete THEN 'Reviewed the live demo, project page, safety notes, and user test summary.' ELSE '' END,
  CASE WHEN is_complete OR project_number % 3 = 0 THEN now() - interval '1 day' ELSE NULL END,
  is_complete,
  CASE WHEN is_complete THEN now() - make_interval(hours => (project_number + judge_number)::int) ELSE NULL END,
  now() - interval '4 days'
FROM assignment_rows
ON CONFLICT (id) DO NOTHING;

WITH complete_assignments AS (
  SELECT
    assignment.id AS assignment_id,
    assignment.hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (submission.metadata->'seed'->>'project_number')::int AS project_number,
    row_number() OVER (
      PARTITION BY assignment.hackathon_id, assignment.submission_id
      ORDER BY assignment.judge_participant_id
    ) AS judge_number
  FROM judge_assignments assignment
  JOIN hackathons h ON h.id = assignment.hackathon_id
  JOIN submissions submission ON submission.id = assignment.submission_id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND assignment.is_complete
),
score_rows AS (
  SELECT complete_assignments.*, criterion_number
  FROM complete_assignments
  CROSS JOIN generate_series(1, 4) AS criterion_number
)
INSERT INTO scores (
  id,
  judge_assignment_id,
  criteria_id,
  score,
  created_at,
  updated_at
)
SELECT
  md5('rich-score-' || assignment_id || '-' || criterion_number)::uuid,
  assignment_id,
  md5('rich-criterion-' || theme_slug || '-' || target_status || '-' || criterion_number)::uuid,
  6 + ((project_number + judge_number + criterion_number) % 5),
  now() - interval '2 days',
  now()
FROM score_rows
ON CONFLICT (id) DO NOTHING;

WITH result_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 6
),
ranked_projects AS (
  SELECT
    result_events.*,
    submission.id AS submission_id,
    row_number() OVER (
      PARTITION BY result_events.hackathon_id
      ORDER BY (submission.metadata->'seed'->>'project_number')::int
    ) AS rank
  FROM result_events
  JOIN submissions submission ON submission.hackathon_id = result_events.hackathon_id
  WHERE submission.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
winners AS (
  SELECT * FROM ranked_projects WHERE rank <= 3
)
INSERT INTO hackathon_results (
  id,
  hackathon_id,
  submission_id,
  prize_id,
  round_id,
  rank,
  total_score,
  weighted_score,
  judge_count,
  result_kind,
  published_at,
  created_at
)
SELECT
  md5('rich-result-' || theme_slug || '-' || target_status || '-' || rank)::uuid,
  hackathon_id,
  submission_id,
  md5('rich-prize-' || theme_slug || '-' || target_status || '-' || rank)::uuid,
  round_id,
  rank,
  38 - (rank * 2),
  95 - (rank * 4),
  2,
  'prize',
  now() - interval '2 days',
  now() - interval '2 days'
FROM winners
ON CONFLICT (id) DO NOTHING;

WITH result_prizes AS (
  SELECT result.prize_id, result.submission_id
  FROM hackathon_results result
  JOIN hackathons h ON h.id = result.hackathon_id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND result.prize_id IS NOT NULL
)
INSERT INTO prize_assignments (
  id,
  prize_id,
  submission_id,
  assigned_at
)
SELECT
  md5('rich-prize-assignment-' || prize_id || '-' || submission_id)::uuid,
  prize_id,
  submission_id,
  now() - interval '2 days'
FROM result_prizes
ON CONFLICT (prize_id, submission_id) DO NOTHING;
