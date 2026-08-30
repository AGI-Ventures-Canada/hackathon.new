-- ============================================================================
-- SEED PARTICIPANTS (Fake users across hackathons)
-- Depends on: hackathons
-- ============================================================================

-- AI Agents 2026 (completed) — 25 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10011001-1001-1001-1001-100110011001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_001', 'participant', now() - interval '40 days'),
  ('10021002-1002-1002-1002-100210021002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_002', 'participant', now() - interval '39 days'),
  ('10031003-1003-1003-1003-100310031003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_003', 'participant', now() - interval '38 days'),
  ('10041004-1004-1004-1004-100410041004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_004', 'participant', now() - interval '37 days'),
  ('10051005-1005-1005-1005-100510051005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_005', 'participant', now() - interval '36 days'),
  ('10061006-1006-1006-1006-100610061006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_006', 'participant', now() - interval '35 days'),
  ('10071007-1007-1007-1007-100710071007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_007', 'participant', now() - interval '34 days'),
  ('10081008-1008-1008-1008-100810081008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_008', 'participant', now() - interval '33 days'),
  ('10091009-1009-1009-1009-100910091009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_009', 'participant', now() - interval '32 days'),
  ('100a100a-100a-100a-100a-100a100a100a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_010', 'participant', now() - interval '31 days'),
  ('100b100b-100b-100b-100b-100b100b100b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_011', 'participant', now() - interval '30 days'),
  ('100c100c-100c-100c-100c-100c100c100c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_012', 'participant', now() - interval '30 days'),
  ('100d100d-100d-100d-100d-100d100d100d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_013', 'participant', now() - interval '29 days'),
  ('100e100e-100e-100e-100e-100e100e100e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_014', 'participant', now() - interval '28 days'),
  ('100f100f-100f-100f-100f-100f100f100f', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_015', 'participant', now() - interval '27 days'),
  ('10101010-1010-1010-1010-101010101010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_016', 'participant', now() - interval '26 days'),
  ('10111011-1011-1011-1011-101110111011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_017', 'participant', now() - interval '25 days'),
  ('10121012-1012-1012-1012-101210121012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_018', 'participant', now() - interval '25 days'),
  ('10131013-1013-1013-1013-101310131013', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_019', 'participant', now() - interval '24 days'),
  ('10141014-1014-1014-1014-101410141014', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_020', 'participant', now() - interval '23 days'),
  ('10151015-1015-1015-1015-101510151015', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_021', 'participant', now() - interval '22 days'),
  ('10161016-1016-1016-1016-101610161016', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_022', 'participant', now() - interval '21 days'),
  ('10171017-1017-1017-1017-101710171017', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_023', 'participant', now() - interval '20 days'),
  ('10181018-1018-1018-1018-101810181018', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_024', 'participant', now() - interval '19 days'),
  ('10191019-1019-1019-1019-101910191019', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_025', 'participant', now() - interval '18 days')
ON CONFLICT (id) DO NOTHING;

-- Search & Discovery (completed) — 15 participants (some cross-participate)
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('101a101a-101a-101a-101a-101a101a101a', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_001', 'participant', now() - interval '48 days'),
  ('101b101b-101b-101b-101b-101b101b101b', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_003', 'participant', now() - interval '47 days'),
  ('101c101c-101c-101c-101c-101c101c101c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_005', 'participant', now() - interval '46 days'),
  ('101d101d-101d-101d-101d-101d101d101d', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_026', 'participant', now() - interval '45 days'),
  ('101e101e-101e-101e-101e-101e101e101e', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_027', 'participant', now() - interval '44 days'),
  ('101f101f-101f-101f-101f-101f101f101f', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_028', 'participant', now() - interval '43 days'),
  ('10201020-1020-1020-1020-102010201020', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_029', 'participant', now() - interval '42 days'),
  ('10211021-1021-1021-1021-102110211021', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_030', 'participant', now() - interval '41 days'),
  ('10221022-1022-1022-1022-102210221022', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_031', 'participant', now() - interval '40 days'),
  ('10231023-1023-1023-1023-102310231023', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_032', 'participant', now() - interval '39 days'),
  ('10241024-1024-1024-1024-102410241024', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_033', 'participant', now() - interval '38 days'),
  ('10251025-1025-1025-1025-102510251025', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_034', 'participant', now() - interval '37 days'),
  ('10261026-1026-1026-1026-102610261026', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_035', 'participant', now() - interval '36 days'),
  ('10271027-1027-1027-1027-102710271027', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_036', 'participant', now() - interval '36 days'),
  ('10281028-1028-1028-1028-102810281028', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_037', 'participant', now() - interval '35 days')
ON CONFLICT (id) DO NOTHING;

-- AI Art & Creative (completed) — 18 participants (some cross-participate)
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10291029-1029-1029-1029-102910291029', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_002', 'participant', now() - interval '78 days'),
  ('102a102a-102a-102a-102a-102a102a102a', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_004', 'participant', now() - interval '77 days'),
  ('102b102b-102b-102b-102b-102b102b102b', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_006', 'participant', now() - interval '76 days'),
  ('102c102c-102c-102c-102c-102c102c102c', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_038', 'participant', now() - interval '75 days'),
  ('102d102d-102d-102d-102d-102d102d102d', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_039', 'participant', now() - interval '75 days'),
  ('102e102e-102e-102e-102e-102e102e102e', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_040', 'participant', now() - interval '74 days'),
  ('102f102f-102f-102f-102f-102f102f102f', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_041', 'participant', now() - interval '73 days'),
  ('10301030-1030-1030-1030-103010301030', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_042', 'participant', now() - interval '72 days'),
  ('10311031-1031-1031-1031-103110311031', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_043', 'participant', now() - interval '72 days'),
  ('10321032-1032-1032-1032-103210321032', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_044', 'participant', now() - interval '71 days'),
  ('10331033-1033-1033-1033-103310331033', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_045', 'participant', now() - interval '70 days'),
  ('10341034-1034-1034-1034-103410341034', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_046', 'participant', now() - interval '70 days'),
  ('10351035-1035-1035-1035-103510351035', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_047', 'participant', now() - interval '69 days'),
  ('10361036-1036-1036-1036-103610361036', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_048', 'participant', now() - interval '68 days'),
  ('10371037-1037-1037-1037-103710371037', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_049', 'participant', now() - interval '68 days'),
  ('10381038-1038-1038-1038-103810381038', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_050', 'participant', now() - interval '67 days'),
  ('10391039-1039-1039-1039-103910391039', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_051', 'participant', now() - interval '67 days'),
  ('103a103a-103a-103a-103a-103a103a103a', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_052', 'participant', now() - interval '66 days')
ON CONFLICT (id) DO NOTHING;

-- Climate Tech (published) — 4 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('103b103b-103b-103b-103b-103b103b103b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_seed_007', 'participant', now() - interval '5 days'),
  ('103c103c-103c-103c-103c-103c103c103c', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_seed_053', 'participant', now() - interval '4 days'),
  ('103d103d-103d-103d-103d-103d103d103d', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_seed_054', 'participant', now() - interval '3 days'),
  ('103e103e-103e-103e-103e-103e103e103e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_seed_055', 'participant', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- AI Safety Jam (published) — 5 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('103f103f-103f-103f-103f-103f103f103f', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_seed_008', 'participant', now() - interval '4 days'),
  ('10401040-1040-1040-1040-104010401040', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_seed_056', 'participant', now() - interval '3 days'),
  ('10411041-1041-1041-1041-104110411041', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_seed_057', 'participant', now() - interval '3 days'),
  ('10421042-1042-1042-1042-104210421042', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_seed_058', 'participant', now() - interval '2 days'),
  ('10431043-1043-1043-1043-104310431043', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_seed_059', 'participant', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- AGI Innovation Summit (published) — 4 participants
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10441044-1044-1044-1044-104410441044', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'user_seed_009', 'participant', now() - interval '4 days'),
  ('10451045-1045-1045-1045-104510451045', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'user_seed_060', 'participant', now() - interval '3 days'),
  ('10461046-1046-1046-1046-104610461046', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'user_seed_061', 'participant', now() - interval '2 days'),
  ('10471047-1047-1047-1047-104710471047', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'user_seed_062', 'participant', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- Extra AI Agents participants for more solo submissions
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10481048-1048-1048-1048-104810481048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_063', 'participant', now() - interval '22 days'),
  ('10491049-1049-1049-1049-104910491049', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_064', 'participant', now() - interval '21 days'),
  ('104a104a-104a-104a-104a-104a104a104a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_065', 'participant', now() - interval '20 days'),
  ('104b104b-104b-104b-104b-104b104b104b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_066', 'participant', now() - interval '20 days'),
  ('104c104c-104c-104c-104c-104c104c104c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_067', 'participant', now() - interval '19 days'),
  ('104d104d-104d-104d-104d-104d104d104d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_068', 'participant', now() - interval '19 days'),
  ('104e104e-104e-104e-104e-104e104e104e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_069', 'participant', now() - interval '18 days'),
  ('104f104f-104f-104f-104f-104f104f104f', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_seed_070', 'participant', now() - interval '18 days')
ON CONFLICT (id) DO NOTHING;

-- Extra Search & Discovery participants for more solo submissions
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10501050-1050-1050-1050-105010501050', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_063', 'participant', now() - interval '38 days'),
  ('10511051-1051-1051-1051-105110511051', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_064', 'participant', now() - interval '37 days'),
  ('10521052-1052-1052-1052-105210521052', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_065', 'participant', now() - interval '36 days'),
  ('10531053-1053-1053-1053-105310531053', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_066', 'participant', now() - interval '36 days'),
  ('10541054-1054-1054-1054-105410541054', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_067', 'participant', now() - interval '35 days'),
  ('10551055-1055-1055-1055-105510551055', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_seed_068', 'participant', now() - interval '35 days')
ON CONFLICT (id) DO NOTHING;

-- Extra AI Art participants for more solo submissions
INSERT INTO hackathon_participants (id, hackathon_id, clerk_user_id, role, registered_at)
VALUES
  ('10561056-1056-1056-1056-105610561056', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_053', 'participant', now() - interval '70 days'),
  ('10571057-1057-1057-1057-105710571057', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_054', 'participant', now() - interval '69 days'),
  ('10581058-1058-1058-1058-105810581058', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_055', 'participant', now() - interval '68 days'),
  ('10591059-1059-1059-1059-105910591059', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_069', 'participant', now() - interval '68 days'),
  ('105a105a-105a-105a-105a-105a105a105a', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_070', 'participant', now() - interval '67 days'),
  ('105b105b-105b-105b-105b-105b105b105b', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_056', 'participant', now() - interval '67 days'),
  ('105c105c-105c-105c-105c-105c105c105c', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_057', 'participant', now() - interval '66 days'),
  ('105d105d-105d-105d-105d-105d105d105d', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'user_seed_071', 'participant', now() - interval '66 days')
ON CONFLICT (id) DO NOTHING;
