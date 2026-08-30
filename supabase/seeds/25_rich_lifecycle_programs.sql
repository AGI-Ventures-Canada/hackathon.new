-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - PROGRAMS AND ORGANIZER CONTENT
-- Adds schedules, announcements, challenges, prizes, perks, and social posts.
-- Depends on: 23_rich_lifecycle_sponsors.sql, 24_rich_lifecycle_projects.sql
-- ============================================================================

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.starts_at,
    h.ends_at,
    h.location_name,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
schedule_rows AS (
  SELECT rich_events.*, item_number
  FROM rich_events
  CROSS JOIN generate_series(1, 6) AS item_number
)
INSERT INTO hackathon_schedule_items (
  id,
  hackathon_id,
  title,
  description,
  starts_at,
  ends_at,
  location,
  sort_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-schedule-' || theme_slug || '-' || target_status || '-' || item_number)::uuid,
  hackathon_id,
  (ARRAY[
    'Doors open and friendly check-in',
    'Welcome, safety notes, and challenge tour',
    'Team matching and idea clinic',
    'Mentor office hours and build check',
    'Project hand-in and demo practice',
    'Demos, judging, prizes, and community photo'
  ])[item_number],
  (ARRAY[
    'Pick up your badge, confirm your team, share access needs, and meet the help desk.',
    'Hear the short event plan, where to get help, how judging works, and what to do in an emergency.',
    'Meet people by skill and interest. Organizers help solo attendees find a good next step.',
    'Book a fifteen-minute mentor visit. Bring one clear question and show what you have tried.',
    'Check every link, add captions, confirm team members, and submit before the deadline.',
    'Each team gets a short demo. Judges leave useful notes, then everyone celebrates the work.'
  ])[item_number],
  starts_at + (ARRAY[
    interval '0 hours', interval '1 hour', interval '2 hours',
    interval '8 hours', interval '30 hours', interval '34 hours'
  ])[item_number],
  starts_at + (ARRAY[
    interval '1 hour', interval '2 hours', interval '3 hours',
    interval '10 hours', interval '32 hours', interval '36 hours'
  ])[item_number],
  CASE WHEN theme_index % 3 = 2 THEN 'Online main stage' ELSE coalesce(location_name, 'Main hall') END,
  item_number - 1,
  now() - interval '45 days',
  now()
FROM schedule_rows
ON CONFLICT (id) DO NOTHING;

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 2
),
announcement_rows AS (
  SELECT rich_events.*, announcement_number
  FROM rich_events
  CROSS JOIN generate_series(1, 3) AS announcement_number
)
INSERT INTO hackathon_announcements (
  id,
  hackathon_id,
  title,
  body,
  priority,
  audience,
  published_at,
  created_at,
  updated_at
)
SELECT
  md5('rich-announcement-' || theme_slug || '-' || target_status || '-' || announcement_number)::uuid,
  hackathon_id,
  (ARRAY['Your event guide is ready', 'What to do before project hand-in', 'Demos, results, and what comes next'])[announcement_number],
  (ARRAY[
    'Save the schedule, join the community space, and reply to the organizer if you need an accommodation. Bring a charger and one goal for the weekend.',
    'Open your project page early. Add working links, captions, a short problem statement, and every teammate. Ask the help desk before the deadline if anything is stuck.',
    'Thank you for building with care. Demo notes will stay on your project page. Winners get a separate email, and every attendee gets the feedback survey.'
  ])[announcement_number],
  CASE WHEN announcement_number = 2 AND lifecycle_index >= 4 THEN 'urgent' ELSE 'normal' END,
  (ARRAY['everyone', 'not_submitted', 'attendees'])[announcement_number],
  CASE WHEN lifecycle_index = 2 THEN NULL ELSE now() - make_interval(days => greatest(1, 10 - lifecycle_index - announcement_number)) END,
  now() - interval '14 days',
  now()
