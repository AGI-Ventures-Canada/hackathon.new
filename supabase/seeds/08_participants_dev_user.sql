-- ============================================================================
-- HACKATHON REGISTRATIONS - DEV USER
-- Your local dev user registered for sample hackathons
-- Depends on: hackathons
-- ============================================================================

INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_demo_primary_0001', 'participant', now()),
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_demo_primary_0001', 'participant', now()),
  ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_demo_primary_0001', 'participant', now()),
  ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d5d5', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_demo_primary_0001', 'participant', now()),
  ('d6d6d6d6-d6d6-d6d6-d6d6-d6d6d6d6d6d6', 'aa11aa11-aa11-aa11-aa11-aa11aa11aa11', 'user_demo_primary_0001', 'participant', now() - interval '20 days'),
  ('d7d7d7d7-d7d7-d7d7-d7d7-d7d7d7d7d7d7', 'bb22bb22-bb22-bb22-bb22-bb22bb22bb22', 'user_demo_primary_0001', 'participant', now() - interval '2 days'),
  ('d8d8d8d8-d8d8-d8d8-d8d8-d8d8d8d8d8d8', 'cc33cc33-cc33-cc33-cc33-cc33cc33cc33', 'user_demo_primary_0001', 'participant', now() - interval '1 day'),
  ('d9d9d9d9-d9d9-d9d9-d9d9-d9d9d9d9d9d9', 'dd44dd44-dd44-dd44-dd44-dd44dd44dd44', 'user_demo_primary_0001', 'participant', now()),
  ('dadadada-dada-dada-dada-dadadadadada', 'ee55ee55-ee55-ee55-ee55-ee55ee55ee55', 'user_demo_primary_0001', 'participant', now() - interval '35 days'),
  ('dbdbdbdb-dbdb-dbdb-dbdb-dbdbdbdbdbdb', 'ff66ff66-ff66-ff66-ff66-ff66ff66ff66', 'user_demo_primary_0001', 'participant', now() - interval '3 days'),
  ('dcdcdcdc-dcdc-dcdc-dcdc-dcdcdcdcdcdc', 'aa77aa77-aa77-aa77-aa77-aa77aa77aa77', 'user_demo_primary_0001', 'participant', now()),
  ('ddddeeee-ddee-ddee-ddee-ddddeeeeddee', 'bb88bb88-bb88-bb88-bb88-bb88bb88bb88', 'user_demo_primary_0001', 'participant', now()),
  ('a9d90001-a9d9-a9d9-a9d9-a9d90001a9d9', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_demo_primary_0001', 'participant', now() - interval '30 days'),
  ('a9d90002-a9d9-a9d9-a9d9-a9d90002a9d9', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_demo_primary_0001', 'participant', now() - interval '50 days'),
  ('a9d90003-a9d9-a9d9-a9d9-a9d90003a9d9', 'aaa40004-aaa4-aaa4-aaa4-aaa40004aaa4', 'user_demo_primary_0001', 'participant', now() - interval '3 days'),
  ('a9d90004-a9d9-a9d9-a9d9-a9d90004a9d9', 'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5', 'user_demo_primary_0001', 'participant', now())
ON CONFLICT (id) DO NOTHING;
