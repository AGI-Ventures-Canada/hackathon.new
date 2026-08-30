-- ============================================================================
-- SUBMISSIONS - AI ART & CREATIVE (completed)
-- 18 submissions (5 team + 13 solo), all 'submitted'
-- Depends on: hackathons, participants, teams
-- ============================================================================

INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  -- Team submissions
  ('30133013-3013-3013-3013-301330133013', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, '200c200c-200c-200c-200c-200c200c200c',
   'DreamCanvas', 'Collaborative AI art studio where multiple users paint together with AI style transfer applied in real-time.',
   'https://github.com/seed/dreamcanvas', 'https://dreamcanvas.demo.dev', 'https://youtube.com/watch?v=seed_dreamcanvas',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30143014-3014-3014-3014-301430143014', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, '200d200d-200d-200d-200d-200d200d200d',
   'SonicForge', 'AI music composition tool that generates full arrangements from hummed melodies with customizable genre and instrumentation.',
   'https://github.com/seed/sonicforge', NULL, 'https://youtube.com/watch?v=seed_sonicforge',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30153015-3015-3015-3015-301530153015', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, '200e200e-200e-200e-200e-200e200e200e',
   'StoryWeaver', 'Interactive fiction engine where AI generates branching narratives with consistent characters and visual scene illustrations.',
   'https://github.com/seed/storyweaver', 'https://storyweaver.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30163016-3016-3016-3016-301630163016', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, '200f200f-200f-200f-200f-200f200f200f',
   'StyleMorph', 'Real-time video style transfer that applies artistic styles to webcam feeds for live streaming and video calls.',
   'https://github.com/seed/stylemorph', 'https://stylemorph.demo.dev', 'https://youtube.com/watch?v=seed_stylemorph',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30173017-3017-3017-3017-301730173017', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, '20102010-2010-2010-2010-201020102010',
   'MotionPoet', 'AI-driven motion graphics generator that creates animations from text descriptions with keyframe interpolation.',
   'https://github.com/seed/motionpoet', NULL, 'https://youtube.com/watch?v=seed_motionpoet',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  -- Solo submissions
  ('30183018-3018-3018-3018-301830183018', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10341034-1034-1034-1034-103410341034', NULL,
   'PaletteGPT', 'Color palette generator that creates harmonious color schemes from text descriptions of moods, seasons, or concepts.',
   'https://github.com/seed/palettegpt', 'https://palettegpt.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30193019-3019-3019-3019-301930193019', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10351035-1035-1035-1035-103510351035', NULL,
   'TypoArt', 'AI typography tool that generates custom lettering and font styles from artistic descriptions and reference images.',
   'https://github.com/seed/typoart', NULL, 'https://youtube.com/watch?v=seed_typoart',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('301a301a-301a-301a-301a-301a301a301a', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10381038-1038-1038-1038-103810381038', NULL,
   'BeatCraft', 'AI beat maker that generates drum patterns and bass lines from genre descriptions and BPM targets.',
   'https://github.com/seed/beatcraft', 'https://beatcraft.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('301b301b-301b-301b-301b-301b301b301b', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10391039-1039-1039-1039-103910391039', NULL,
   'SceneSketch', 'Text-to-storyboard tool for filmmakers that generates shot compositions and camera angle suggestions.',
   'https://github.com/seed/scenesketch', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('301c301c-301c-301c-301c-301c301c301c', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '103a103a-103a-103a-103a-103a103a103a', NULL,
   'VoiceClone Studio', 'Ethical voice cloning tool with consent verification for creating personalized AI narrators and podcast hosts.',
   'https://github.com/seed/voiceclone-studio', 'https://voiceclone.demo.dev', 'https://youtube.com/watch?v=seed_voiceclone',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('301d301d-301d-301d-301d-301d301d301d', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '105d105d-105d-105d-105d-105d105d105d', NULL,
   'PixelUpscaler', 'Retro pixel art upscaler that converts low-resolution sprites to high-res illustrations while preserving artistic intent.',
   'https://github.com/seed/pixel-upscaler', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  -- Additional solo submissions
  ('30373037-3037-3037-3037-303730373037', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10561056-1056-1056-1056-105610561056', NULL,
   'ComicGen', 'AI comic strip generator that creates multi-panel stories with consistent characters from text prompts.',
   'https://github.com/seed/comicgen', 'https://comicgen.demo.dev', 'https://youtube.com/watch?v=seed_comicgen',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30383038-3038-3038-3038-303830383038', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10571057-1057-1057-1057-105710571057', NULL,
   'SoundScape', 'Ambient soundscape generator for focus and relaxation using AI-composed layered audio environments.',
   'https://github.com/seed/soundscape', 'https://soundscape.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('30393039-3039-3039-3039-303930393039', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10581058-1058-1058-1058-105810581058', NULL,
   'FashionMuse', 'AI fashion design assistant that generates clothing designs from mood boards and trend analysis.',
   'https://github.com/seed/fashionmuse', NULL, 'https://youtube.com/watch?v=seed_fashionmuse',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('303a303a-303a-303a-303a-303a303a303a', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10591059-1059-1059-1059-105910591059', NULL,
   'PoetryEngine', 'AI poetry composition tool with meter analysis, rhyme suggestion, and style emulation across literary traditions.',
   'https://github.com/seed/poetryengine', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('303b303b-303b-303b-303b-303b303b303b', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '105a105a-105a-105a-105a-105a105a105a', NULL,
   'LogoForge', 'AI logo designer that creates brand identity assets from company descriptions and style preferences.',
   'https://github.com/seed/logoforge', 'https://logoforge.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('303c303c-303c-303c-303c-303c303c303c', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '105b105b-105b-105b-105b-105b105b105b', NULL,
   'ArchViz AI', 'Architectural visualization tool that generates 3D renders from floor plans and style descriptions.',
   'https://github.com/seed/archviz-ai', NULL, 'https://youtube.com/watch?v=seed_archviz',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days'),

  ('303d303d-303d-303d-303d-303d303d303d', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '105c105c-105c-105c-105c-105c105c105c', NULL,
   'DanceChoreographer', 'AI dance move generator that creates choreography sequences from music analysis and style parameters.',
   'https://github.com/seed/dancechoreographer', 'https://dancechoreographer.demo.dev', 'https://youtube.com/watch?v=seed_dancechoreo',
   'submitted', '{}'::jsonb, now() - interval '62 days', now() - interval '60 days')
ON CONFLICT (id) DO NOTHING;
