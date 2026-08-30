-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - FINALIZE EVENT STATES
-- Apply lifecycle states after all mutation-sensitive related data exists.
-- Depends on: 26_rich_lifecycle_judging.sql
-- ============================================================================

UPDATE hackathons
SET
  status = (metadata->'seed'->>'target_status')::hackathon_status,
  challenge_released_at = CASE
    WHEN (metadata->'seed'->>'lifecycle_index')::int >= 4 THEN starts_at - interval '5 days'
    ELSE NULL
  END,
  results_published_at = CASE
    WHEN (metadata->'seed'->>'lifecycle_index')::int >= 6 THEN ends_at + interval '2 days'
    ELSE NULL
  END,
  results_announcement_sent_at = CASE
    WHEN (metadata->'seed'->>'lifecycle_index')::int >= 6 THEN ends_at + interval '2 days 15 minutes'
    ELSE NULL
  END,
  winner_emails_sent_at = CASE
    WHEN (metadata->'seed'->>'lifecycle_index')::int >= 6 THEN ends_at + interval '2 days 30 minutes'
    ELSE NULL
  END,
  feedback_survey_sent_at = CASE
    WHEN (metadata->'seed'->>'lifecycle_index')::int >= 6 THEN ends_at + interval '3 days'
    ELSE NULL
  END,
  updated_at = now()
WHERE metadata->'seed'->>'collection' = 'rich-lifecycle-showcase';
