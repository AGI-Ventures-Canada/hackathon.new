-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - EVENTS
-- 14 event themes x 7 lifecycle stages = 98 detailed events.
--
-- These events are inserted as drafts so related judging data can be built
-- without lifecycle mutation locks. 27_rich_lifecycle_finalize.sql applies the
-- target status only after every related record exists.
-- Depends on: tenants
-- ============================================================================

WITH themes(theme_index, slug, name, focus, city, country, location_name, banner_photo, community_label) AS (
  VALUES
    (1, 'ai-agents', 'AI Agents Forge', 'helpful agents that plan, reason, and take action', 'Toronto', 'Canada', 'MaRS Discovery District', '1518770660439-4636190af475', 'Agent Builders'),
    (2, 'climate-energy', 'Climate & Clean Energy Lab', 'clean power, resilient cities, and measurable climate action', 'Vancouver', 'Canada', 'Vancouver Convention Centre', '1473341304170-971dccb5ac1e', 'Climate Builders'),
    (3, 'health-wellness', 'Health & Wellness Build', 'safer care, prevention, accessibility, and healthy daily habits', 'Boston', 'United States', 'District Hall Boston', '1576091160399-112ba8d25d1d', 'Health Makers'),
    (4, 'fintech-commerce', 'Fintech & Commerce Sprint', 'fairer payments, small-business tools, and financial confidence', 'New York', 'United States', 'Brooklyn Navy Yard', '1555949963-aa79dcee981c', 'Commerce Creators'),
    (5, 'education', 'Learning Futures Jam', 'personal learning, teacher support, and open education', 'Montreal', 'Canada', 'Notman House', '1509062522246-3755977927d7', 'Learning Lab'),
    (6, 'accessibility', 'Access for Everyone', 'products that work for people with different bodies, senses, and minds', 'Chicago', 'United States', 'mHUB Chicago', '1550751827-4bd374c3f58b', 'Access Makers'),
    (7, 'robotics', 'Robotics & Industry Works', 'robots, safer factories, and practical automation', 'Detroit', 'United States', 'Michigan Central', '1485827404703-89b55fcc595e', 'Robot Builders'),
    (8, 'space', 'Space & Aerospace Mission', 'earth observation, flight, exploration, and space operations', 'Houston', 'United States', 'Space Center Houston', '1446776811953-b23d57bd21aa', 'Mission Control'),
    (9, 'civic-community', 'Civic & Community Challenge', 'trusted public services and stronger local communities', 'Ottawa', 'Canada', 'Bayview Yards', '1532094349884-543bc11b234d', 'Community Builders'),
    (10, 'creative-media', 'Creative Media Studio', 'new ways to make, share, and experience stories', 'Los Angeles', 'United States', 'The Reef', '1527430253228-e93688616381', 'Creative Studio'),
    (11, 'food-agriculture', 'Food & Agriculture Field Lab', 'better farms, less waste, and healthier food systems', 'Calgary', 'Canada', 'Platform Calgary', '1508514177221-188b1cf16e9d', 'Food Systems Lab'),
    (12, 'cybersecurity', 'Cybersecurity & Privacy Defense', 'safer software, usable privacy, and resilient infrastructure', 'Washington', 'United States', 'Capital Factory DC', '1563013544-824ae1b704d3', 'Security Guild'),
    (13, 'gaming-xr', 'Games & Immersive Worlds', 'playful games, social worlds, and useful immersive tools', 'Seattle', 'United States', 'Seattle Convention Center', '1535223289827-42f1e9919769', 'World Builders'),
    (14, 'open-source', 'Open Source Builders Week', 'developer tools and public software that anyone can improve', 'San Francisco', 'United States', 'GitHub HQ', '1498050108023-c5249f4df085', 'Open Builders')
),
lifecycles(stage_index, status, label, people_count) AS (
  VALUES
    (1, 'draft'::hackathon_status, 'Planning Draft', 4),
    (2, 'published'::hackathon_status, 'Save the Date', 12),
    (3, 'registration_open'::hackathon_status, 'Registration Open', 24),
    (4, 'active'::hackathon_status, 'Build Weekend Live', 40),
    (5, 'judging'::hackathon_status, 'Judging in Progress', 48),
    (6, 'completed'::hackathon_status, 'Results Published', 52),
    (7, 'archived'::hackathon_status, 'Alumni Archive', 36)
),
event_rows AS (
  SELECT
    md5('rich-event-' || themes.slug || '-' || lifecycles.status::text)::uuid AS id,
    (ARRAY[
      '12345678-1234-1234-1234-123456789012'::uuid,
      '99990000-9999-9999-9999-999900009999'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '11111111-1111-1111-1111-111111111111'::uuid
    ])[1 + ((themes.theme_index - 1) % 4)] AS tenant_id,
    themes.name || ': ' || lifecycles.label AS name,
    'showcase-' || themes.slug || '-' || replace(lifecycles.status::text, '_', '-') AS slug,
    themes,
    lifecycles,
    CASE lifecycles.stage_index
      WHEN 1 THEN now() + interval '90 days'
      WHEN 2 THEN now() + interval '60 days'
      WHEN 3 THEN now() + interval '30 days'
      WHEN 4 THEN now() - interval '1 day'
      WHEN 5 THEN now() - interval '5 days'
      WHEN 6 THEN now() - interval '30 days'
      ELSE now() - interval '180 days'
    END AS starts_at
  FROM themes
  CROSS JOIN lifecycles
)
INSERT INTO hackathons (
  id,
  tenant_id,
  name,
  slug,
  description,
  rules,
  starts_at,
  ends_at,
  registration_opens_at,
  registration_closes_at,
  allow_late_registration,
  status,
  phase,
  banner_url,
  min_team_size,
  max_team_size,
  max_participants,
  allow_solo,
  require_team_approval,
  require_terms_acceptance,
  terms_content,
  judging_mode,
  anonymous_judging,
  auto_assign_by_room,
  location_type,
  location_name,
  location_url,
  location_latitude,
  location_longitude,
  community_label,
  community_url,
  feedback_survey_url,
  default_locale,
  translations,
  metadata,
  created_at,
  updated_at
)
SELECT
  id,
  tenant_id,
  name,
  slug,
  format(
    E'%s is a detailed showcase event for %s.\n\n## What you will do\n\n- Meet teammates and mentors\n- Pick a clear problem\n- Build and test a working project\n- Share a short demo with judges\n\n## Who should join\n\nStudents, designers, engineers, researchers, founders, and first-time builders are welcome. Every event includes quiet work areas, beginner help, remote access, and clear team rules.',
    name,
    (themes).focus
  ),
  E'1. Be kind and make space for others.\n2. Teams may have one to five people.\n3. New work must be made during the event.\n4. Open-source tools and prior learning are welcome.\n5. Tell judges what you built, what changed, and what you learned.\n6. Do not use private data without permission.\n7. Organizers may remove unsafe or copied work.',
  starts_at,
  starts_at + CASE WHEN (themes).theme_index % 4 = 0 THEN interval '3 days' ELSE interval '2 days' END,
  CASE (lifecycles).stage_index
    WHEN 1 THEN starts_at - interval '45 days'
    WHEN 2 THEN starts_at - interval '20 days'
    ELSE starts_at - interval '40 days'
  END,
  starts_at - interval '1 day',
  (themes).theme_index % 3 = 0,
  'draft'::hackathon_status,
  CASE (lifecycles).status::text
    WHEN 'active' THEN 'build'::hackathon_phase
    WHEN 'judging' THEN 'finals'::hackathon_phase
    WHEN 'completed' THEN 'results_pending'::hackathon_phase
    WHEN 'archived' THEN 'results_pending'::hackathon_phase
    ELSE NULL
  END,
  'https://images.unsplash.com/photo-' || (themes).banner_photo || '?auto=format&fit=crop&w=1800&q=85',
  CASE WHEN (themes).theme_index % 4 = 0 THEN 2 ELSE 1 END,
  5,
  (lifecycles).people_count + 24,
  (themes).theme_index % 4 <> 0,
  (themes).theme_index % 3 = 0,
  (themes).theme_index % 2 = 0,
  CASE WHEN (themes).theme_index % 2 = 0
    THEN E'By joining, you agree to the code of conduct, photo notice, project sharing rules, and event safety policy. Ask an organizer if you need an accommodation or a private demo.'
    ELSE NULL
  END,
  (ARRAY['points'::judging_mode, 'rubric'::judging_mode, 'subjective'::judging_mode])[1 + ((themes).theme_index - 1) % 3],
  (themes).theme_index % 2 = 1,
  (themes).theme_index % 3 = 1,
  (ARRAY['in_person'::location_type, 'virtual'::location_type, 'hybrid'::location_type])[1 + ((themes).theme_index - 1) % 3],
  CASE WHEN (themes).theme_index % 3 = 2 THEN 'Online — worldwide' ELSE (themes).location_name || ', ' || (themes).city END,
  CASE WHEN (themes).theme_index % 3 IN (1, 2) THEN 'https://meet.example.com/' || (themes).slug ELSE NULL END,
  CASE WHEN (themes).theme_index % 3 = 2 THEN NULL ELSE 43.6532 + ((themes).theme_index::numeric / 100) END,
  CASE WHEN (themes).theme_index % 3 = 2 THEN NULL ELSE -79.3832 - ((themes).theme_index::numeric / 100) END,
  (themes).community_label,
  'https://community.example.com/' || (themes).slug,
  'https://forms.example.com/' || (themes).slug || '-feedback',
  CASE WHEN (themes).theme_index IN (5, 9) THEN 'fr' ELSE 'en' END,
  jsonb_build_object(
    'fr', jsonb_build_object(
      'name', (themes).name || ' — vitrine',
      'description', 'Un evenement accueillant pour apprendre, construire et partager.'
    )
  ),
  jsonb_build_object(
    'seed', jsonb_build_object(
      'collection', 'rich-lifecycle-showcase',
      'theme_index', (themes).theme_index,
      'theme_slug', (themes).slug,
      'theme_focus', (themes).focus,
      'lifecycle_index', (lifecycles).stage_index,
      'target_status', (lifecycles).status::text,
      'expected_people', (lifecycles).people_count,
      'expected_attendees', greatest((lifecycles).people_count - 6, 0),
      'format', CASE (themes).theme_index % 3 WHEN 1 THEN 'in_person' WHEN 2 THEN 'virtual' ELSE 'hybrid' END,
      'city', (themes).city,
      'country', (themes).country,
      'size', CASE WHEN (lifecycles).people_count < 20 THEN 'small' WHEN (lifecycles).people_count < 45 THEN 'medium' ELSE 'large' END,
      'image_credit', 'Unsplash demo imagery',
      'purpose', 'Local development, lifecycle QA, visual demos, and organizer training'
    ),
    'accessibility', jsonb_build_object(
      'captions', true,
      'quiet_room', (themes).theme_index % 3 <> 2,
      'step_free_access', true,
      'dietary_options', jsonb_build_array('vegetarian', 'vegan', 'gluten-free')
    )
  ),
  now() - make_interval(days => 220 - ((lifecycles).stage_index * 20)),
  now()
FROM event_rows
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  rules = EXCLUDED.rules,
  banner_url = EXCLUDED.banner_url,
  metadata = EXCLUDED.metadata,
  updated_at = now();
