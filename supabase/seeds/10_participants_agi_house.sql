-- ============================================================================
-- AGI HOUSE HACKATHON PARTICIPANTS
-- Depends on: hackathons
-- ============================================================================

-- MCP Agents Hackathon (completed) — 20 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('a9e00001-a9e0-a9e0-a9e0-a9e00001a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_071', 'participant', now() - interval '38 days'),
  ('a9e00002-a9e0-a9e0-a9e0-a9e00002a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_072', 'participant', now() - interval '37 days'),
  ('a9e00003-a9e0-a9e0-a9e0-a9e00003a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_073', 'participant', now() - interval '37 days'),
  ('a9e00004-a9e0-a9e0-a9e0-a9e00004a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_074', 'participant', now() - interval '36 days'),
  ('a9e00005-a9e0-a9e0-a9e0-a9e00005a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_075', 'participant', now() - interval '36 days'),
  ('a9e00006-a9e0-a9e0-a9e0-a9e00006a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_076', 'participant', now() - interval '35 days'),
  ('a9e00007-a9e0-a9e0-a9e0-a9e00007a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_077', 'participant', now() - interval '35 days'),
  ('a9e00008-a9e0-a9e0-a9e0-a9e00008a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_078', 'participant', now() - interval '34 days'),
  ('a9e00009-a9e0-a9e0-a9e0-a9e00009a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_079', 'participant', now() - interval '34 days'),
  ('a9e0000a-a9e0-a9e0-a9e0-a9e0000aa9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_080', 'participant', now() - interval '33 days'),
  ('a9e0000b-a9e0-a9e0-a9e0-a9e0000ba9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_081', 'participant', now() - interval '33 days'),
  ('a9e0000c-a9e0-a9e0-a9e0-a9e0000ca9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_082', 'participant', now() - interval '32 days'),
  ('a9e0000d-a9e0-a9e0-a9e0-a9e0000da9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_083', 'participant', now() - interval '32 days'),
  ('a9e0000e-a9e0-a9e0-a9e0-a9e0000ea9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_084', 'participant', now() - interval '31 days'),
  ('a9e0000f-a9e0-a9e0-a9e0-a9e0000fa9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_085', 'participant', now() - interval '31 days'),
  ('a9e00010-a9e0-a9e0-a9e0-a9e00010a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_086', 'participant', now() - interval '30 days'),
  ('a9e00011-a9e0-a9e0-a9e0-a9e00011a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_087', 'participant', now() - interval '30 days'),
  ('a9e00012-a9e0-a9e0-a9e0-a9e00012a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_088', 'participant', now() - interval '29 days'),
  ('a9e00013-a9e0-a9e0-a9e0-a9e00013a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_089', 'participant', now() - interval '28 days'),
  ('a9e00014-a9e0-a9e0-a9e0-a9e00014a9e0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'user_seed_090', 'participant', now() - interval '27 days')
ON CONFLICT (id) DO NOTHING;

-- GenAI Goes Local (completed) — 15 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('a9e00015-a9e0-a9e0-a9e0-a9e00015a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_091', 'participant', now() - interval '58 days'),
  ('a9e00016-a9e0-a9e0-a9e0-a9e00016a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_092', 'participant', now() - interval '57 days'),
  ('a9e00017-a9e0-a9e0-a9e0-a9e00017a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_093', 'participant', now() - interval '57 days'),
  ('a9e00018-a9e0-a9e0-a9e0-a9e00018a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_094', 'participant', now() - interval '56 days'),
  ('a9e00019-a9e0-a9e0-a9e0-a9e00019a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_095', 'participant', now() - interval '56 days'),
  ('a9e0001a-a9e0-a9e0-a9e0-a9e0001aa9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_096', 'participant', now() - interval '55 days'),
  ('a9e0001b-a9e0-a9e0-a9e0-a9e0001ba9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_097', 'participant', now() - interval '55 days'),
  ('a9e0001c-a9e0-a9e0-a9e0-a9e0001ca9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_098', 'participant', now() - interval '54 days'),
  ('a9e0001d-a9e0-a9e0-a9e0-a9e0001da9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_099', 'participant', now() - interval '54 days'),
  ('a9e0001e-a9e0-a9e0-a9e0-a9e0001ea9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_100', 'participant', now() - interval '53 days'),
  ('a9e0001f-a9e0-a9e0-a9e0-a9e0001fa9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_101', 'participant', now() - interval '52 days'),
  ('a9e00020-a9e0-a9e0-a9e0-a9e00020a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_102', 'participant', now() - interval '52 days'),
  ('a9e00021-a9e0-a9e0-a9e0-a9e00021a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_103', 'participant', now() - interval '51 days'),
  ('a9e00022-a9e0-a9e0-a9e0-a9e00022a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_104', 'participant', now() - interval '51 days'),
  ('a9e00023-a9e0-a9e0-a9e0-a9e00023a9e0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'user_seed_105', 'participant', now() - interval '50 days')
ON CONFLICT (id) DO NOTHING;

-- Generative UI Hackathon (completed) — 18 participants + dev user
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('a9e00024-a9e0-a9e0-a9e0-a9e00024a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_demo_primary_0001', 'participant', now() - interval '75 days'),
  ('a9e00025-a9e0-a9e0-a9e0-a9e00025a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_106', 'participant', now() - interval '78 days'),
  ('a9e00026-a9e0-a9e0-a9e0-a9e00026a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_107', 'participant', now() - interval '77 days'),
  ('a9e00027-a9e0-a9e0-a9e0-a9e00027a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_108', 'participant', now() - interval '77 days'),
  ('a9e00028-a9e0-a9e0-a9e0-a9e00028a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_109', 'participant', now() - interval '76 days'),
  ('a9e00029-a9e0-a9e0-a9e0-a9e00029a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_110', 'participant', now() - interval '76 days'),
  ('a9e0002a-a9e0-a9e0-a9e0-a9e0002aa9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_111', 'participant', now() - interval '75 days'),
  ('a9e0002b-a9e0-a9e0-a9e0-a9e0002ba9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_112', 'participant', now() - interval '75 days'),
  ('a9e0002c-a9e0-a9e0-a9e0-a9e0002ca9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_113', 'participant', now() - interval '74 days'),
  ('a9e0002d-a9e0-a9e0-a9e0-a9e0002da9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_114', 'participant', now() - interval '74 days'),
  ('a9e0002e-a9e0-a9e0-a9e0-a9e0002ea9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_115', 'participant', now() - interval '73 days'),
  ('a9e0002f-a9e0-a9e0-a9e0-a9e0002fa9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_116', 'participant', now() - interval '73 days'),
  ('a9e00030-a9e0-a9e0-a9e0-a9e00030a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_117', 'participant', now() - interval '72 days'),
  ('a9e00031-a9e0-a9e0-a9e0-a9e00031a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_118', 'participant', now() - interval '72 days'),
  ('a9e00032-a9e0-a9e0-a9e0-a9e00032a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_119', 'participant', now() - interval '71 days'),
  ('a9e00033-a9e0-a9e0-a9e0-a9e00033a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_120', 'participant', now() - interval '71 days'),
  ('a9e00034-a9e0-a9e0-a9e0-a9e00034a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_121', 'participant', now() - interval '70 days'),
  ('a9e00035-a9e0-a9e0-a9e0-a9e00035a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_122', 'participant', now() - interval '70 days'),
  ('a9e00036-a9e0-a9e0-a9e0-a9e00036a9e0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'user_seed_123', 'participant', now() - interval '69 days')
ON CONFLICT (id) DO NOTHING;
