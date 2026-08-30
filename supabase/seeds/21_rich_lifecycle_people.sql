-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - PEOPLE AND JUDGE INVITES
-- 3,024 people across organizer, judge, mentor, and attendee roles.
-- Depends on: 20_rich_lifecycle_events.sql
-- ============================================================================

WITH rich_events AS (
  SELECT
    id,
    (metadata->'seed'->>'theme_index')::int AS theme_index,
    metadata->'seed'->>'theme_slug' AS theme_slug,
    (metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    metadata->'seed'->>'target_status' AS target_status,
    (metadata->'seed'->>'expected_people')::int AS people_count
  FROM hackathons
  WHERE metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
people AS (
  SELECT
    rich_events.*,
    person_index,
    (ARRAY[
      'Amina', 'Mateo', 'Priya', 'Noah', 'Sofia', 'Ethan', 'Maya', 'Lucas',
      'Zoe', 'Omar', 'Chloe', 'Liam', 'Nia', 'Arjun', 'Leila', 'Theo',
      'Mei', 'Sam', 'Fatima', 'Leo', 'Anika', 'Jonah', 'Iris', 'Kai'
    ])[1 + ((person_index + theme_index - 2) % 24)] AS first_name,
    (ARRAY[
      'Chen', 'Singh', 'Garcia', 'Williams', 'Patel', 'Kim', 'Brown', 'Nguyen',
      'Martin', 'Ali', 'Wilson', 'Khan', 'Taylor', 'Park', 'Davis', 'Lopez',
      'Johnson', 'Murphy', 'Sato', 'Okafor', 'Dubois', 'Rossi', 'Silva', 'Cohen'
    ])[1 + (((person_index * 3) + theme_index - 2) % 24)] AS last_name
  FROM rich_events
  CROSS JOIN LATERAL generate_series(1, rich_events.people_count) AS person_index
),
identified AS (
  SELECT
    *,
    lower(format(
      'seed_user_%s_%s_%s_%s_%s',
      regexp_replace(first_name, '[^a-zA-Z]', '', 'g'),
      regexp_replace(last_name, '[^a-zA-Z]', '', 'g'),
      lpad(theme_index::text, 2, '0'),
      lifecycle_index,
      lpad(person_index::text, 3, '0')
    )) AS clerk_user_id
  FROM people
)
INSERT INTO hackathon_participants (
  id,
  hackathon_id,
  clerk_user_id,
  role,
  registered_at
)
SELECT
  md5('rich-person-' || theme_slug || '-' || target_status || '-' || person_index)::uuid,
  id,
  clerk_user_id,
  CASE
    WHEN person_index <= 2 THEN 'organizer'::participant_role
    WHEN person_index <= 4 THEN 'judge'::participant_role
    WHEN person_index <= 6 THEN 'mentor'::participant_role
    ELSE 'participant'::participant_role
  END,
  now() - make_interval(days => greatest(1, 80 - (lifecycle_index * 10) + (person_index % 8)))
FROM identified
ON CONFLICT (id) DO NOTHING;

WITH rich_people AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    p.id AS participant_id,
    p.clerk_user_id,
    row_number() OVER (PARTITION BY h.id ORDER BY p.clerk_user_id) AS judge_number
  FROM hackathons h
  JOIN hackathon_participants p ON p.hackathon_id = h.id AND p.role = 'judge'
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
)
INSERT INTO hackathon_judges_display (
  id,
  hackathon_id,
  participant_id,
  clerk_user_id,
  name,
  title,
  organization,
  headshot_url,
  display_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-judge-display-' || theme_slug || '-' || target_status || '-' || judge_number)::uuid,
  hackathon_id,
  participant_id,
  clerk_user_id,
  (ARRAY[
    'Amina Chen', 'Mateo Garcia', 'Priya Singh', 'Noah Williams', 'Sofia Kim', 'Ethan Patel',
    'Maya Brown', 'Lucas Nguyen', 'Zoe Martin', 'Omar Ali', 'Chloe Wilson', 'Liam Khan',
    'Nia Taylor', 'Arjun Park', 'Leila Davis', 'Theo Lopez', 'Mei Johnson', 'Sam Murphy'
  ])[1 + ((theme_index + judge_number - 2) % 18)],
  CASE judge_number WHEN 1 THEN 'Product and community judge' ELSE 'Technical and impact judge' END,
  (ARRAY['Northstar Labs', 'Open Works', 'Civic Studio', 'Maker Commons', 'Field Notes'])[1 + ((theme_index + judge_number - 2) % 5)],
  'https://images.unsplash.com/photo-' ||
    (ARRAY[
      '1494790108377-be9c29b29330', '1500648767791-00dcc994a43e', '1534528741775-53994a69daeb',
      '1507003211169-0a1dd7228f2d', '1438761681033-6461ffad8d80', '1506794778202-cad84cf45f1d',
      '1544005313-94ddf0286df2', '1517841905240-472988babdf9', '1531123897727-8f129e1688ce',
      '1527980965255-d3b416303d12', '1547425260-76bcadfb4f2c', '1535713875002-d1d0cf377fde',
      '1524504388940-b1c1722653e1', '1520813792240-56fc4a3765a7'
    ])[1 + ((theme_index + lifecycle_index + judge_number - 3) % 14)] ||
    '?auto=format&fit=crop&w=500&h=500&q=82',
  judge_number - 1,
  now() - interval '20 days',
  now()
FROM rich_people
ON CONFLICT (id) DO NOTHING;

WITH rich_events AS (
  SELECT
    h.id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    organizer.clerk_user_id AS invited_by,
    judge.clerk_user_id AS accepted_by
  FROM hackathons h
  JOIN LATERAL (
    SELECT clerk_user_id
    FROM hackathon_participants
    WHERE hackathon_id = h.id AND role = 'organizer'
    ORDER BY clerk_user_id
    LIMIT 1
  ) organizer ON true
  JOIN LATERAL (
    SELECT clerk_user_id
    FROM hackathon_participants
    WHERE hackathon_id = h.id AND role = 'judge'
    ORDER BY clerk_user_id
    LIMIT 1
  ) judge ON true
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 2
),
invites AS (
  SELECT rich_events.*, invite_number
  FROM rich_events
  CROSS JOIN generate_series(1, 3) AS invite_number
)
INSERT INTO judge_invitations (
  id,
  hackathon_id,
  email,
  token,
  invited_by_clerk_user_id,
  status,
  accepted_by_clerk_user_id,
  expires_at,
  emailed_at,
  reminded_at,
  created_at,
  updated_at
)
SELECT
  md5('rich-judge-invite-' || theme_slug || '-' || target_status || '-' || invite_number)::uuid,
  id,
  format('judge.%s.%s.%s@example.com', invite_number, theme_slug, replace(target_status, '_', '-')),
  encode(digest('rich-judge-token-' || theme_slug || '-' || target_status || '-' || invite_number, 'sha256'), 'hex'),
  invited_by,
  CASE
    WHEN invite_number = 1 THEN 'pending'
    WHEN invite_number = 2 AND lifecycle_index = 2 THEN 'cancelled'
    WHEN invite_number = 2 THEN 'accepted'
    ELSE 'expired'
  END,
  CASE WHEN invite_number = 2 AND lifecycle_index >= 3 THEN accepted_by ELSE NULL END,
  CASE WHEN invite_number = 3 THEN now() - interval '2 days' ELSE now() + interval '30 days' END,
  CASE WHEN lifecycle_index = 2 THEN NULL ELSE now() - interval '8 days' END,
  CASE WHEN invite_number = 1 AND lifecycle_index >= 4 THEN now() - interval '2 days' ELSE NULL END,
  now() - interval '12 days',
  now()
FROM invites
ON CONFLICT (id) DO NOTHING;
