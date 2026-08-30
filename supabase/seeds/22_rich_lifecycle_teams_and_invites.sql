-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - TEAMS AND INVITATIONS
-- 574 teams plus invitation states for queueing, acceptance, decline, expiry,
-- cancellation, reminders, approval review, and disbanded alumni teams.
-- Depends on: 21_rich_lifecycle_people.sql
-- ============================================================================

WITH event_counts AS (
  SELECT
    h.id AS hackathon_id,
    h.require_team_approval,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    greatest(floor(((h.metadata->'seed'->>'expected_attendees')::int - 2) / 4.0)::int, 0) AS team_count
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
team_rows AS (
  SELECT event_counts.*, team_number
  FROM event_counts
  CROSS JOIN LATERAL generate_series(1, event_counts.team_count) AS team_number
),
captains AS (
  SELECT
    team_rows.*,
    captain.clerk_user_id AS captain_clerk_user_id
  FROM team_rows
  JOIN LATERAL (
    SELECT p.clerk_user_id
    FROM hackathon_participants p
    WHERE p.hackathon_id = team_rows.hackathon_id
      AND p.role = 'participant'
    ORDER BY p.clerk_user_id
    OFFSET ((team_rows.team_number - 1) * 4)
    LIMIT 1
  ) captain ON true
)
INSERT INTO teams (
  id,
  hackathon_id,
  name,
  captain_clerk_user_id,
  invite_code,
  mode,
  status,
  created_at,
  updated_at
)
SELECT
  md5('rich-team-' || theme_slug || '-' || target_status || '-' || team_number)::uuid,
  hackathon_id,
  (ARRAY[
    'Northstar Makers', 'Bright Ideas Lab', 'Open Trail Crew', 'Signal Foundry',
    'Kindred Systems', 'Field Testers', 'Common Ground', 'Bold Prototype',
    'Good Trouble Studio', 'Launch Window', 'Careful Builders', 'Fresh Perspective'
  ])[1 + ((team_number + theme_index - 2) % 12)] || ' ' || lpad(team_number::text, 2, '0'),
  captain_clerk_user_id,
  upper(substr(md5('rich-invite-code-' || theme_slug || '-' || target_status || '-' || team_number), 1, 10)),
  CASE WHEN (team_number + theme_index) % 3 = 0 THEN 'virtual'::team_mode ELSE 'in_person'::team_mode END,
  CASE
    WHEN lifecycle_index = 2 THEN 'forming'::team_status
    WHEN lifecycle_index = 3 AND require_team_approval AND team_number % 2 = 0 THEN 'pending_approval'::team_status
    WHEN lifecycle_index = 3 THEN 'forming'::team_status
    WHEN lifecycle_index = 4 AND require_team_approval AND team_number = team_count THEN 'pending_approval'::team_status
    WHEN lifecycle_index = 7 AND team_number = team_count THEN 'disbanded'::team_status
    ELSE 'locked'::team_status
  END,
  now() - make_interval(days => greatest(2, 60 - (lifecycle_index * 8) + (team_number % 4))),
  now() - make_interval(days => greatest(0, 10 - lifecycle_index))
FROM captains
ON CONFLICT (id) DO NOTHING;

WITH numbered_attendees AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    p.id AS participant_id,
    row_number() OVER (PARTITION BY h.id ORDER BY p.clerk_user_id) AS attendee_number,
    greatest(floor(((h.metadata->'seed'->>'expected_attendees')::int - 2) / 4.0)::int, 0) AS team_count
  FROM hackathons h
  JOIN hackathon_participants p ON p.hackathon_id = h.id AND p.role = 'participant'
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
assignments AS (
  SELECT
    numbered_attendees.participant_id,
    md5(
      'rich-team-' || theme_slug || '-' || target_status || '-' ||
      ceil(attendee_number / 4.0)::int
    )::uuid AS team_id
  FROM numbered_attendees
  WHERE attendee_number <= team_count * 4
)
UPDATE hackathon_participants p
SET team_id = assignments.team_id
FROM assignments
WHERE p.id = assignments.participant_id;

WITH event_teams AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    t.id AS team_id,
    t.captain_clerk_user_id,
    row_number() OVER (PARTITION BY h.id ORDER BY t.id) AS invite_number
  FROM hackathons h
  JOIN teams t ON t.hackathon_id = h.id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 2
),
invite_rows AS (
  SELECT *
  FROM event_teams
  WHERE invite_number <= 5
),
accepted_people AS (
  SELECT
    invite_rows.*,
    accepted.clerk_user_id AS accepted_by_clerk_user_id
  FROM invite_rows
  LEFT JOIN LATERAL (
    SELECT p.clerk_user_id
    FROM hackathon_participants p
    WHERE p.hackathon_id = invite_rows.hackathon_id
      AND p.role = 'participant'
      AND p.team_id IS NULL
    ORDER BY p.clerk_user_id
    LIMIT 1
  ) accepted ON invite_rows.invite_number = 2
)
INSERT INTO team_invitations (
  id,
  hackathon_id,
  team_id,
  email,
  token,
  invited_by_clerk_user_id,
  status,
  accepted_by_clerk_user_id,
  accepted_at,
  expires_at,
  emailed_at,
  reminded_at,
  is_captain_invite,
  created_at,
  updated_at
)
SELECT
  md5('rich-team-invite-' || theme_slug || '-' || target_status || '-' || invite_number)::uuid,
  hackathon_id,
  team_id,
  format('teammate.%s.%s.%s@example.com', invite_number, theme_slug, replace(target_status, '_', '-')),
  encode(digest('rich-team-token-' || theme_slug || '-' || target_status || '-' || invite_number, 'sha256'), 'hex'),
  captain_clerk_user_id,
  (ARRAY['pending'::invitation_status, 'accepted'::invitation_status, 'declined'::invitation_status, 'expired'::invitation_status, 'cancelled'::invitation_status])[invite_number::int],
  CASE WHEN invite_number = 2 THEN accepted_by_clerk_user_id ELSE NULL END,
  CASE WHEN invite_number = 2 THEN now() - interval '6 days' ELSE NULL END,
  CASE WHEN invite_number = 4 THEN now() - interval '2 days' ELSE now() + interval '30 days' END,
  CASE WHEN lifecycle_index = 2 THEN NULL ELSE now() - interval '10 days' END,
  CASE WHEN invite_number = 1 AND lifecycle_index >= 4 THEN now() - interval '3 days' ELSE NULL END,
  false,
  now() - interval '14 days',
  now()
FROM accepted_people
ON CONFLICT (id) DO NOTHING;

WITH accepted_invites AS (
  SELECT
    invitation.accepted_by_clerk_user_id,
    invitation.hackathon_id,
    invitation.team_id
  FROM team_invitations invitation
  JOIN hackathons h ON h.id = invitation.hackathon_id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND invitation.status = 'accepted'
    AND invitation.accepted_by_clerk_user_id IS NOT NULL
)
UPDATE hackathon_participants participant
SET team_id = accepted_invites.team_id
FROM accepted_invites
WHERE participant.hackathon_id = accepted_invites.hackathon_id
  AND participant.clerk_user_id = accepted_invites.accepted_by_clerk_user_id;
