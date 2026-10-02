-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - PROJECTS
-- Team and solo projects cover draft, submitted, review, accepted, rejected,
-- and winner states. Every project includes a rich screenshot and demo metadata.
-- Depends on: 22_rich_lifecycle_teams_and_invites.sql
-- ============================================================================

WITH eligible_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'theme_focus' AS theme_focus,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 4
),
owners AS (
  SELECT
    eligible_events.*,
    team.id AS team_id,
    NULL::uuid AS participant_id,
    team.name AS owner_name
  FROM eligible_events
  JOIN teams team ON team.hackathon_id = eligible_events.hackathon_id

  UNION ALL

  SELECT
    eligible_events.*,
    NULL::uuid AS team_id,
    participant.id AS participant_id,
    'Solo Builder' AS owner_name
  FROM eligible_events
  JOIN hackathon_participants participant
    ON participant.hackathon_id = eligible_events.hackathon_id
   AND participant.role = 'participant'
   AND participant.team_id IS NULL
),
numbered_projects AS (
  SELECT
    owners.*,
    row_number() OVER (
      PARTITION BY hackathon_id
      ORDER BY team_id NULLS LAST, participant_id NULLS LAST
    ) AS project_number
  FROM owners
)
INSERT INTO submissions (
  id,
  hackathon_id,
  participant_id,
  team_id,
  title,
  description,
  github_url,
  live_app_url,
  demo_video_url,
  screenshot_url,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  md5('rich-project-' || theme_slug || '-' || target_status || '-' || project_number)::uuid,
  hackathon_id,
  participant_id,
  team_id,
  (ARRAY[
    'Compass', 'Bridge', 'Lantern', 'Pulse', 'Garden', 'Scout', 'Harbour', 'Patchwork',
    'Beacon', 'Atlas', 'Bloom', 'Relay', 'Mosaic', 'Nest', 'Trailhead', 'Telescope'
  ])[1 + ((project_number + theme_index - 2) % 16)] || ' for ' ||
  (ARRAY[
    'Agents', 'Clean Energy', 'Healthy Lives', 'Local Commerce', 'Learning', 'Access',
    'Robotics', 'Space', 'Communities', 'Creators', 'Food Systems', 'Safer Software',
    'Play', 'Open Source'
  ])[theme_index],
  format(
    '%s built a practical prototype for %s. The team interviewed users, tested the main task on phones and laptops, added a clear empty state, and wrote down what still needs work. The demo includes sample data only, a two-minute guided tour, and a public build log.',
    owner_name,
    theme_focus
  ),
  format('https://github.com/hackathon-showcase/%s-project-%s', theme_slug, lpad(project_number::text, 2, '0')),
  format('https://%s-%s.demo.example.com', theme_slug, lpad(project_number::text, 2, '0')),
  format('https://video.example.com/watch/%s-%s', theme_slug, lpad(project_number::text, 2, '0')),
  'https://images.unsplash.com/photo-' ||
    (ARRAY[
      '1518770660439-4636190af475', '1488590528505-98d2b5aba04b', '1498050108023-c5249f4df085',
      '1461749280684-dccba630e2f6', '1516321318423-f06f85e504b3', '1451187580459-43490279c0fa',
      '1550751827-4bd374c3f58b', '1535223289827-42f1e9919769', '1563013544-824ae1b704d3',
      '1576091160399-112ba8d25d1d', '1532094349884-543bc11b234d', '1508514177221-188b1cf16e9d',
      '1473341304170-971dccb5ac1e', '1446776811953-b23d57bd21aa', '1454789548928-9efd52dc4031',
      '1527430253228-e93688616381', '1485827404703-89b55fcc595e', '1531746790731-6c087fecd65a',
      '1555949963-aa79dcee981c', '1677442136019-21780ecad995'
    ])[1 + ((project_number * 3 + theme_index + lifecycle_index - 5) % 20)] ||
    '?auto=format&fit=crop&w=1400&h=900&q=82',
  CASE target_status
    WHEN 'active' THEN CASE WHEN project_number % 3 = 0 THEN 'draft'::submission_status ELSE 'submitted'::submission_status END
    WHEN 'judging' THEN 'submitted'::submission_status
    WHEN 'completed' THEN CASE WHEN project_number <= 3 THEN 'winner'::submission_status WHEN project_number % 5 = 0 THEN 'rejected'::submission_status ELSE 'accepted'::submission_status END
    ELSE CASE WHEN project_number <= 3 THEN 'winner'::submission_status WHEN project_number % 4 = 0 THEN 'rejected'::submission_status ELSE 'accepted'::submission_status END
  END,
  jsonb_build_object(
    'seed', jsonb_build_object(
      'collection', 'rich-lifecycle-showcase',
      'project_number', project_number,
      'owner_type', CASE WHEN team_id IS NULL THEN 'solo' ELSE 'team' END,
      'theme', theme_slug,
      'lifecycle', target_status
    ),
    'demo', jsonb_build_object(
      'tested_with_people', 3 + (project_number % 14),
      'mobile_ready', project_number % 2 = 0,
      'captions', true,
      'sample_data_only', true,
      'demo_length_minutes', 2 + (project_number % 4)
    ),
    'build', jsonb_build_object(
      'stack', (ARRAY['Next.js + Supabase', 'Python + FastAPI', 'React Native', 'SvelteKit', 'Arduino + Web'])[1 + ((project_number + theme_index) % 5)],
      'license', (ARRAY['MIT', 'Apache-2.0', 'MPL-2.0'])[1 + ((project_number + theme_index) % 3)],
      'lessons', jsonb_build_array('Start with one user task', 'Test early', 'Keep the demo simple')
    )
  ),
  now() - make_interval(days => greatest(1, 20 - lifecycle_index + (project_number::int % 6))),
  now() - make_interval(hours => project_number::int % 36)
FROM numbered_projects
ON CONFLICT (id) DO NOTHING;