FROM announcement_rows
ON CONFLICT (id) DO NOTHING;

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'theme_focus' AS theme_focus,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
challenge_rows AS (
  SELECT rich_events.*, challenge_number
  FROM rich_events
  CROSS JOIN generate_series(1, 2) AS challenge_number
)
INSERT INTO challenges (
  id,
  hackathon_id,
  title,
  description,
  resources,
  sort_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-challenge-' || theme_slug || '-' || target_status || '-' || challenge_number)::uuid,
  hackathon_id,
  CASE challenge_number WHEN 1 THEN 'Make the first step easier' ELSE 'Show a result people can trust' END,
  CASE challenge_number
    WHEN 1 THEN 'Build one clear path that helps a new person begin without training. Test it with someone outside your team and improve the hardest step.'
    ELSE 'Help people understand where an answer came from, what might be wrong, and what they can do next. Use safe sample data in the demo.'
  END,
  jsonb_build_array(
    jsonb_build_object('label', 'Starter kit', 'url', 'https://docs.example.com/' || theme_slug || '/starter'),
    jsonb_build_object('label', 'Sample data', 'url', 'https://data.example.com/' || theme_slug || '/sample'),
    jsonb_build_object('label', 'User test guide', 'url', 'https://docs.example.com/community-testing')
  ),
  challenge_number - 1,
  now() - interval '35 days',
  now()
FROM challenge_rows
ON CONFLICT (id) DO NOTHING;

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
prize_rows AS (
  SELECT rich_events.*, prize_number
  FROM rich_events
  CROSS JOIN generate_series(1, 3) AS prize_number
)
INSERT INTO prizes (
  id,
  hackathon_id,
  name,
  description,
  value,
  display_value,
  monetary_value,
  currency,
  kind,
  type,
  rank,
  display_order,
  assignment_mode,
  distribution_method,
  judging_style,
  max_picks,
  is_screening,
  created_at,
  updated_at
)
SELECT
  md5('rich-prize-' || theme_slug || '-' || target_status || '-' || prize_number)::uuid,
  hackathon_id,
  (ARRAY['Best Overall Project', 'Best Real-World Impact', 'Community Choice'])[prize_number],
  (ARRAY[
    'For the strongest mix of a clear problem, thoughtful design, working build, and useful demo.',
    'For the project most likely to help real people, with a practical next step after the event.',
    'Picked by attendees for a project that was easy to understand, welcoming, and memorable.'
  ])[prize_number],
  CASE prize_number WHEN 1 THEN '$5,000 plus mentor support' WHEN 2 THEN '$2,500 plus pilot introductions' ELSE '$1,000 community award' END,
  CASE prize_number WHEN 1 THEN '$5,000' WHEN 2 THEN '$2,500' ELSE '$1,000' END,
  CASE prize_number WHEN 1 THEN 5000 WHEN 2 THEN 2500 ELSE 1000 END,
  'USD',
  CASE prize_number WHEN 3 THEN 'crowd' ELSE 'score' END,
  CASE prize_number WHEN 3 THEN 'crowd'::prize_type ELSE 'score'::prize_type END,
  prize_number,
  prize_number - 1,
  CASE prize_number WHEN 3 THEN 'self_select' ELSE 'organizer_assigned' END,
  CASE prize_number WHEN 3 THEN 'single' ELSE 'ranked' END,
  CASE prize_number WHEN 3 THEN 'crowd_vote' ELSE 'weighted_score' END,
  1,
  false,
  now() - interval '40 days',
  now()
FROM prize_rows
ON CONFLICT (id) DO NOTHING;

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.starts_at,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 2
),
perk_rows AS (
  SELECT rich_events.*, perk_number, sponsor.id AS sponsor_id
  FROM rich_events
  CROSS JOIN generate_series(1, 2) AS perk_number
  JOIN LATERAL (
    SELECT id
    FROM hackathon_sponsors
    WHERE hackathon_id = rich_events.hackathon_id
    ORDER BY display_order
    OFFSET (perk_number - 1)
    LIMIT 1
  ) sponsor ON true
)
INSERT INTO hackathon_perks (
  id,
  hackathon_id,
  sponsor_id,
  name,
  description,
  type,
  code,
  redemption_url,
  instructions,
  scheduled_release_at,
  released_at,
  sort_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-perk-' || theme_slug || '-' || target_status || '-' || perk_number)::uuid,
  hackathon_id,
  sponsor_id,
  CASE perk_number WHEN 1 THEN 'Builder API credits' ELSE 'Team meal and supply credit' END,
  CASE perk_number
    WHEN 1 THEN 'A safe demo account with enough credit to build and test during the event.'
    ELSE 'A small credit for team food, accessibility supplies, or a missing build part.'
  END,
  CASE perk_number WHEN 1 THEN 'credit' ELSE 'coupon' END,
  upper(substr(md5('rich-perk-code-' || theme_slug || '-' || target_status || '-' || perk_number), 1, 12)),
  'https://perks.example.com/redeem/' || theme_slug || '/' || perk_number,
  CASE perk_number
    WHEN 1 THEN 'Sign in with the same email used for the event. Do not put the key in a public repository.'
    ELSE 'One claim per team. Keep the receipt and ask the help desk if the code does not work.'
  END,
  starts_at - interval '2 days',
  CASE WHEN lifecycle_index >= 4 THEN starts_at - interval '2 days' ELSE NULL END,
  perk_number - 1,
  now() - interval '30 days',
  now()
FROM perk_rows
ON CONFLICT (id) DO NOTHING;

WITH eligible_people AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    p.id AS participant_id,
    p.team_id,
    row_number() OVER (PARTITION BY h.id ORDER BY p.clerk_user_id) AS post_number
  FROM hackathons h
  JOIN hackathon_participants p ON p.hackathon_id = h.id AND p.role = 'participant'
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 4
),
social_rows AS (
  SELECT * FROM eligible_people WHERE post_number <= 2
)
INSERT INTO social_media_submissions (
  id,
  hackathon_id,
  participant_id,
  team_id,
  url,
  platform,
  og_title,
  og_description,
  og_image_url,
  status,
  reviewed_at,
  created_at
)
SELECT
  md5('rich-social-' || theme_slug || '-' || target_status || '-' || post_number)::uuid,
  hackathon_id,
  participant_id,
  team_id,
  format('https://social.example.com/%s/%s/%s', theme_slug, target_status, post_number),
  CASE post_number WHEN 1 THEN 'LinkedIn' ELSE 'X' END,
  CASE post_number WHEN 1 THEN 'What our team learned while building' ELSE 'A quick look at our working demo' END,
  'A friendly public update with the problem, one build lesson, a captioned demo image, and thanks to teammates and mentors.',
  'https://images.unsplash.com/photo-' ||
    (ARRAY[
      '1516321318423-f06f85e504b3', '1454789548928-9efd52dc4031', '1531746790731-6c087fecd65a',
      '1485827404703-89b55fcc595e', '1677442136019-21780ecad995', '1508514177221-188b1cf16e9d'
    ])[1 + ((lifecycle_index + post_number - 1) % 6)] ||
    '?auto=format&fit=crop&w=1200&h=630&q=80',
  CASE WHEN lifecycle_index = 4 THEN 'pending' WHEN post_number = 2 AND lifecycle_index = 5 THEN 'rejected' ELSE 'approved' END,
  CASE WHEN lifecycle_index = 4 THEN NULL ELSE now() - interval '1 day' END,
  now() - interval '3 days'
FROM social_rows
ON CONFLICT (id) DO NOTHING;
