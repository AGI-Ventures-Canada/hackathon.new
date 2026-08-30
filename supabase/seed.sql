-- ============================================================================
-- TENANTS
-- Run first - all other tables reference tenants
-- ============================================================================

-- Personal tenant (Your local dev user)
INSERT INTO tenants (id, clerk_user_id, name, slug, description, created_at, updated_at)
VALUES
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'user_demo_primary_0001', 'Jordan Lee', 'jordan-lee', 'Personal workspace for local development', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Organization tenants
INSERT INTO tenants (id, clerk_org_id, name, slug, description, website_url, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'org_test_local', 'Local Dev Org', 'local-dev', 'Local development organization', 'https://localhost:3000', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'org_test_demo', 'Demo Organization', 'demo', 'Demo organization for testing', 'https://demo.example.com', now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'org_tavily', 'Tavily', 'tavily', 'AI-powered search API for developers', 'https://tavily.com', now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'org_anthropic', 'Anthropic', 'anthropic', 'AI safety company building reliable, interpretable AI systems', 'https://anthropic.com', now(), now()),
  ('77777777-7777-7777-7777-777777777777', 'org_openai', 'OpenAI', 'openai', 'AI research and deployment company', 'https://openai.com', now(), now()),
  ('12345678-1234-1234-1234-123456789012', 'org_demo_agi_ventures_0001', 'AGI Ventures Canada', 'agi-ventures-canada', NULL, NULL, now(), now()),
  ('99990000-9999-9999-9999-999900009999', 'org_demo_agi_house_0002', 'AGI House', 'agi-house', 'AI hacker house and community in the Bay Area, hosting hackathons, dinners, and events for the AI community', 'https://agihouse.org', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Personal tenant for test user
INSERT INTO tenants (id, clerk_user_id, name, slug, description, website_url, created_at, updated_at)
VALUES
  ('87654321-4321-4321-4321-210987654321', 'user_demo_secondary_0002', 'Test User', 'test-user', 'Personal tenant for test user', NULL, now(), now())
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- API KEYS AND AUDIT LOGS
-- Depends on: tenants
-- ============================================================================

-- Test API keys (these are hashed versions, not actual keys)
INSERT INTO api_keys (id, tenant_id, name, prefix, hash, scopes, created_at)
VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Local Dev Key',
    'sk_live_test',
    'test_hash_for_local_development_only',
    ARRAY['agents:run', 'agents:read'],
    now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'Demo API Key',
    'sk_live_demo',
    'demo_hash_for_local_development_only',
    ARRAY['agents:run', 'agents:read', 'runs:read'],
    now()
  )
ON CONFLICT DO NOTHING;

-- Sample audit logs
INSERT INTO audit_logs (id, tenant_id, action, actor_type, actor_id, resource_type, resource_id, metadata, created_at)
VALUES
  (
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    'api_key.created',
    'user',
    'user_test_123',
    'api_key',
    '33333333-3333-3333-3333-333333333333',
    '{"name": "Local Dev Key"}'::jsonb,
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;
-- ============================================================================
-- HACKATHONS - DEMO ORGANIZATION
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'AI Agents Hackathon 2026',
    'ai-agents-2026',
    'Build the next generation of AI agents! Join us for a weekend of **innovation**, **collaboration**, and **creativity**.

## What to Expect

Whether you''re building autonomous agents, multi-agent systems, or novel AI applications, this hackathon is for you.

### Tracks

- **Autonomous Agents** — Build agents that can plan, reason, and act independently
- **Multi-Agent Systems** — Create systems where multiple agents collaborate
- **Creative AI** — Push the boundaries of AI-generated art, music, and storytelling

### Resources

All participants get free API credits from our sponsors. Check the [AI SDK docs](https://ai-sdk.dev) for getting started quickly.

> _"The best way to predict the future is to build it."_',
    '1. Teams of 1-4 people
2. All code must be written during the hackathon
3. You may use any AI APIs and frameworks
4. Projects must include a working demo
5. Judging criteria: Innovation, Technical Execution, Impact, Presentation',
    now() - interval '16 days',
    now() - interval '14 days',
    now() - interval '45 days',
    now() - interval '18 days',
    true,
    'completed',
    1,
    4,
    true,
    false,
    now() - interval '14 days',
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'Climate Tech Challenge',
    'climate-tech-2026',
    'Hack for the planet! Build solutions that address climate change, sustainability, and environmental challenges. From carbon tracking to renewable energy optimization, bring your ideas to life.',
    '1. Open to all skill levels
2. Teams of 2-5 people
3. Must address a real climate/environmental challenge
4. Use of open data sources encouraged
5. Top 3 teams receive prizes and mentorship',
    now() + interval '60 days',
    now() + interval '62 days',
    now(),
    now() + interval '55 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() - interval '7 days',
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Tavily hackathon
INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '55555555-5555-5555-5555-555555555555',
    'Search & Discovery Hack',
    'search-discovery-hack',
    'Sponsored by Tavily. Build innovative search and discovery experiences using AI. From semantic search to knowledge graphs, show us what''s possible with modern search technology.',
    '1. Must use Tavily API
2. Solo or teams up to 3
3. 24-hour hackathon
4. Free API credits provided
5. Winner gets $5,000 and featured integration',
    now() - interval '32 days',
    now() - interval '31 days',
    now() - interval '50 days',
    now() - interval '34 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '10 days',
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Anthropic hackathon
INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '66666666-6666-6666-6666-666666666666',
    'Anthropic AI Safety Jam',
    'ai-safety-jam',
    'Join Anthropic for a hackathon focused on AI safety and alignment. Build tools, demos, and research prototypes that help make AI systems more safe, honest, and harmless.',
    '1. Focus on AI safety/alignment
2. Teams of 1-4
3. Research papers welcome alongside code
4. Claude API access provided
5. Top projects may be invited to present at Anthropic',
    now() + interval '45 days',
    now() + interval '47 days',
    now() + interval '7 days',
    now() + interval '40 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '5 days',
    now()
  )
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- HACKATHONS - AGI VENTURES CANADA
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Innovation Summit 2026',
    'agi-innovation-summit-2026',
    'Join AGI Ventures Canada for our flagship innovation summit! Build cutting-edge AI solutions that push the boundaries of what''s possible. Whether you''re working on AGI research, practical AI applications, or novel AI architectures, this is your chance to showcase your vision.',
    '1. Teams of 1-5 people
2. All projects must incorporate AI/ML technologies
3. Code must be written during the hackathon period
4. Projects must include a working demo or prototype
5. Judging criteria: Innovation, Technical Depth, Market Potential, Presentation Quality
6. Grand prize: $25,000 CAD + mentorship opportunity',
    now() + interval '20 days',
    now() + interval '22 days',
    now() - interval '5 days',
    now() + interval '18 days',
    true,
    'published',
    1,
    5,
    true,
    false,
    now() - interval '10 days',
    now()
  ),
  (
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    '12345678-1234-1234-1234-123456789012',
    'Canadian AI Startup Challenge',
    'canadian-ai-startup-challenge',
    'Calling all Canadian entrepreneurs and developers! Build AI-powered startups that solve real problems. From healthcare to fintech, from climate tech to education, show us how AI can transform industries and create value.',
    '1. Open to Canadian residents and students
2. Teams of 2-6 people
3. Must address a real market problem
4. Business plan required alongside technical demo
5. Top 5 teams receive seed funding and accelerator access
6. Must be able to present in English or French',
    now() + interval '50 days',
    now() + interval '52 days',
    now() + interval '10 days',
    now() + interval '45 days',
    true,
    'published',
    2,
    6,
    false,
    false,
    now() - interval '3 days',
    now()
  ),
  (
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    '12345678-1234-1234-1234-123456789012',
    'AGI Research Hackathon',
    'agi-research-hackathon',
    'A specialized hackathon for researchers, PhD students, and advanced practitioners working on AGI-related problems. Focus on alignment, reasoning, multi-agent systems, or novel architectures.',
    '1. Open to researchers, graduate students, and experienced practitioners
2. Solo or teams up to 4
3. Research papers or technical reports welcome
4. Access to advanced AI models and compute resources
5. Top research projects may be considered for publication support
6. 48-hour intensive format',
    now() + interval '75 days',
    now() + interval '77 days',
    now() + interval '20 days',
    now() + interval '70 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now(),
    now()
  ),
  (
    'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    '12345678-1234-1234-1234-123456789012',
    'Healthcare AI Innovation Challenge',
    'healthcare-ai-challenge',
    'Build AI solutions that improve healthcare outcomes. From diagnostic tools to patient care systems, from drug discovery to telemedicine, use AI to make healthcare more accessible and effective.',
    '1. Teams of 1-4 people
2. Must address a real healthcare challenge
3. HIPAA compliance considerations required
4. Working prototype or demo required
5. Top 3 teams receive $15,000 CAD and healthcare industry mentorship
6. Open to all skill levels',
    now() + interval '35 days',
    now() + interval '37 days',
    now() - interval '2 days',
    now() + interval '32 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '8 days',
    now()
  ),
  (
    'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
    '12345678-1234-1234-1234-123456789012',
    'Climate AI Solutions Hack',
    'climate-ai-solutions',
    'Tackle climate change with AI! Build solutions for carbon tracking, renewable energy optimization, climate prediction, or sustainable agriculture. Help create a more sustainable future.',
    '1. Teams of 2-5 people
2. Must address climate or environmental challenges
3. Use of public climate data encouraged
4. Impact measurement required
5. Winners receive $10,000 CAD and potential pilot opportunities
6. 36-hour hackathon format',
    now() + interval '90 days',
    now() + interval '91 days',
    now() + interval '30 days',
    now() + interval '85 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() - interval '1 day',
    now()
  ),
  (
    'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6',
    '12345678-1234-1234-1234-123456789012',
    'FinTech AI Buildathon',
    'fintech-ai-buildathon',
    'Revolutionize financial services with AI. Build solutions for fraud detection, algorithmic trading, personal finance, credit scoring, or blockchain applications. Show us the future of finance.',
    '1. Teams of 1-4 people
2. Must incorporate AI/ML in financial applications
3. Security and compliance considerations required
4. Working demo required
5. Top projects receive $20,000 CAD and fintech accelerator access
6. Regulatory guidance provided',
    now() + interval '12 days',
    now() + interval '14 days',
    now() - interval '7 days',
    now() + interval '10 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '12 days',
    now()
  ),
  (
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7',
    '12345678-1234-1234-1234-123456789012',
    'Education AI Hack',
    'education-ai-hack',
    'Transform education with AI! Build tools for personalized learning, student assessment, content generation, or accessibility. Help make quality education accessible to everyone.',
    '1. Teams of 1-5 people
2. Focus on educational technology solutions
3. Must demonstrate learning outcomes or accessibility improvements
4. Prototype or demo required
5. Top 3 teams receive $12,000 CAD and education sector partnerships
6. Open to educators, students, and developers',
    now() + interval '60 days',
    now() + interval '62 days',
    now() + interval '15 days',
    now() + interval '55 days',
    true,
    'published',
    1,
    5,
    true,
    false,
    now() - interval '2 days',
    now()
  ),
  (
    'b8b8b8b8-b8b8-b8b8-b8b8-b8b8b8b8b8b8',
    '12345678-1234-1234-1234-123456789012',
    'AI for Good Social Impact Challenge',
    'ai-for-good-challenge',
    'Use AI to solve social problems! Address issues like poverty, inequality, accessibility, mental health, or community building. Make a positive impact on society.',
    '1. Teams of 2-6 people
2. Must address a social or community challenge
3. Impact measurement and user research required
4. Working prototype or pilot required
5. Winners receive $18,000 CAD and nonprofit partnerships
6. Focus on sustainable, scalable solutions',
    now() + interval '100 days',
    now() + interval '102 days',
    now() + interval '40 days',
    now() + interval '95 days',
    true,
    'published',
    2,
    6,
    false,
    false,
    now() + interval '2 days',
    now()
  ),
  (
    'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9',
    '12345678-1234-1234-1234-123456789012',
    'Robotics & AI Integration Hack',
    'robotics-ai-integration',
    'Combine robotics and AI! Build autonomous systems, robotic assistants, or AI-powered automation. Whether it''s manufacturing, service robots, or research platforms, show us the future of robotics.',
    '1. Teams of 2-5 people
2. Must combine hardware and AI software
3. Physical demo or simulation required
4. Safety considerations mandatory
5. Top projects receive $22,000 CAD and robotics lab access
6. Hardware kits available for loan',
    now() + interval '120 days',
    now() + interval '122 days',
    now() + interval '50 days',
    now() + interval '115 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() + interval '5 days',
    now()
  ),
  (
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    '12345678-1234-1234-1234-123456789012',
    'AI Art & Creative Expression Contest',
    'ai-art-creative-contest',
    'Explore the intersection of AI and creativity! Build tools for art generation, music composition, storytelling, or creative workflows. Push the boundaries of AI-assisted creativity.',
    '1. Solo or teams up to 3
2. Focus on creative applications of AI
3. Portfolio or demo required
4. Multiple categories: visual art, music, writing, interactive media
5. Winners receive $8,000 CAD and gallery exhibition opportunities
6. Open to artists, musicians, writers, and developers',
    now() - interval '62 days',
    now() - interval '60 days',
    now() - interval '80 days',
    now() - interval '64 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '15 days',
    now()
  ),
  (
    'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
    '12345678-1234-1234-1234-123456789012',
    'AI Security & Privacy Hackathon',
    'ai-security-privacy',
    'Secure the AI future! Build tools for AI security, privacy-preserving ML, adversarial defense, or secure AI deployment. Help make AI systems more trustworthy and secure.',
    '1. Teams of 1-4 people
2. Focus on security, privacy, or trust in AI systems
3. Security analysis or proof-of-concept required
4. Open to security researchers and developers
5. Top projects receive $15,000 CAD and security research partnerships
6. 24-hour intensive format',
    now() + interval '25 days',
    now() + interval '26 days',
    now() + interval '3 days',
    now() + interval '23 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '6 days',
    now()
  ),
  (
    'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
    '12345678-1234-1234-1234-123456789012',
    'Student AI Innovation Challenge',
    'student-ai-innovation',
    'Exclusively for students! Showcase your AI projects and compete with peers. Open to high school, undergraduate, and graduate students. Build something amazing and launch your AI career.',
    '1. Open only to students (high school, undergraduate, graduate)
2. Teams of 1-4 people
3. Student ID verification required
4. All projects welcome - research, applications, or demos
5. Winners receive $5,000 CAD, internships, and mentorship
6. Special prizes for high school participants',
    now() + interval '15 days',
    now() + interval '17 days',
    now() - interval '3 days',
    now() + interval '13 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '9 days',
    now()
  )
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- HACKATHONS - AGI HOUSE
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1',
    '99990000-9999-9999-9999-999900009999',
    'MCP Agents Hackathon',
    'mcp-agents-hackathon',
    'Build AI agents powered by the Model Context Protocol! Create tools, servers, and autonomous agents that leverage MCP to connect LLMs with real-world data sources and capabilities. Hosted at AGI House SF.',
    '1. Teams of 1-4 people
2. Must use the Model Context Protocol
3. All code must be written during the hackathon
4. Working demo required at end of event
5. Judging criteria: Innovation, Technical Depth, Usefulness, Demo Quality
6. Prizes: $10,000 total pool',
    now() - interval '23 days',
    now() - interval '22 days',
    now() - interval '40 days',
    now() - interval '25 days',
    true,
    'completed',
    1,
    4,
    true,
    false,
    now() - interval '45 days',
    now()
  ),
  (
    'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2',
    '99990000-9999-9999-9999-999900009999',
    'GenAI Goes Local',
    'genai-goes-local',
    'Run AI models on the edge! Build applications that leverage local LLMs, on-device inference, and privacy-preserving AI. No cloud required. Explore quantization, optimization, and novel architectures for consumer hardware.',
    '1. Solo or teams up to 3
2. Must run inference locally (no cloud API calls for primary model)
3. Support for consumer-grade hardware required
4. Benchmark results must be provided
5. Judging: Performance, Usability, Innovation, Hardware Efficiency
6. Prizes: $7,500 + NVIDIA hardware',
    now() - interval '44 days',
    now() - interval '43 days',
    now() - interval '60 days',
    now() - interval '46 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '65 days',
    now()
  ),
  (
    'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3',
    '99990000-9999-9999-9999-999900009999',
    'Generative UI Hackathon',
    'generative-ui-hackathon',
    'Design the future of user interfaces! Build applications where AI generates, adapts, and personalizes UI components in real-time. From AI-driven design systems to conversational interfaces that render rich components.',
    '1. Teams of 1-4 people
2. UI must be dynamically generated or adapted by AI
3. Must demonstrate at least 3 distinct UI generation patterns
4. Accessibility considerations required
5. Judging: Design Quality, Innovation, Technical Execution, User Experience
6. Prizes: $8,000 + design tool credits',
    now() - interval '65 days',
    now() - interval '64 days',
    now() - interval '80 days',
    now() - interval '67 days',
    true,
    'completed',
    1,
    4,
    true,
    false,
    now() - interval '85 days',
    now()
  ),
  (
    'aaa40004-aaa4-aaa4-aaa4-aaa40004aaa4',
    '99990000-9999-9999-9999-999900009999',
    'AI x Commerce Build Day',
    'ai-commerce-build-day',
    'Reimagine commerce with AI! Build intelligent shopping assistants, personalized recommendation engines, dynamic pricing systems, or AI-powered supply chain tools. From checkout optimization to conversational commerce.',
    '1. Teams of 2-5 people
2. Must address a real commerce challenge
3. Integration with at least one commerce platform encouraged
4. Working prototype required
5. Judging: Business Impact, Technical Depth, User Experience, Scalability
6. Prizes: $12,000 + commerce platform credits',
    now() + interval '20 days',
    now() + interval '21 days',
    now() - interval '5 days',
    now() + interval '18 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() - interval '10 days',
    now()
  ),
  (
    'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5',
    '99990000-9999-9999-9999-999900009999',
    'Open Source AGI Hack',
    'open-source-agi-hack',
    'Advance the open-source AI ecosystem! Build open-source tools, models, and frameworks that push the boundaries of artificial general intelligence. From training infrastructure to evaluation benchmarks to novel architectures.',
    '1. Teams of 1-6 people
2. All code must be open source (MIT or Apache 2.0)
3. Must contribute to the open-source AI ecosystem
4. Documentation and reproducibility required
5. Judging: Impact, Technical Innovation, Community Value, Code Quality
6. Prizes: $15,000 + compute credits',
    now() + interval '45 days',
    now() + interval '47 days',
    now() + interval '5 days',
    now() + interval '40 days',
    true,
    'published',
    1,
    6,
    true,
    false,
    now() - interval '3 days',
    now()
  ),
  (
    'aaa60006-aaa6-aaa6-aaa6-aaa60006aaa6',
    '99990000-9999-9999-9999-999900009999',
    'Aerospace AI Hackathon',
    'aerospace-ai-hackathon',
    'Apply AI to the final frontier! Build systems for satellite imagery analysis, autonomous navigation, space mission planning, drone coordination, or aviation safety. From orbit to atmosphere, AI is transforming aerospace.',
    '1. Teams of 2-4 people
2. Must address an aerospace or aviation challenge
3. Simulation or real-world demo required
4. Safety analysis mandatory for autonomous systems
5. Judging: Innovation, Feasibility, Technical Rigor, Safety Considerations
6. Prizes: $20,000 + industry mentorship',
    now() + interval '70 days',
    now() + interval '72 days',
    now() + interval '20 days',
    now() + interval '65 days',
    true,
    'published',
    2,
    4,
    false,
    false,
    now() - interval '1 day',
    now()
  )
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- HACKATHONS - OTHER ORGANIZATIONS (OpenAI, Tavily, Anthropic, Demo)
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'aa11aa11-aa11-aa11-aa11-aa11aa11aa11',
    '77777777-7777-7777-7777-777777777777',
    'GPT Builders Jam',
    'gpt-builders-jam',
    'Build custom GPTs, plugins, and AI-powered tools using the latest OpenAI APIs. Whether you''re building assistants, creative tools, or enterprise solutions, show us what you can do.',
    '1. Teams of 1-3 people
2. Must use OpenAI APIs
3. 24-hour hackathon
4. Free API credits provided
5. Winner gets $10,000 and featured in OpenAI showcase',
    now() - interval '25 days',
    now() - interval '24 days',
    now() - interval '45 days',
    now() - interval '27 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '50 days',
    now()
  ),
  (
    'bb22bb22-bb22-bb22-bb22-bb22bb22bb22',
    '55555555-5555-5555-5555-555555555555',
    'Tavily Data Visualization Hack',
    'tavily-data-viz-hack',
    'Turn data into insights! Build beautiful, interactive visualizations powered by AI search. Combine Tavily''s search capabilities with data visualization to create compelling dashboards and explorations.',
    '1. Solo or teams up to 4
2. Must use Tavily API for data sourcing
3. Focus on interactive visualizations
4. 48-hour format
5. Winner receives $7,500 and Tavily partnership',
    now() + interval '30 days',
    now() + interval '32 days',
    now() - interval '3 days',
    now() + interval '25 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '10 days',
    now()
  ),
  (
    'cc33cc33-cc33-cc33-cc33-cc33cc33cc33',
    '66666666-6666-6666-6666-666666666666',
    'Constitutional AI Challenge',
    'constitutional-ai-challenge',
    'Explore constitutional AI principles! Build systems that align AI behavior with human values through scalable oversight, interpretability tools, or novel alignment techniques.',
    '1. Teams of 1-4 people
2. Focus on alignment and constitutional AI
3. Research proposals and code both welcome
4. Claude API access provided
5. Top 3 receive $12,000 and Anthropic mentorship',
    now() + interval '55 days',
    now() + interval '57 days',
    now() + interval '10 days',
    now() + interval '50 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '4 days',
    now()
  ),
  (
    'dd44dd44-dd44-dd44-dd44-dd44dd44dd44',
    '22222222-2222-2222-2222-222222222222',
    'Quantum ML Hackathon',
    'quantum-ml-hackathon',
    'Explore the frontier of quantum computing meets machine learning. Build quantum-enhanced ML models, quantum circuit optimizers, or novel quantum algorithms for AI applications.',
    '1. Teams of 2-4 people
2. Quantum simulators and hardware access provided
3. Both theoretical and applied projects welcome
4. 72-hour hackathon
5. Top teams receive $15,000 and quantum lab access',
    now() + interval '80 days',
    now() + interval '83 days',
    now() + interval '25 days',
    now() + interval '75 days',
    true,
    'published',
    2,
    4,
    false,
    false,
    now() - interval '2 days',
    now()
  ),
  (
    'ee55ee55-ee55-ee55-ee55-ee55ee55ee55',
    '77777777-7777-7777-7777-777777777777',
    'DevTools AI Hackathon',
    'devtools-ai-hackathon',
    'Build AI-powered developer tools! From code assistants to automated testing, CI/CD optimization, or debugging tools. Make developers more productive with AI.',
    '1. Solo or teams up to 3
2. Must improve developer workflow
3. Integration with existing tools encouraged
4. Working demo required
5. Winner receives $8,000 and OpenAI enterprise pilot',
    now() - interval '40 days',
    now() - interval '38 days',
    now() - interval '60 days',
    now() - interval '42 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '65 days',
    now()
  ),
  (
    'ff66ff66-ff66-ff66-ff66-ff66ff66ff66',
    '55555555-5555-5555-5555-555555555555',
    'Multilingual NLP Challenge',
    'multilingual-nlp-challenge',
    'Break language barriers with AI! Build multilingual search, translation, summarization, or content generation tools. Focus on underrepresented languages and accessibility.',
    '1. Teams of 1-5 people
2. Must support at least 3 languages
3. Focus on underrepresented languages encouraged
4. Tavily multilingual search API access provided
5. Winners receive $9,000 and UN partnership opportunity',
    now() + interval '40 days',
    now() + interval '42 days',
    now() + interval '5 days',
    now() + interval '35 days',
    true,
    'published',
    1,
    5,
    true,
    false,
    now() - interval '5 days',
    now()
  ),
  (
    'aa77aa77-aa77-aa77-aa77-aa77aa77aa77',
    '66666666-6666-6666-6666-666666666666',
    'Real-time AI Applications Hack',
    'realtime-ai-hack',
    'Build AI applications that work in real-time! From live transcription and translation to real-time anomaly detection and adaptive interfaces. Speed and responsiveness are key.',
    '1. Teams of 1-4 people
2. Must demonstrate real-time capabilities
3. Latency benchmarks required
4. Claude API streaming access provided
5. Top projects receive $11,000 and compute credits',
    now() + interval '70 days',
    now() + interval '72 days',
    now() + interval '15 days',
    now() + interval '65 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '1 day',
    now()
  ),
  (
    'bb88bb88-bb88-bb88-bb88-bb88bb88bb88',
    '22222222-2222-2222-2222-222222222222',
    'Open Source AI Hackathon',
    'open-source-ai-hackathon',
    'Build open source AI tools the community needs! From model training frameworks to deployment tools, from evaluation suites to data pipelines. All projects must be open source.',
    '1. Teams of 1-6 people
2. All code must be open sourced (MIT or Apache 2.0)
3. Must solve a real community need
4. Documentation and onboarding quality judged
5. Winners receive $6,000 and GitHub sponsorship',
    now() + interval '95 days',
    now() + interval '97 days',
    now() + interval '35 days',
    now() + interval '90 days',
    true,
    'published',
    1,
    6,
    true,
    false,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- HACKATHON SPONSORS
-- Depends on: tenants, hackathons
-- ============================================================================

-- Base sponsors for demo hackathons
INSERT INTO hackathon_sponsors (id, hackathon_id, sponsor_tenant_id, name, logo_url, website_url, tier, display_order, created_at)
VALUES
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '55555555-5555-5555-5555-555555555555',
    'Tavily',
    NULL,
    'https://tavily.com',
    'gold',
    0,
    now()
  ),
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66666666-6666-6666-6666-666666666666',
    'Anthropic',
    NULL,
    'https://anthropic.com',
    'gold',
    1,
    now()
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '77777777-7777-7777-7777-777777777777',
    'OpenAI',
    NULL,
    'https://openai.com',
    'silver',
    0,
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- AGI Ventures Canada sponsoring other orgs' hackathons
INSERT INTO hackathon_sponsors (id, hackathon_id, sponsor_tenant_id, name, logo_url, website_url, tier, display_order, created_at)
VALUES
  (
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'gold',
    2,
    now()
  ),
  (
    'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'gold',
    1,
    now()
  ),
  (
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'silver',
    0,
    now()
  ),
  (
    'd0a0d0a0-d0a0-d0a0-d0a0-d0a0d0a0d0a0',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'gold',
    0,
    now()
  ),
  (
    'e0a0e0a0-e0a0-e0a0-e0a0-e0a0e0a0e0a0',
    'aa11aa11-aa11-aa11-aa11-aa11aa11aa11',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'gold',
    0,
    now()
  ),
  (
    'f0a0f0a0-f0a0-f0a0-f0a0-f0a0f0a0f0a0',
    'bb22bb22-bb22-bb22-bb22-bb22bb22bb22',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'silver',
    0,
    now()
  ),
  (
    'a1b1a1b1-a1b1-a1b1-a1b1-a1b1a1b1a1b1',
    'ee55ee55-ee55-ee55-ee55-ee55ee55ee55',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'gold',
    0,
    now()
  ),
  (
    'b1c1b1c1-b1c1-b1c1-b1c1-b1c1b1c1b1c1',
    'ff66ff66-ff66-ff66-ff66-ff66ff66ff66',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Canada',
    NULL,
    NULL,
    'silver',
    0,
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- AGI House sponsoring other orgs' hackathons
INSERT INTO hackathon_sponsors (id, hackathon_id, sponsor_tenant_id, name, logo_url, website_url, tier, display_order, created_at)
VALUES
  (
    'a9a90001-a9a9-a9a9-a9a9-a9a90001a9a9',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '99990000-9999-9999-9999-999900009999',
    'AGI House',
    NULL,
    'https://agihouse.org',
    'gold',
    1,
    now()
  ),
  (
    'a9a90002-a9a9-a9a9-a9a9-a9a90002a9a9',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '99990000-9999-9999-9999-999900009999',
    'AGI House',
    NULL,
    'https://agihouse.org',
    'silver',
    2,
    now()
  ),
  (
    'a9a90003-a9a9-a9a9-a9a9-a9a90003a9a9',
    'aa11aa11-aa11-aa11-aa11-aa11aa11aa11',
    '99990000-9999-9999-9999-999900009999',
    'AGI House',
    NULL,
    'https://agihouse.org',
    'gold',
    1,
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Tenant-backed sponsors on AGI House hackathons
INSERT INTO hackathon_sponsors (id, hackathon_id, sponsor_tenant_id, name, logo_url, website_url, tier, display_order, created_at)
VALUES
  (
    'a9b90001-a9b9-a9b9-a9b9-a9b90001a9b9',
    'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1',
    '66666666-6666-6666-6666-666666666666',
    'Anthropic',
    NULL,
    'https://anthropic.com',
    'gold',
    0,
    now()
  ),
  (
    'a9b90002-a9b9-a9b9-a9b9-a9b90002a9b9',
    'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5',
    '77777777-7777-7777-7777-777777777777',
    'OpenAI',
    NULL,
    'https://openai.com',
    'silver',
    1,
    now()
  ),
  (
    'a9b90003-a9b9-a9b9-a9b9-a9b90003a9b9',
    'aaa40004-aaa4-aaa4-aaa4-aaa40004aaa4',
    '55555555-5555-5555-5555-555555555555',
    'Tavily',
    NULL,
    'https://tavily.com',
    'silver',
    1,
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Manual sponsors on AGI House hackathons (no sponsor_tenant_id)
INSERT INTO hackathon_sponsors (id, hackathon_id, sponsor_tenant_id, name, logo_url, website_url, tier, custom_tier_label, display_order, created_at)
VALUES
  (
    'a9c90001-a9c9-a9c9-a9c9-a9c90001a9c9',
    'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1',
    NULL,
    'Microsoft',
    NULL,
    'https://microsoft.com',
    'custom',
    'Title',
    1,
    now()
  ),
  (
    'a9c90002-a9c9-a9c9-a9c9-a9c90002a9c9',
    'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1',
    NULL,
    'Sequoia Capital',
    NULL,
    'https://sequoiacap.com',
    'silver',
    NULL,
    2,
    now()
  ),
  (
    'a9c90003-a9c9-a9c9-a9c9-a9c90003a9c9',
    'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2',
    NULL,
    'NVIDIA',
    NULL,
    'https://nvidia.com',
    'custom',
    'Title',
    0,
    now()
  ),
  (
    'a9c90004-a9c9-a9c9-a9c9-a9c90004a9c9',
    'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2',
    NULL,
    'Intel',
    NULL,
    'https://intel.com',
    'gold',
    NULL,
    1,
    now()
  ),
  (
    'a9c90005-a9c9-a9c9-a9c9-a9c90005a9c9',
    'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3',
    NULL,
    'Google',
    NULL,
    'https://google.com',
    'custom',
    'Title',
    0,
    now()
  ),
  (
    'a9c90006-a9c9-a9c9-a9c9-a9c90006a9c9',
    'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3',
    NULL,
    'Microsoft',
    NULL,
    'https://microsoft.com',
    'silver',
    NULL,
    1,
    now()
  ),
  (
    'a9c90007-a9c9-a9c9-a9c9-a9c90007a9c9',
    'aaa40004-aaa4-aaa4-aaa4-aaa40004aaa4',
    NULL,
    'Google',
    NULL,
    'https://google.com',
    'gold',
    NULL,
    0,
    now()
  ),
  (
    'a9c90008-a9c9-a9c9-a9c9-a9c90008a9c9',
    'aaa40004-aaa4-aaa4-aaa4-aaa40004aaa4',
    NULL,
    'Apple',
    NULL,
    'https://apple.com',
    'silver',
    NULL,
    2,
    now()
  ),
  (
    'a9c90009-a9c9-a9c9-a9c9-a9c90009a9c9',
    'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5',
    NULL,
    'Microsoft',
    NULL,
    'https://microsoft.com',
    'custom',
    'Title',
    0,
    now()
  ),
  (
    'a9c9000a-a9c9-a9c9-a9c9-a9c9000aa9c9',
    'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5',
    NULL,
    'Sequoia Capital',
    NULL,
    'https://sequoiacap.com',
    'gold',
    NULL,
    2,
    now()
  ),
  (
    'a9c9000b-a9c9-a9c9-a9c9-a9c9000ba9c9',
    'aaa50005-aaa5-aaa5-aaa5-aaa50005aaa5',
    NULL,
    'a16z',
    NULL,
    'https://a16z.com',
    'silver',
    NULL,
    3,
    now()
  ),
  (
    'a9c9000c-a9c9-a9c9-a9c9-a9c9000ca9c9',
    'aaa60006-aaa6-aaa6-aaa6-aaa60006aaa6',
    NULL,
    'NVIDIA',
    NULL,
    'https://nvidia.com',
    'custom',
    'Title',
    0,
    now()
  ),
  (
    'a9c9000d-a9c9-a9c9-a9c9-a9c9000da9c9',
    'aaa60006-aaa6-aaa6-aaa6-aaa60006aaa6',
    NULL,
    'a16z',
    NULL,
    'https://a16z.com',
    'gold',
    NULL,
    1,
    now()
  ),
  (
    'a9c9000e-a9c9-a9c9-a9c9-a9c9000ea9c9',
    'aaa60006-aaa6-aaa6-aaa6-aaa60006aaa6',
    NULL,
    'Boeing',
    NULL,
    'https://boeing.com',
    'silver',
    NULL,
    2,
    now()
  )
ON CONFLICT (id) DO NOTHING;
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
-- ============================================================================
-- SEED TEAMS
-- Depends on: hackathons, participants
-- ============================================================================

-- AI Agents 2026 — 7 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('20012001-2001-2001-2001-200120012001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Neural Navigators', 'user_seed_001', 'SEED-A-001', 'locked', now() - interval '38 days', now() - interval '16 days'),
  ('20022002-2002-2002-2002-200220022002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Agent Smiths', 'user_seed_004', 'SEED-A-002', 'locked', now() - interval '36 days', now() - interval '16 days'),
  ('20032003-2003-2003-2003-200320032003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Autonomous Minds', 'user_seed_007', 'SEED-A-003', 'locked', now() - interval '34 days', now() - interval '16 days'),
  ('20042004-2004-2004-2004-200420042004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Swarm Intelligence', 'user_seed_010', 'SEED-A-004', 'locked', now() - interval '32 days', now() - interval '16 days'),
  ('20052005-2005-2005-2005-200520052005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ReAct Squad', 'user_seed_013', 'SEED-A-005', 'locked', now() - interval '30 days', now() - interval '16 days'),
  ('20062006-2006-2006-2006-200620062006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Chain of Thought', 'user_seed_016', 'SEED-A-006', 'locked', now() - interval '28 days', now() - interval '16 days'),
  ('20072007-2007-2007-2007-200720072007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tool Callers', 'user_seed_019', 'SEED-A-007', 'locked', now() - interval '26 days', now() - interval '16 days')
ON CONFLICT (id) DO NOTHING;

-- Search & Discovery — 4 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('20082008-2008-2008-2008-200820082008', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Query Wizards', 'user_seed_001', 'SEED-S-001', 'locked', now() - interval '46 days', now() - interval '32 days'),
  ('20092009-2009-2009-2009-200920092009', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Semantic Seekers', 'user_seed_026', 'SEED-S-002', 'locked', now() - interval '44 days', now() - interval '32 days'),
  ('200a200a-200a-200a-200a-200a200a200a', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Index Architects', 'user_seed_029', 'SEED-S-003', 'locked', now() - interval '42 days', now() - interval '32 days'),
  ('200b200b-200b-200b-200b-200b200b200b', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Retrieval Rangers', 'user_seed_032', 'SEED-S-004', 'locked', now() - interval '40 days', now() - interval '32 days')
ON CONFLICT (id) DO NOTHING;

-- AI Art & Creative — 5 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('200c200c-200c-200c-200c-200c200c200c', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Pixel Dreamers', 'user_seed_002', 'SEED-C-001', 'locked', now() - interval '76 days', now() - interval '62 days'),
  ('200d200d-200d-200d-200d-200d200d200d', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Creative Circuits', 'user_seed_038', 'SEED-C-002', 'locked', now() - interval '74 days', now() - interval '62 days'),
  ('200e200e-200e-200e-200e-200e200e200e', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Neural Canvas', 'user_seed_041', 'SEED-C-003', 'locked', now() - interval '72 days', now() - interval '62 days'),
  ('200f200f-200f-200f-200f-200f200f200f', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Generative Collective', 'user_seed_044', 'SEED-C-004', 'locked', now() - interval '70 days', now() - interval '62 days'),
  ('20102010-2010-2010-2010-201020102010', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Diffusion Lab', 'user_seed_048', 'SEED-C-005', 'locked', now() - interval '68 days', now() - interval '62 days')
ON CONFLICT (id) DO NOTHING;

-- Teams for completed hackathon submissions
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  -- AI Art & Creative Expression Contest teams
  ('e1010101-0101-0101-0101-010101010101', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Synesthesia Labs', 'user_alice_chen_001', 'SYNTH-2026-ART1', 'locked', now() - interval '65 days', now() - interval '60 days'),
  ('e2020202-0202-0202-0202-020202020202', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Haiku Hackers', 'user_maya_patel_002', 'HAIKU-2026-ART2', 'locked', now() - interval '65 days', now() - interval '61 days'),
  ('e3030303-0303-0303-0303-030303030303', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Neural Harmonics', 'user_james_wilson_003', 'NEURAL-2026-ART3', 'locked', now() - interval '65 days', now() - interval '62 days'),
  ('e4040404-0404-0404-0404-040404040404', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Dream Team VR', 'user_emma_zhang_004', 'DREAM-2026-ART4', 'locked', now() - interval '65 days', now() - interval '60 days'),
  -- AI Agents Hackathon 2026 teams
  ('fa1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AutoPilot Crew', 'user_david_park_005', 'AUTO-2026-AGT1', 'locked', now() - interval '20 days', now() - interval '14 days'),
  ('fa2a2a2a-2a2a-2a2a-2a2a-2a2a2a2a2a2a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Code Reviewers United', 'user_kevin_chen_006', 'CODE-2026-AGT2', 'locked', now() - interval '20 days', now() - interval '15 days'),
  ('fa3a3a3a-3a3a-3a3a-3a3a-3a3a3a3a3a3a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Research Collective', 'user_michelle_torres_007', 'RSRCH-2026-AGT3', 'locked', now() - interval '20 days', now() - interval '14 days'),
  ('fa4a4a4a-4a4a-4a4a-4a4a-4a4a4a4a4a4a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bug Hunters', 'user_ryan_obrien_008', 'DEBUG-2026-AGT4', 'locked', now() - interval '20 days', now() - interval '15 days'),
  -- Search & Discovery Hack teams
  ('fc1c1c1c-1c1c-1c1c-1c1c-1c1c1c1c1c1c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Doc Searchers', 'user_alex_kumar_009', 'DOCS-2026-SRC1', 'locked', now() - interval '35 days', now() - interval '31 days'),
  ('fc2c2c2c-2c2c-2c2c-2c2c-2c2c2c2c2c2c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Graph Explorers', 'user_sofia_rodriguez_010', 'GRAPH-2026-SRC2', 'locked', now() - interval '35 days', now() - interval '32 days'),
  ('fc3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Smart Shoppers', 'user_nina_patel_011', 'SHOP-2026-SRC3', 'locked', now() - interval '35 days', now() - interval '31 days'),
  ('fc4c4c4c-4c4c-4c4c-4c4c-4c4c4c4c4c4c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Legal Eagles', 'user_hannah_white_012', 'LEGAL-2026-SRC4', 'locked', now() - interval '35 days', now() - interval '32 days')
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- AGI HOUSE TEAMS
-- Depends on: hackathons, participants
-- ============================================================================

-- MCP Agents Hackathon — 5 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('a9f00001-a9f0-a9f0-a9f0-a9f00001a9f0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'Protocol Pioneers', 'user_seed_071', 'SEED-MCP-001', 'locked', now() - interval '36 days', now() - interval '23 days'),
  ('a9f00002-a9f0-a9f0-a9f0-a9f00002a9f0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'Server Syndicate', 'user_seed_074', 'SEED-MCP-002', 'locked', now() - interval '35 days', now() - interval '23 days'),
  ('a9f00003-a9f0-a9f0-a9f0-a9f00003a9f0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'Tool Smiths', 'user_seed_077', 'SEED-MCP-003', 'locked', now() - interval '34 days', now() - interval '23 days'),
  ('a9f00004-a9f0-a9f0-a9f0-a9f00004a9f0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'Context Crew', 'user_seed_080', 'SEED-MCP-004', 'locked', now() - interval '33 days', now() - interval '23 days'),
  ('a9f00005-a9f0-a9f0-a9f0-a9f00005a9f0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'Resource Runners', 'user_seed_083', 'SEED-MCP-005', 'locked', now() - interval '32 days', now() - interval '23 days')
ON CONFLICT (id) DO NOTHING;

-- GenAI Goes Local — 4 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('a9f00006-a9f0-a9f0-a9f0-a9f00006a9f0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'Edge Lords', 'user_seed_091', 'SEED-LOC-001', 'locked', now() - interval '56 days', now() - interval '44 days'),
  ('a9f00007-a9f0-a9f0-a9f0-a9f00007a9f0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'Quantized Minds', 'user_seed_094', 'SEED-LOC-002', 'locked', now() - interval '55 days', now() - interval '44 days'),
  ('a9f00008-a9f0-a9f0-a9f0-a9f00008a9f0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'On-Device AI', 'user_seed_097', 'SEED-LOC-003', 'locked', now() - interval '54 days', now() - interval '44 days'),
  ('a9f00009-a9f0-a9f0-a9f0-a9f00009a9f0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'Silicon Whisperers', 'user_seed_100', 'SEED-LOC-004', 'locked', now() - interval '53 days', now() - interval '44 days')
ON CONFLICT (id) DO NOTHING;

-- Generative UI Hackathon — 5 teams
INSERT INTO teams (id, hackathon_id, name, captain_clerk_user_id, invite_code, status, created_at, updated_at)
VALUES
  ('a9f0000a-a9f0-a9f0-a9f0-a9f0000aa9f0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'Pixel Wizards', 'user_seed_106', 'SEED-GUI-001', 'locked', now() - interval '76 days', now() - interval '65 days'),
  ('a9f0000b-a9f0-a9f0-a9f0-a9f0000ba9f0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'Layout Engine', 'user_seed_109', 'SEED-GUI-002', 'locked', now() - interval '75 days', now() - interval '65 days'),
  ('a9f0000c-a9f0-a9f0-a9f0-a9f0000ca9f0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'Component Factory', 'user_seed_112', 'SEED-GUI-003', 'locked', now() - interval '74 days', now() - interval '65 days'),
  ('a9f0000d-a9f0-a9f0-a9f0-a9f0000da9f0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'Render Rebels', 'user_seed_115', 'SEED-GUI-004', 'locked', now() - interval '73 days', now() - interval '65 days'),
  ('a9f0000e-a9f0-a9f0-a9f0-a9f0000ea9f0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'CSS Alchemists', 'user_seed_118', 'SEED-GUI-005', 'locked', now() - interval '72 days', now() - interval '65 days')
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- ASSIGN PARTICIPANTS TO TEAMS
-- Depends on: teams, participants
-- ============================================================================

-- AI Agents teams (3-4 members each, some solo participants remain unassigned)
UPDATE hackathon_participants SET team_id = '20012001-2001-2001-2001-200120012001' WHERE id IN ('10011001-1001-1001-1001-100110011001', '10021002-1002-1002-1002-100210021002', '10031003-1003-1003-1003-100310031003');
UPDATE hackathon_participants SET team_id = '20022002-2002-2002-2002-200220022002' WHERE id IN ('10041004-1004-1004-1004-100410041004', '10051005-1005-1005-1005-100510051005', '10061006-1006-1006-1006-100610061006');
UPDATE hackathon_participants SET team_id = '20032003-2003-2003-2003-200320032003' WHERE id IN ('10071007-1007-1007-1007-100710071007', '10081008-1008-1008-1008-100810081008', '10091009-1009-1009-1009-100910091009');
UPDATE hackathon_participants SET team_id = '20042004-2004-2004-2004-200420042004' WHERE id IN ('100a100a-100a-100a-100a-100a100a100a', '100b100b-100b-100b-100b-100b100b100b', '100c100c-100c-100c-100c-100c100c100c', '100d100d-100d-100d-100d-100d100d100d');
UPDATE hackathon_participants SET team_id = '20052005-2005-2005-2005-200520052005' WHERE id IN ('100e100e-100e-100e-100e-100e100e100e', '100f100f-100f-100f-100f-100f100f100f', '10101010-1010-1010-1010-101010101010');
UPDATE hackathon_participants SET team_id = '20062006-2006-2006-2006-200620062006' WHERE id IN ('10111011-1011-1011-1011-101110111011', '10121012-1012-1012-1012-101210121012', '10131013-1013-1013-1013-101310131013', '10141014-1014-1014-1014-101410141014');
UPDATE hackathon_participants SET team_id = '20072007-2007-2007-2007-200720072007' WHERE id IN ('10151015-1015-1015-1015-101510151015', '10161016-1016-1016-1016-101610161016', '10171017-1017-1017-1017-101710171017');
-- Participants 10181018..10191019 remain solo

-- Search & Discovery teams (2-3 members each, some solo)
UPDATE hackathon_participants SET team_id = '20082008-2008-2008-2008-200820082008' WHERE id IN ('101a101a-101a-101a-101a-101a101a101a', '101b101b-101b-101b-101b-101b101b101b', '101c101c-101c-101c-101c-101c101c101c');
UPDATE hackathon_participants SET team_id = '20092009-2009-2009-2009-200920092009' WHERE id IN ('101d101d-101d-101d-101d-101d101d101d', '101e101e-101e-101e-101e-101e101e101e', '101f101f-101f-101f-101f-101f101f101f');
UPDATE hackathon_participants SET team_id = '200a200a-200a-200a-200a-200a200a200a' WHERE id IN ('10201020-1020-1020-1020-102010201020', '10211021-1021-1021-1021-102110211021');
UPDATE hackathon_participants SET team_id = '200b200b-200b-200b-200b-200b200b200b' WHERE id IN ('10221022-1022-1022-1022-102210221022', '10231023-1023-1023-1023-102310231023', '10241024-1024-1024-1024-102410241024');
-- Participants 10251025..10281028 remain solo

-- AI Art teams (2-3 members each, some solo)
UPDATE hackathon_participants SET team_id = '200c200c-200c-200c-200c-200c200c200c' WHERE id IN ('10291029-1029-1029-1029-102910291029', '102a102a-102a-102a-102a-102a102a102a', '102b102b-102b-102b-102b-102b102b102b');
UPDATE hackathon_participants SET team_id = '200d200d-200d-200d-200d-200d200d200d' WHERE id IN ('102c102c-102c-102c-102c-102c102c102c', '102d102d-102d-102d-102d-102d102d102d', '102e102e-102e-102e-102e-102e102e102e');
UPDATE hackathon_participants SET team_id = '200e200e-200e-200e-200e-200e200e200e' WHERE id IN ('102f102f-102f-102f-102f-102f102f102f', '10301030-1030-1030-1030-103010301030', '10311031-1031-1031-1031-103110311031');
UPDATE hackathon_participants SET team_id = '200f200f-200f-200f-200f-200f200f200f' WHERE id IN ('10321032-1032-1032-1032-103210321032', '10331033-1033-1033-1033-103310331033');
UPDATE hackathon_participants SET team_id = '20102010-2010-2010-2010-201020102010' WHERE id IN ('10361036-1036-1036-1036-103610361036', '10371037-1037-1037-1037-103710371037');
-- Participants 10341034..10351035, 10381038..103a103a remain solo

-- ============================================================================
-- AGI HOUSE TEAM ASSIGNMENTS
-- ============================================================================

-- MCP Agents teams (3 members each, remaining are solo)
UPDATE hackathon_participants SET team_id = 'a9f00001-a9f0-a9f0-a9f0-a9f00001a9f0' WHERE id IN ('a9e00001-a9e0-a9e0-a9e0-a9e00001a9e0', 'a9e00002-a9e0-a9e0-a9e0-a9e00002a9e0', 'a9e00003-a9e0-a9e0-a9e0-a9e00003a9e0');
UPDATE hackathon_participants SET team_id = 'a9f00002-a9f0-a9f0-a9f0-a9f00002a9f0' WHERE id IN ('a9e00004-a9e0-a9e0-a9e0-a9e00004a9e0', 'a9e00005-a9e0-a9e0-a9e0-a9e00005a9e0', 'a9e00006-a9e0-a9e0-a9e0-a9e00006a9e0');
UPDATE hackathon_participants SET team_id = 'a9f00003-a9f0-a9f0-a9f0-a9f00003a9f0' WHERE id IN ('a9e00007-a9e0-a9e0-a9e0-a9e00007a9e0', 'a9e00008-a9e0-a9e0-a9e0-a9e00008a9e0', 'a9e00009-a9e0-a9e0-a9e0-a9e00009a9e0');
UPDATE hackathon_participants SET team_id = 'a9f00004-a9f0-a9f0-a9f0-a9f00004a9f0' WHERE id IN ('a9e0000a-a9e0-a9e0-a9e0-a9e0000aa9e0', 'a9e0000b-a9e0-a9e0-a9e0-a9e0000ba9e0', 'a9e0000c-a9e0-a9e0-a9e0-a9e0000ca9e0', 'a9e0000d-a9e0-a9e0-a9e0-a9e0000da9e0');
UPDATE hackathon_participants SET team_id = 'a9f00005-a9f0-a9f0-a9f0-a9f00005a9f0' WHERE id IN ('a9e0000e-a9e0-a9e0-a9e0-a9e0000ea9e0', 'a9e0000f-a9e0-a9e0-a9e0-a9e0000fa9e0', 'a9e00010-a9e0-a9e0-a9e0-a9e00010a9e0');
-- Participants a9e00011..a9e00014 remain solo

-- GenAI Goes Local teams (3 members each, remaining are solo)
UPDATE hackathon_participants SET team_id = 'a9f00006-a9f0-a9f0-a9f0-a9f00006a9f0' WHERE id IN ('a9e00015-a9e0-a9e0-a9e0-a9e00015a9e0', 'a9e00016-a9e0-a9e0-a9e0-a9e00016a9e0', 'a9e00017-a9e0-a9e0-a9e0-a9e00017a9e0');
UPDATE hackathon_participants SET team_id = 'a9f00007-a9f0-a9f0-a9f0-a9f00007a9f0' WHERE id IN ('a9e00018-a9e0-a9e0-a9e0-a9e00018a9e0', 'a9e00019-a9e0-a9e0-a9e0-a9e00019a9e0', 'a9e0001a-a9e0-a9e0-a9e0-a9e0001aa9e0');
UPDATE hackathon_participants SET team_id = 'a9f00008-a9f0-a9f0-a9f0-a9f00008a9f0' WHERE id IN ('a9e0001b-a9e0-a9e0-a9e0-a9e0001ba9e0', 'a9e0001c-a9e0-a9e0-a9e0-a9e0001ca9e0', 'a9e0001d-a9e0-a9e0-a9e0-a9e0001da9e0');
UPDATE hackathon_participants SET team_id = 'a9f00009-a9f0-a9f0-a9f0-a9f00009a9f0' WHERE id IN ('a9e0001e-a9e0-a9e0-a9e0-a9e0001ea9e0', 'a9e0001f-a9e0-a9e0-a9e0-a9e0001fa9e0', 'a9e00020-a9e0-a9e0-a9e0-a9e00020a9e0');
-- Participants a9e00021..a9e00023 remain solo

-- Generative UI teams (3 members each, remaining are solo)
UPDATE hackathon_participants SET team_id = 'a9f0000a-a9f0-a9f0-a9f0-a9f0000aa9f0' WHERE id IN ('a9e00025-a9e0-a9e0-a9e0-a9e00025a9e0', 'a9e00026-a9e0-a9e0-a9e0-a9e00026a9e0', 'a9e00027-a9e0-a9e0-a9e0-a9e00027a9e0');
UPDATE hackathon_participants SET team_id = 'a9f0000b-a9f0-a9f0-a9f0-a9f0000ba9f0' WHERE id IN ('a9e00028-a9e0-a9e0-a9e0-a9e00028a9e0', 'a9e00029-a9e0-a9e0-a9e0-a9e00029a9e0', 'a9e0002a-a9e0-a9e0-a9e0-a9e0002aa9e0');
UPDATE hackathon_participants SET team_id = 'a9f0000c-a9f0-a9f0-a9f0-a9f0000ca9f0' WHERE id IN ('a9e0002b-a9e0-a9e0-a9e0-a9e0002ba9e0', 'a9e0002c-a9e0-a9e0-a9e0-a9e0002ca9e0', 'a9e0002d-a9e0-a9e0-a9e0-a9e0002da9e0');
UPDATE hackathon_participants SET team_id = 'a9f0000d-a9f0-a9f0-a9f0-a9f0000da9f0' WHERE id IN ('a9e0002e-a9e0-a9e0-a9e0-a9e0002ea9e0', 'a9e0002f-a9e0-a9e0-a9e0-a9e0002fa9e0', 'a9e00030-a9e0-a9e0-a9e0-a9e00030a9e0');
UPDATE hackathon_participants SET team_id = 'a9f0000e-a9f0-a9f0-a9f0-a9f0000ea9f0' WHERE id IN ('a9e00031-a9e0-a9e0-a9e0-a9e00031a9e0', 'a9e00032-a9e0-a9e0-a9e0-a9e00032a9e0');
-- Dev user (a9e00024) and participants a9e00033..a9e00036 remain solo
-- ============================================================================
-- SUBMISSIONS - AI AGENTS 2026 (completed)
-- 18 submissions (7 team + 11 solo), all 'submitted'
-- Depends on: hackathons, participants, teams
-- ============================================================================

INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  -- Team submissions
  ('30013001-3001-3001-3001-300130013001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20012001-2001-2001-2001-200120012001',
   'AgentOS', 'A modular operating system for orchestrating multi-agent workflows with automatic task decomposition and parallel execution.',
   'https://github.com/seed/agent-os', 'https://agent-os.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30023002-3002-3002-3002-300230023002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20022002-2002-2002-2002-200220022002',
   'DebugBot', 'An AI agent that reads stack traces, reproduces bugs in sandboxed environments, and proposes verified fixes with test cases.',
   'https://github.com/seed/debugbot', NULL, 'https://youtube.com/watch?v=seed_debugbot',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30033003-3003-3003-3003-300330033003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20032003-2003-2003-2003-200320032003',
   'MarketMind', 'Autonomous market research agent that monitors competitor activity, synthesizes reports, and surfaces actionable insights.',
   'https://github.com/seed/marketmind', 'https://marketmind.demo.dev', 'https://youtube.com/watch?v=seed_marketmind',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30043004-3004-3004-3004-300430043004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20042004-2004-2004-2004-200420042004',
   'SwarmDeploy', 'Multi-agent deployment system where specialized agents handle CI, testing, security scanning, and rollout coordination.',
   'https://github.com/seed/swarmdeploy', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30053005-3005-3005-3005-300530053005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20052005-2005-2005-2005-200520052005',
   'MeetingPilot', 'Agent that joins video calls, takes structured notes, extracts action items, and files follow-up tasks in project management tools.',
   'https://github.com/seed/meetingpilot', 'https://meetingpilot.demo.dev', 'https://youtube.com/watch?v=seed_meetingpilot',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30063006-3006-3006-3006-300630063006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20062006-2006-2006-2006-200620062006',
   'CodeReviewAgent', 'Automated pull request reviewer that identifies bugs, security issues, and style violations with inline suggestions.',
   'https://github.com/seed/codereview-agent', NULL, 'https://youtube.com/watch?v=seed_codereview',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30073007-3007-3007-3007-300730073007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, '20072007-2007-2007-2007-200720072007',
   'DataPipelineAgent', 'Self-healing ETL agent that monitors data pipelines, detects anomalies, and auto-remediates common failures.',
   'https://github.com/seed/datapipeline-agent', 'https://datapipeline.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  -- Solo submissions
  ('30083008-3008-3008-3008-300830083008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10181018-1018-1018-1018-101810181018', NULL,
   'ResearchRadar', 'Personal research assistant that monitors arXiv, filters papers by relevance, and generates weekly digest summaries.',
   'https://github.com/seed/research-radar', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30093009-3009-3009-3009-300930093009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10191019-1019-1019-1019-101910191019', NULL,
   'PromptForge', 'Interactive prompt engineering workbench with version control, A/B testing, and automated evaluation metrics.',
   'https://github.com/seed/promptforge', 'https://promptforge.demo.dev', 'https://youtube.com/watch?v=seed_promptforge',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  -- Dev user submission (for testing Edit Submission flow)
  ('300a300a-300a-300a-300a-300a300a300a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', NULL,
   'TaskWeaver', 'An AI task orchestrator that breaks down complex goals into executable sub-tasks and coordinates multiple tool-use agents.',
   'https://github.com/seed/taskweaver', 'https://taskweaver.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  -- Additional solo submissions
  ('30293029-3029-3029-3029-302930293029', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10481048-1048-1048-1048-104810481048', NULL,
   'DocuAgent', 'AI agent that reads codebases, generates comprehensive documentation, and keeps docs in sync with code changes.',
   'https://github.com/seed/docuagent', 'https://docuagent.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302a302a-302a-302a-302a-302a302a302a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10491049-1049-1049-1049-104910491049', NULL,
   'InboxZero', 'Email triage agent that categorizes, summarizes, and drafts responses with configurable persona and priorities.',
   'https://github.com/seed/inboxzero', NULL, 'https://youtube.com/watch?v=seed_inboxzero',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302b302b-302b-302b-302b-302b302b302b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104a104a-104a-104a-104a-104a104a104a', NULL,
   'TravelPlanner AI', 'Trip planning agent that searches flights, hotels, and activities then builds optimized itineraries with budget tracking.',
   'https://github.com/seed/travelplanner', 'https://travelplanner.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302c302c-302c-302c-302c-302c302c302c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104b104b-104b-104b-104b-104b104b104b', NULL,
   'SQLAgent', 'Natural language to SQL agent with schema understanding, query optimization, and result visualization.',
   'https://github.com/seed/sqlagent', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302d302d-302d-302d-302d-302d302d302d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104c104c-104c-104c-104c-104c104c104c', NULL,
   'APIScout', 'Agent that discovers, tests, and integrates third-party APIs by reading documentation and generating client code.',
   'https://github.com/seed/apiscout', 'https://apiscout.demo.dev', 'https://youtube.com/watch?v=seed_apiscout',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302e302e-302e-302e-302e-302e302e302e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104d104d-104d-104d-104d-104d104d104d', NULL,
   'HealthBot', 'Personal wellness agent that tracks habits, suggests exercises, and provides evidence-based nutrition guidance.',
   'https://github.com/seed/healthbot', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('302f302f-302f-302f-302f-302f302f302f', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104e104e-104e-104e-104e-104e104e104e', NULL,
   'ContractReview', 'Legal document analysis agent that highlights risks, missing clauses, and suggests standardized alternatives.',
   'https://github.com/seed/contractreview', 'https://contractreview.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days'),

  ('30303030-3030-3030-3030-303030303030', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '104f104f-104f-104f-104f-104f104f104f', NULL,
   'GitAssist', 'Commit message and PR description generator that analyzes diffs and follows repository conventions.',
   'https://github.com/seed/gitassist', NULL, 'https://youtube.com/watch?v=seed_gitassist',
   'submitted', '{}'::jsonb, now() - interval '15 days', now() - interval '14 days')
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- SUBMISSIONS - SEARCH & DISCOVERY (completed)
-- 15 submissions (4 team + 11 solo), all 'submitted'
-- Depends on: hackathons, participants, teams
-- ============================================================================

INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  -- Team submissions
  ('300b300b-300b-300b-300b-300b300b300b', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, '20082008-2008-2008-2008-200820082008',
   'SemanticExplorer', 'Visual knowledge graph explorer with natural language queries, powered by Tavily search and embedding-based clustering.',
   'https://github.com/seed/semantic-explorer', 'https://semantic-explorer.demo.dev', 'https://youtube.com/watch?v=seed_semexplore',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('300c300c-300c-300c-300c-300c300c300c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, '20092009-2009-2009-2009-200920092009',
   'ContextFinder', 'Developer documentation search that understands code context and returns relevant examples from across multiple frameworks.',
   'https://github.com/seed/contextfinder', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('300d300d-300d-300d-300d-300d300d300d', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, '200a200a-200a-200a-200a-200a200a200a',
   'NewsDigest AI', 'Real-time news aggregator that clusters stories by topic, identifies primary sources, and detects narrative bias.',
   'https://github.com/seed/newsdigest-ai', 'https://newsdigest.demo.dev', 'https://youtube.com/watch?v=seed_newsdigest',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('300e300e-300e-300e-300e-300e300e300e', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, '200b200b-200b-200b-200b-200b200b200b',
   'PatentScout', 'Patent prior-art search tool that matches inventions to existing patents using semantic similarity and citation graph analysis.',
   'https://github.com/seed/patentscout', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  -- Solo submissions
  ('300f300f-300f-300f-300f-300f300f300f', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10251025-1025-1025-1025-102510251025', NULL,
   'RecipeSearch', 'Ingredient-aware recipe finder that suggests meals based on what you have, dietary restrictions, and cooking skill level.',
   'https://github.com/seed/recipesearch', 'https://recipesearch.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30103010-3010-3010-3010-301030103010', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10261026-1026-1026-1026-102610261026', NULL,
   'LegalSearch', 'Case law search engine using semantic embedding and citation network analysis to find relevant legal precedents.',
   'https://github.com/seed/legalsearch', NULL, 'https://youtube.com/watch?v=seed_legalsearch',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30113011-3011-3011-3011-301130113011', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10271027-1027-1027-1027-102710271027', NULL,
   'CodebaseNavigator', 'Semantic code search across polyglot repositories with natural language queries and dependency-aware ranking.',
   'https://github.com/seed/codebase-navigator', 'https://codenav.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30123012-3012-3012-3012-301230123012', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10281028-1028-1028-1028-102810281028', NULL,
   'PaperTrail', 'Academic paper recommendation engine with citation-aware search and collaborative filtering across research domains.',
   'https://github.com/seed/papertrail', NULL, 'https://youtube.com/watch?v=seed_papertrail',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  -- Additional solo submissions
  ('30313031-3031-3031-3031-303130313031', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10501050-1050-1050-1050-105010501050', NULL,
   'ProductHunt AI', 'Product discovery engine that matches user needs to tools and SaaS products using semantic similarity and reviews.',
   'https://github.com/seed/producthunt-ai', 'https://producthunt-ai.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30323032-3032-3032-3032-303230323032', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10511051-1051-1051-1051-105110511051', NULL,
   'TalentMatch', 'Resume-to-job matching engine using skill extraction, experience weighting, and culture-fit scoring.',
   'https://github.com/seed/talentmatch', NULL, 'https://youtube.com/watch?v=seed_talentmatch',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30333033-3033-3033-3033-303330333033', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10521052-1052-1052-1052-105210521052', NULL,
   'MusicDiscover', 'Music recommendation engine that understands mood, activity context, and listening history to suggest tracks.',
   'https://github.com/seed/musicdiscover', 'https://musicdiscover.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30343034-3034-3034-3034-303430343034', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10531053-1053-1053-1053-105310531053', NULL,
   'StackOverflow++', 'Enhanced code Q&A search that synthesizes answers from multiple sources and validates code snippets.',
   'https://github.com/seed/stackoverflow-plus', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30353035-3035-3035-3035-303530353035', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10541054-1054-1054-1054-105410541054', NULL,
   'EventRadar', 'Local event discovery platform using NLP to extract events from social media, newsletters, and community boards.',
   'https://github.com/seed/eventradar', 'https://eventradar.demo.dev', 'https://youtube.com/watch?v=seed_eventradar',
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days'),

  ('30363036-3036-3036-3036-303630363036', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '10551055-1055-1055-1055-105510551055', NULL,
   'DatasetFinder', 'ML dataset search engine that matches research questions to relevant open datasets with quality and recency scoring.',
   'https://github.com/seed/datasetfinder', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '32 days', now() - interval '31 days')
ON CONFLICT (id) DO NOTHING;
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
-- ============================================================================
-- SUBMISSIONS - PUBLISHED HACKATHONS (draft status)
-- Climate Tech, AI Safety Jam, AGI Innovation Summit
-- Depends on: hackathons, participants
-- ============================================================================

-- Climate Tech (published) — 4 submissions, all 'draft'
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('301e301e-301e-301e-301e-301e301e301e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '103b103b-103b-103b-103b-103b103b103b', NULL,
   'CarbonLens', 'Supply chain carbon footprint analyzer using satellite imagery and shipping data to track emissions.',
   'https://github.com/seed/carbonlens', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '2 days', now() - interval '1 day'),

  ('301f301f-301f-301f-301f-301f301f301f', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '103c103c-103c-103c-103c-103c103c103c', NULL,
   'GridOptimizer', 'ML model for optimizing renewable energy grid distribution based on weather forecasts and demand patterns.',
   'https://github.com/seed/gridoptimizer', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '2 days', now() - interval '1 day'),

  ('30203020-3020-3020-3020-302030203020', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '103d103d-103d-103d-103d-103d103d103d', NULL,
   'WasteWise', 'Computer vision waste sorting assistant for municipalities with contamination detection and recycling optimization.',
   'https://github.com/seed/wastewise', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now() - interval '1 day'),

  ('30213021-3021-3021-3021-302130213021', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '103e103e-103e-103e-103e-103e103e103e', NULL,
   'EcoRoute', 'Carbon-aware route planner for logistics fleets that optimizes delivery paths for both speed and emissions.',
   'https://github.com/seed/ecoroute', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now())
ON CONFLICT (id) DO NOTHING;

-- AI Safety Jam (published) — 4 submissions, all 'draft'
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('30223022-3022-3022-3022-302230223022', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '103f103f-103f-103f-103f-103f103f103f', NULL,
   'HalluciGuard', 'Hallucination detection layer for LLM outputs using cross-referencing and confidence calibration.',
   'https://github.com/seed/halluciguard', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now()),

  ('30233023-3023-3023-3023-302330233023', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '10411041-1041-1041-1041-104110411041', NULL,
   'BiasAudit', 'Automated fairness testing framework that probes LLMs for demographic bias across multiple dimensions.',
   'https://github.com/seed/biasaudit', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now()),

  ('30243024-3024-3024-3024-302430243024', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '10421042-1042-1042-1042-104210421042', NULL,
   'SafePrompt', 'Prompt injection detection and sanitization library for production LLM applications.',
   'https://github.com/seed/safeprompt', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now()),

  ('30253025-3025-3025-3025-302530253025', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '10431043-1043-1043-1043-104310431043', NULL,
   'AlignBench', 'Benchmark suite for evaluating AI alignment across instruction following, refusal, and value consistency.',
   'https://github.com/seed/alignbench', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now())
ON CONFLICT (id) DO NOTHING;

-- AGI Innovation Summit (published) — 3 submissions, all 'draft'
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('30263026-3026-3026-3026-302630263026', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '10441044-1044-1044-1044-104410441044', NULL,
   'ReasonChain', 'Multi-step reasoning framework that chains specialized models for complex problem decomposition.',
   'https://github.com/seed/reasonchain', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now()),

  ('30273027-3027-3027-3027-302730273027', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '10451045-1045-1045-1045-104510451045', NULL,
   'MemoryGraph', 'Long-term memory system for LLMs using dynamic knowledge graphs with episodic and semantic memory layers.',
   'https://github.com/seed/memorygraph', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now()),

  ('30283028-3028-3028-3028-302830283028', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '10461046-1046-1046-1046-104610461046', NULL,
   'WorldSim', 'Lightweight world model simulator for testing agent decision-making in procedurally generated environments.',
   'https://github.com/seed/worldsim', NULL, NULL,
   'draft', '{}'::jsonb, now() - interval '1 day', now())
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- SUBMISSIONS - AGI HOUSE HACKATHONS (completed)
-- MCP Agents, GenAI Goes Local, Generative UI
-- Depends on: hackathons, participants, teams
-- ============================================================================

-- MCP Agents Hackathon (completed) — 5 team + 8 solo = 13 submissions
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('a9a00001-a9a0-a9a0-a9a0-a9a00001a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', NULL, 'a9f00001-a9f0-a9f0-a9f0-a9f00001a9f0',
   'MCP Gateway', 'Universal MCP server gateway that aggregates multiple tool servers behind a single endpoint with load balancing, caching, and access control. Supports hot-reloading server configs.',
   'https://github.com/seed/mcp-gateway', 'https://mcp-gateway.demo.dev', 'https://youtube.com/watch?v=seed_mcpgateway',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00002-a9a0-a9a0-a9a0-a9a00002a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', NULL, 'a9f00002-a9f0-a9f0-a9f0-a9f00002a9f0',
   'MCPilot', 'Autonomous coding agent that chains MCP tool servers for file editing, terminal commands, and browser testing to complete full development tasks from issue descriptions.',
   'https://github.com/seed/mcpilot', NULL, 'https://youtube.com/watch?v=seed_mcpilot',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00003-a9a0-a9a0-a9a0-a9a00003a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', NULL, 'a9f00003-a9f0-a9f0-a9f0-a9f00003a9f0',
   'DataBridge MCP', 'MCP server that connects LLMs to live database schemas, enabling natural language queries across Postgres, MySQL, and MongoDB with automatic SQL generation and result formatting.',
   'https://github.com/seed/databridge-mcp', 'https://databridge.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00004-a9a0-a9a0-a9a0-a9a00004a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', NULL, 'a9f00004-a9f0-a9f0-a9f0-a9f00004a9f0',
   'MCP Observatory', 'Real-time monitoring dashboard for MCP server fleets with request tracing, latency metrics, error tracking, and automatic anomaly detection across tool calls.',
   'https://github.com/seed/mcp-observatory', 'https://mcp-observatory.demo.dev', 'https://youtube.com/watch?v=seed_mcpobs',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00005-a9a0-a9a0-a9a0-a9a00005a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', NULL, 'a9f00005-a9f0-a9f0-a9f0-a9f00005a9f0',
   'MCP Marketplace', 'Community marketplace for discovering, sharing, and installing MCP tool servers with one-click setup, ratings, and compatibility checking.',
   'https://github.com/seed/mcp-marketplace', 'https://mcp-marketplace.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00006-a9a0-a9a0-a9a0-a9a00006a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e00011-a9e0-a9e0-a9e0-a9e00011a9e0', NULL,
   'MCP Debugger', 'Interactive debugger for MCP tool servers that lets you step through tool calls, inspect payloads, mock responses, and replay conversations for testing.',
   'https://github.com/seed/mcp-debugger', NULL, 'https://youtube.com/watch?v=seed_mcpdebug',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00007-a9a0-a9a0-a9a0-a9a00007a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e00012-a9e0-a9e0-a9e0-a9e00012a9e0', NULL,
   'GitMCP', 'MCP server that wraps git operations with semantic understanding — review PRs, resolve conflicts, generate changelogs, and manage releases through natural language.',
   'https://github.com/seed/gitmcp', 'https://gitmcp.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00008-a9a0-a9a0-a9a0-a9a00008a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e00013-a9e0-a9e0-a9e0-a9e00013a9e0', NULL,
   'BrowserMCP', 'Headless browser automation MCP server for web scraping, testing, and interaction with full JavaScript rendering and screenshot capture.',
   'https://github.com/seed/browsermcp', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a00009-a9a0-a9a0-a9a0-a9a00009a9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e00014-a9e0-a9e0-a9e0-a9e00014a9e0', NULL,
   'SlackMCP', 'MCP server for Slack workspace management — search messages, summarize channels, draft replies, and manage notifications through tool calls.',
   'https://github.com/seed/slackmcp', NULL, 'https://youtube.com/watch?v=seed_slackmcp',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a0000a-a9a0-a9a0-a9a0-a9a0000aa9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9d90001-a9d9-a9d9-a9d9-a9d90001a9d9', NULL,
   'MCP Compose', 'Docker-compose-style orchestration for MCP servers — define multi-server environments in YAML, manage dependencies, and spin up complete tool ecosystems.',
   'https://github.com/seed/mcp-compose', 'https://mcp-compose.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a0000b-a9a0-a9a0-a9a0-a9a0000ba9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e0000a-a9e0-a9e0-a9e0-a9e0000aa9e0', NULL,
   'CalendarMCP', 'MCP server for Google Calendar that schedules meetings, finds optimal times across attendees, and manages event conflicts with natural language.',
   'https://github.com/seed/calendarmcp', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a0000c-a9a0-a9a0-a9a0-a9a0000ca9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e0000d-a9e0-a9e0-a9e0-a9e0000da9e0', NULL,
   'DesignMCP', 'Figma-integrated MCP server that converts design tokens to code, generates component variations, and syncs design changes with code repositories.',
   'https://github.com/seed/designmcp', 'https://designmcp.demo.dev', 'https://youtube.com/watch?v=seed_designmcp',
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a9a0000d-a9a0-a9a0-a9a0-a9a0000da9a0', 'aaa10001-aaa1-aaa1-aaa1-aaa10001aaa1', 'a9e00010-a9e0-a9e0-a9e0-a9e00010a9e0', NULL,
   'CICD-MCP', 'MCP server for CI/CD pipelines — trigger builds, check statuses, read logs, and manage deployments across GitHub Actions, GitLab CI, and Jenkins.',
   'https://github.com/seed/cicd-mcp', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '22 days', now() - interval '22 days')
ON CONFLICT (id) DO NOTHING;

-- GenAI Goes Local (completed) — 4 team + 6 solo = 10 submissions
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('a9a00010-a9a0-a9a0-a9a0-a9a00010a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', NULL, 'a9f00006-a9f0-a9f0-a9f0-a9f00006a9f0',
   'TinyChat', 'Fully offline chat assistant running quantized Llama 3 on consumer GPUs with 4-bit GPTQ, streaming responses under 200ms first-token latency on an RTX 3060.',
   'https://github.com/seed/tinychat', 'https://tinychat.demo.dev', 'https://youtube.com/watch?v=seed_tinychat',
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00011-a9a0-a9a0-a9a0-a9a00011a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', NULL, 'a9f00007-a9f0-a9f0-a9f0-a9f00007a9f0',
   'WhisperLocal', 'Real-time speech-to-text running Whisper on-device with speaker diarization, punctuation restoration, and live subtitle overlay for any application.',
   'https://github.com/seed/whisperlocal', NULL, 'https://youtube.com/watch?v=seed_whisperlocal',
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00012-a9a0-a9a0-a9a0-a9a00012a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', NULL, 'a9f00008-a9f0-a9f0-a9f0-a9f00008a9f0',
   'OfflineTranslate', 'Privacy-first translation app running NLLB-200 locally with support for 50+ languages, document batch processing, and a macOS menu bar interface.',
   'https://github.com/seed/offline-translate', 'https://offline-translate.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00013-a9a0-a9a0-a9a0-a9a00013a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', NULL, 'a9f00009-a9f0-a9f0-a9f0-a9f00009a9f0',
   'VisionEdge', 'On-device object detection and scene understanding pipeline using quantized YOLOv8 + CLIP for real-time camera analysis without cloud dependencies.',
   'https://github.com/seed/visionedge', NULL, 'https://youtube.com/watch?v=seed_visionedge',
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00014-a9a0-a9a0-a9a0-a9a00014a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9e00021-a9e0-a9e0-a9e0-a9e00021a9e0', NULL,
   'LocalRAG', 'Completely offline RAG pipeline with local embeddings, vector store, and inference — index documents and ask questions without any network access.',
   'https://github.com/seed/localrag', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00015-a9a0-a9a0-a9a0-a9a00015a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9e00022-a9e0-a9e0-a9e0-a9e00022a9e0', NULL,
   'CodeComplete Local', 'VS Code extension providing Copilot-style code completions using a local 7B parameter model with intelligent context windowing and 50ms latency.',
   'https://github.com/seed/codecomplete-local', NULL, 'https://youtube.com/watch?v=seed_codecomplete',
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00016-a9a0-a9a0-a9a0-a9a00016a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9e00023-a9e0-a9e0-a9e0-a9e00023a9e0', NULL,
   'MailSense', 'Local email classifier and summarizer that processes your inbox on-device, categorizes messages, and drafts responses without sending data to any cloud service.',
   'https://github.com/seed/mailsense', 'https://mailsense.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00017-a9a0-a9a0-a9a0-a9a00017a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9d90002-a9d9-a9d9-a9d9-a9d90002a9d9', NULL,
   'PhotoTag Local', 'On-device photo organizer using local vision models for auto-tagging, face clustering, and natural language photo search across your library.',
   'https://github.com/seed/phototag-local', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00018-a9a0-a9a0-a9a0-a9a00018a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9e0001e-a9e0-a9e0-a9e0-a9e0001ea9e0', NULL,
   'EdgeSummarizer', 'Browser extension that summarizes web pages, PDFs, and articles using a local language model — no data leaves your machine.',
   'https://github.com/seed/edge-summarizer', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days'),

  ('a9a00019-a9a0-a9a0-a9a0-a9a00019a9a0', 'aaa20002-aaa2-aaa2-aaa2-aaa20002aaa2', 'a9e00020-a9e0-a9e0-a9e0-a9e00020a9e0', NULL,
   'NotesMind', 'Local-first smart notes app with on-device semantic search, auto-linking between notes, and AI-generated summaries powered by a quantized Phi-3 model.',
   'https://github.com/seed/notesmind', 'https://notesmind.demo.dev', 'https://youtube.com/watch?v=seed_notesmind',
   'submitted', '{}'::jsonb, now() - interval '43 days', now() - interval '43 days')
ON CONFLICT (id) DO NOTHING;

-- Generative UI Hackathon (completed) — 5 team + 7 solo = 12 submissions
INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  ('a9a00020-a9a0-a9a0-a9a0-a9a00020a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', NULL, 'a9f0000a-a9f0-a9f0-a9f0-a9f0000aa9f0',
   'UIForge', 'AI-powered design system that generates complete, accessible React component libraries from brand guidelines and wireframe sketches.',
   'https://github.com/seed/uiforge', 'https://uiforge.demo.dev', 'https://youtube.com/watch?v=seed_uiforge',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00021-a9a0-a9a0-a9a0-a9a00021a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', NULL, 'a9f0000b-a9f0-a9f0-a9f0-a9f0000ba9f0',
   'ChatUI Kit', 'Conversational interface framework where AI responses render as rich, interactive components — charts, forms, carousels, and maps instead of plain text.',
   'https://github.com/seed/chatui-kit', 'https://chatui-kit.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00022-a9a0-a9a0-a9a0-a9a00022a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', NULL, 'a9f0000c-a9f0-a9f0-a9f0-a9f0000ca9f0',
   'AdaptiveLayout', 'AI layout engine that dynamically rearranges page components based on user behavior, screen size, and content priority scores in real-time.',
   'https://github.com/seed/adaptive-layout', NULL, 'https://youtube.com/watch?v=seed_adaptlayout',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00023-a9a0-a9a0-a9a0-a9a00023a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', NULL, 'a9f0000d-a9f0-a9f0-a9f0-a9f0000da9f0',
   'FormGenius', 'Intelligent form builder that generates multi-step forms from natural language descriptions with validation rules, conditional logic, and accessibility baked in.',
   'https://github.com/seed/formgenius', 'https://formgenius.demo.dev', 'https://youtube.com/watch?v=seed_formgenius',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00024-a9a0-a9a0-a9a0-a9a00024a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', NULL, 'a9f0000e-a9f0-a9f0-a9f0-a9f0000ea9f0',
   'ThemeAlchemy', 'Real-time theming engine where users describe their preferred aesthetic in natural language and the AI generates complete design tokens, animations, and component variants.',
   'https://github.com/seed/theme-alchemy', 'https://themealchemy.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00025-a9a0-a9a0-a9a0-a9a00025a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00033-a9e0-a9e0-a9e0-a9e00033a9e0', NULL,
   'DashGen', 'Generates complete admin dashboards from database schemas — tables, charts, filters, and CRUD forms all created automatically with customizable templates.',
   'https://github.com/seed/dashgen', 'https://dashgen.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00026-a9a0-a9a0-a9a0-a9a00026a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00034-a9e0-a9e0-a9e0-a9e00034a9e0', NULL,
   'SketchToCode', 'Converts hand-drawn wireframe sketches to production-ready React and Tailwind components using vision models and code generation.',
   'https://github.com/seed/sketch-to-code', NULL, 'https://youtube.com/watch?v=seed_sketchcode',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00027-a9a0-a9a0-a9a0-a9a00027a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00035-a9e0-a9e0-a9e0-a9e00035a9e0', NULL,
   'EmailCraft', 'AI email template builder that generates responsive HTML emails from text descriptions with inline styles, dark mode support, and client compatibility testing.',
   'https://github.com/seed/emailcraft', 'https://emailcraft.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00028-a9a0-a9a0-a9a0-a9a00028a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00036-a9e0-a9e0-a9e0-a9e00036a9e0', NULL,
   'AnimateAI', 'CSS animation generator that creates complex keyframe animations, transitions, and micro-interactions from natural language descriptions.',
   'https://github.com/seed/animate-ai', NULL, 'https://youtube.com/watch?v=seed_animateai',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a00029-a9a0-a9a0-a9a0-a9a00029a9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00024-a9e0-a9e0-a9e0-a9e00024a9e0', NULL,
   'VoiceUI Builder', 'Generates voice-controlled interfaces — speak your intent and watch components assemble on screen with voice navigation, form filling, and accessibility.',
   'https://github.com/seed/voiceui-builder', 'https://voiceui.demo.dev', 'https://youtube.com/watch?v=seed_voiceui',
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a0002a-a9a0-a9a0-a9a0-a9a0002aa9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e0002e-a9e0-a9e0-a9e0-a9e0002ea9e0', NULL,
   'DataVizGen', 'Chart and data visualization generator that creates interactive D3.js visualizations from datasets and natural language descriptions of desired insights.',
   'https://github.com/seed/datavizgen', 'https://datavizgen.demo.dev', NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days'),

  ('a9a0002b-a9a0-a9a0-a9a0-a9a0002ba9a0', 'aaa30003-aaa3-aaa3-aaa3-aaa30003aaa3', 'a9e00030-a9e0-a9e0-a9e0-a9e00030a9e0', NULL,
   'LandingAI', 'One-prompt landing page generator that creates fully responsive marketing pages with hero sections, testimonials, pricing tables, and CTAs.',
   'https://github.com/seed/landingai', NULL, NULL,
   'submitted', '{}'::jsonb, now() - interval '64 days', now() - interval '64 days')
ON CONFLICT (id) DO NOTHING;
-- ============================================================================
-- PROJECT SUBMISSIONS (For completed hackathons with detailed metadata)
-- Depends on: hackathons, teams
-- ============================================================================

INSERT INTO submissions (id, hackathon_id, participant_id, team_id, title, description, github_url, live_app_url, demo_video_url, status, metadata, created_at, updated_at)
VALUES
  (
    '51515151-5151-5151-5151-515151515151',
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    NULL,
    'e1010101-0101-0101-0101-010101010101',
    'Synesthesia Canvas',
    'An AI-powered art generator that transforms music into visual art in real-time. Users can upload or stream any song, and our model analyzes tempo, mood, instrumentation, and harmonic structure to generate a corresponding abstract painting. Each song produces a unique, shareable artwork.',
    'https://github.com/example/synesthesia-canvas',
    'https://synesthesia-canvas.demo.com',
    'https://youtube.com/watch?v=demo1',
    'submitted',
    '{"category": "interactive_media", "tools": ["Stable Diffusion", "Spotify API", "WebGL"], "team_members": ["Alice Chen", "Bob Martinez"]}'::jsonb,
    now() - interval '60 days',
    now() - interval '58 days'
  ),
  (
    '52525252-5252-5252-5252-525252525252',
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    NULL,
    'e2020202-0202-0202-0202-020202020202',
    'Poetic Lens',
    'An AI camera app that generates haiku poetry inspired by photos you take. Point your camera at anything - a sunset, a cup of coffee, a busy street - and our fine-tuned LLM creates a unique haiku capturing the essence of the moment. Supports 12 languages.',
    'https://github.com/example/poetic-lens',
    'https://poetic-lens.app',
    'https://youtube.com/watch?v=demo2',
    'submitted',
    '{"category": "writing", "tools": ["Claude API", "React Native", "Vision API"], "team_members": ["Maya Patel"]}'::jsonb,
    now() - interval '61 days',
    now() - interval '59 days'
  ),
  (
    '53535353-5353-5353-5353-535353535353',
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    NULL,
    'e3030303-0303-0303-0303-030303030303',
    'NeuralBeats Studio',
    'A collaborative music composition tool where humans and AI jam together. Play a melody, and the AI responds with harmonies, counter-melodies, or rhythmic accompaniment in your chosen genre. Export finished tracks as MIDI or audio files.',
    'https://github.com/example/neuralbeats-studio',
    'https://neuralbeats.studio',
    'https://youtube.com/watch?v=demo3',
    'submitted',
    '{"category": "music", "tools": ["Magenta.js", "Web Audio API", "TensorFlow.js"], "team_members": ["James Wilson", "Sarah Kim", "Raj Gupta"]}'::jsonb,
    now() - interval '62 days',
    now() - interval '58 days'
  ),
  (
    '54545454-5454-5454-5454-545454545454',
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    NULL,
    'e4040404-0404-0404-0404-040404040404',
    'DreamWeaver VR',
    'A VR experience that generates immersive 3D dreamscapes from text descriptions. Describe your dream - "a floating city made of crystals above a purple ocean" - and step into it within seconds. Explore AI-generated worlds that respond to your voice commands.',
    'https://github.com/example/dreamweaver-vr',
    NULL,
    'https://youtube.com/watch?v=demo4',
    'submitted',
    '{"category": "visual_art", "tools": ["Gaussian Splatting", "Unity", "GPT-4", "Quest 3"], "team_members": ["Emma Zhang", "Carlos Rivera"]}'::jsonb,
    now() - interval '60 days',
    now() - interval '60 days'
  ),
  -- AI Agents Hackathon 2026 submissions
  (
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'fa1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a',
    'AutoPilot PM',
    'An AI project manager that autonomously breaks down tasks, assigns priorities, schedules sprints, and sends daily standups. Integrates with Jira, Linear, and Slack to keep your team on track without manual intervention.',
    'https://github.com/example/autopilot-pm',
    'https://autopilot-pm.demo.com',
    'https://youtube.com/watch?v=agents1',
    'submitted',
    '{"tools": ["Claude API", "LangGraph", "Slack SDK"], "team_members": ["David Park", "Lisa Wong"]}'::jsonb,
    now() - interval '14 days',
    now() - interval '14 days'
  ),
  (
    'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'fa2a2a2a-2a2a-2a2a-2a2a-2a2a2a2a2a2a',
    'CodeReview Agent',
    'A multi-agent system for automated code review. One agent analyzes code quality, another checks security vulnerabilities, a third suggests performance optimizations, and an orchestrator combines their feedback into actionable PR comments.',
    'https://github.com/example/codereview-agent',
    'https://codereview-agent.app',
    'https://youtube.com/watch?v=agents2',
    'submitted',
    '{"tools": ["OpenAI Assistants", "GitHub API", "SonarQube"], "team_members": ["Kevin Chen", "Priya Sharma", "Tom Anderson"]}'::jsonb,
    now() - interval '15 days',
    now() - interval '14 days'
  ),
  (
    'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'fa3a3a3a-3a3a-3a3a-3a3a-3a3a3a3a3a3a',
    'ResearchBuddy',
    'An autonomous research assistant that takes a topic, searches academic papers, synthesizes findings, identifies gaps in the literature, and generates a structured research summary with proper citations.',
    'https://github.com/example/research-buddy',
    'https://research-buddy.io',
    'https://youtube.com/watch?v=agents3',
    'submitted',
    '{"tools": ["Anthropic Claude", "Semantic Scholar API", "Zotero"], "team_members": ["Michelle Torres"]}'::jsonb,
    now() - interval '14 days',
    now() - interval '13 days'
  ),
  (
    'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'fa4a4a4a-4a4a-4a4a-4a4a-4a4a4a4a4a4a',
    'DebugDetective',
    'An AI debugging agent that reproduces bugs from issue reports, isolates the root cause through systematic testing, proposes fixes, and validates them against your test suite. Turns bug reports into PRs automatically.',
    'https://github.com/example/debug-detective',
    NULL,
    'https://youtube.com/watch?v=agents4',
    'submitted',
    '{"tools": ["GPT-4", "pytest", "Docker"], "team_members": ["Ryan O''Brien", "Yuki Tanaka"]}'::jsonb,
    now() - interval '15 days',
    now() - interval '14 days'
  ),
  -- Search & Discovery Hack submissions
  (
    'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NULL,
    'fc1c1c1c-1c1c-1c1c-1c1c-1c1c1c1c1c1c',
    'TavilyDocs',
    'A documentation search engine that understands natural language queries and returns precise answers from your codebase docs. Ask "how do I authenticate?" and get the exact code snippet, not just links.',
    'https://github.com/example/tavily-docs',
    'https://tavily-docs.demo.com',
    'https://youtube.com/watch?v=search1',
    'submitted',
    '{"tools": ["Tavily API", "Supabase pgvector", "Next.js"], "team_members": ["Alex Kumar"]}'::jsonb,
    now() - interval '31 days',
    now() - interval '31 days'
  ),
  (
    'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NULL,
    'fc2c2c2c-2c2c-2c2c-2c2c-2c2c2c2c2c2c',
    'NewsGraph Explorer',
    'A knowledge graph visualization tool that maps connections between news articles, people, organizations, and events. Uses Tavily to fetch real-time news and builds an interactive exploration interface.',
    'https://github.com/example/newsgraph-explorer',
    'https://newsgraph.app',
    'https://youtube.com/watch?v=search2',
    'submitted',
    '{"tools": ["Tavily API", "Neo4j", "D3.js", "React"], "team_members": ["Sofia Rodriguez", "Marcus Johnson"]}'::jsonb,
    now() - interval '32 days',
    now() - interval '31 days'
  ),
  (
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NULL,
    'fc3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c',
    'ShopSmart Search',
    'A product comparison engine that searches across multiple e-commerce sites, extracts specs and reviews, and presents side-by-side comparisons with AI-generated summaries of pros and cons.',
    'https://github.com/example/shopsmart-search',
    'https://shopsmart-search.com',
    'https://youtube.com/watch?v=search3',
    'submitted',
    '{"tools": ["Tavily API", "Claude", "Puppeteer"], "team_members": ["Nina Patel", "Chris Lee", "Jordan Smith"]}'::jsonb,
    now() - interval '31 days',
    now() - interval '31 days'
  ),
  (
    'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NULL,
    'fc4c4c4c-4c4c-4c4c-4c4c-4c4c4c4c4c4c',
    'LegalLens',
    'A legal research tool that searches case law and statutes using natural language. Ask a legal question and get relevant precedents, organized by jurisdiction and recency, with plain-English explanations.',
    'https://github.com/example/legal-lens',
    NULL,
    'https://youtube.com/watch?v=search4',
    'submitted',
    '{"tools": ["Tavily API", "GPT-4", "Elasticsearch"], "team_members": ["Hannah White"]}'::jsonb,
    now() - interval '32 days',
    now() - interval '31 days'
  )
ON CONFLICT (id) DO NOTHING;
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
-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - SPONSORS
-- 392 fictional sponsors across gold, silver, bronze, and custom tiers.
-- Every sponsor has safe demo branding, a website, and visual assets.
-- Depends on: 20_rich_lifecycle_events.sql
-- ============================================================================

WITH rich_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'theme_index')::int AS theme_index,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
sponsor_rows AS (
  SELECT rich_events.*, sponsor_number
  FROM rich_events
  CROSS JOIN generate_series(1, 4) AS sponsor_number
)
INSERT INTO hackathon_sponsors (
  id,
  hackathon_id,
  sponsor_tenant_id,
  name,
  logo_url,
  logo_url_dark,
  website_url,
  tier,
  custom_tier_label,
  display_order,
  use_org_assets,
  created_at
)
SELECT
  md5('rich-sponsor-' || theme_slug || '-' || target_status || '-' || sponsor_number)::uuid,
  hackathon_id,
  CASE sponsor_number
    WHEN 1 THEN '12345678-1234-1234-1234-123456789012'::uuid
    WHEN 2 THEN '99990000-9999-9999-9999-999900009999'::uuid
    ELSE NULL
  END,
  (ARRAY[
    'Northstar Cloud', 'Harbour Compute', 'Maple Seed Fund', 'Open Door Foundation',
    'Bright Path Labs', 'Fieldstone Ventures', 'Common Good Network', 'Makers Supply Co.'
  ])[1 + ((theme_index + lifecycle_index + sponsor_number - 3) % 8)] ||
    CASE sponsor_number
      WHEN 1 THEN ' — Presenting Partner'
      WHEN 2 THEN ' — Builder Partner'
      WHEN 3 THEN ' — Community Partner'
      ELSE ' — Accessibility Partner'
    END,
  'https://images.unsplash.com/photo-' ||
    (ARRAY[
      '1563013544-824ae1b704d3', '1451187580459-43490279c0fa', '1531746790731-6c087fecd65a',
      '1488590528505-98d2b5aba04b', '1677442136019-21780ecad995', '1473341304170-971dccb5ac1e',
      '1508514177221-188b1cf16e9d', '1555949963-aa79dcee981c', '1516321318423-f06f85e504b3',
      '1446776811953-b23d57bd21aa', '1485827404703-89b55fcc595e', '1527430253228-e93688616381'
    ])[1 + ((theme_index * 2 + lifecycle_index + sponsor_number - 4) % 12)] ||
    '?auto=format&fit=crop&w=800&h=420&q=80',
  CASE WHEN sponsor_number % 2 = 0 THEN
    'https://images.unsplash.com/photo-' ||
      (ARRAY[
        '1518770660439-4636190af475', '1498050108023-c5249f4df085', '1535223289827-42f1e9919769',
        '1509062522246-3755977927d7', '1550751827-4bd374c3f58b', '1576091160399-112ba8d25d1d'
      ])[1 + ((theme_index + lifecycle_index + sponsor_number - 3) % 6)] ||
      '?auto=format&fit=crop&w=800&h=420&q=78'
    ELSE NULL
  END,
  'https://' || replace(theme_slug, '-', '') || '-partner-' || sponsor_number || '.example.com',
  (ARRAY['gold'::sponsor_tier, 'silver'::sponsor_tier, 'bronze'::sponsor_tier, 'custom'::sponsor_tier])[sponsor_number],
  CASE WHEN sponsor_number = 4 THEN 'Access for All Partner' ELSE NULL END,
  sponsor_number - 1,
  false,
  now() - make_interval(days => 90 - (lifecycle_index * 7) + sponsor_number)
FROM sponsor_rows
ON CONFLICT (id) DO NOTHING;
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
    WHEN 'judging' THEN CASE project_number % 3 WHEN 0 THEN 'under_review'::submission_status WHEN 1 THEN 'submitted'::submission_status ELSE 'accepted'::submission_status END
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
-- ============================================================================
-- RICH LIFECYCLE SHOWCASE - JUDGING AND RESULTS
-- Adds planned/active/complete rounds, weighted rubrics, judge work, partial
-- scoring, final results, and prize assignments.
-- Depends on: 25_rich_lifecycle_programs.sql
-- ============================================================================

WITH judging_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
round_rows AS (
  SELECT judging_events.*, round_number
  FROM judging_events
  CROSS JOIN generate_series(1, 2) AS round_number
)
INSERT INTO judging_rounds (
  id,
  hackathon_id,
  name,
  round_type,
  is_active,
  display_order,
  style,
  status,
  advancement,
  advancement_config,
  created_at,
  updated_at
)
SELECT
  md5('rich-round-' || theme_slug || '-' || target_status || '-' || round_number)::uuid,
  hackathon_id,
  CASE round_number WHEN 1 THEN 'First look' ELSE 'Final scorecards' END,
  CASE round_number WHEN 1 THEN 'preliminary' ELSE 'finals' END,
  lifecycle_index = 5 AND round_number = 2,
  round_number - 1,
  CASE round_number WHEN 1 THEN 'gate_check'::judging_style ELSE 'points'::judging_style END,
  CASE
    WHEN lifecycle_index = 5 AND round_number = 1 THEN 'advanced'::round_status
    WHEN lifecycle_index = 5 THEN 'active'::round_status
    ELSE 'complete'::round_status
  END,
  CASE round_number WHEN 1 THEN 'top_n'::advancement_rule ELSE 'manual'::advancement_rule END,
  CASE round_number
    WHEN 1 THEN jsonb_build_object('count', 12, 'tie_breaker', 'judge discussion')
    ELSE jsonb_build_object('publish_after_review', true)
  END,
  now() - interval '8 days',
  now()
FROM round_rows
ON CONFLICT (id) DO NOTHING;

WITH final_rounds AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    round.id AS round_id
  FROM hackathons h
  JOIN judging_rounds round
    ON round.id = md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
criteria_rows AS (
  SELECT final_rounds.*, criterion_number
  FROM final_rounds
  CROSS JOIN generate_series(1, 4) AS criterion_number
)
INSERT INTO judging_criteria (
  id,
  hackathon_id,
  round_id,
  name,
  description,
  min_score,
  max_score,
  weight,
  category,
  display_order,
  created_at,
  updated_at
)
SELECT
  md5('rich-criterion-' || theme_slug || '-' || target_status || '-' || criterion_number)::uuid,
  hackathon_id,
  round_id,
  (ARRAY['Problem and people', 'Working build', 'Useful impact', 'Clear and inclusive demo'])[criterion_number],
  (ARRAY[
    'The team names a real problem, shows who has it, and explains what they learned from people.',
    'The main task works in the live demo. The team can explain the hard parts and the choices they made.',
    'The next step is practical. The team names risks, limits, and a useful way to measure progress.',
    'The demo is easy to follow, uses plain words, includes captions, and gives every teammate a role.'
  ])[criterion_number],
  0,
  10,
  25,
  'core'::criterion_category,
  criterion_number - 1,
  now() - interval '7 days',
  now()
FROM criteria_rows
ON CONFLICT (id) DO NOTHING;

WITH prize_rounds AS (
  SELECT
    prize.id AS prize_id,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  JOIN prizes prize ON prize.hackathon_id = h.id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
)
UPDATE prizes
SET round_id = prize_rounds.round_id,
    updated_at = now()
FROM prize_rounds
WHERE prizes.id = prize_rounds.prize_id;

WITH judging_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (h.metadata->'seed'->>'lifecycle_index')::int AS lifecycle_index,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 5
),
judges AS (
  SELECT
    judging_events.*,
    participant.id AS judge_participant_id,
    row_number() OVER (PARTITION BY judging_events.hackathon_id ORDER BY participant.clerk_user_id) AS judge_number
  FROM judging_events
  JOIN hackathon_participants participant
    ON participant.hackathon_id = judging_events.hackathon_id
   AND participant.role = 'judge'
),
projects AS (
  SELECT
    submission.id AS submission_id,
    submission.hackathon_id,
    (submission.metadata->'seed'->>'project_number')::int AS project_number
  FROM submissions submission
  JOIN judging_events ON judging_events.hackathon_id = submission.hackathon_id
  WHERE submission.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
assignment_rows AS (
  SELECT
    judges.*,
    projects.submission_id,
    projects.project_number,
    CASE
      WHEN judges.lifecycle_index >= 6 THEN true
      ELSE (projects.project_number + judges.judge_number) % 2 = 0
    END AS is_complete
  FROM judges
  JOIN projects ON projects.hackathon_id = judges.hackathon_id
)
INSERT INTO judge_assignments (
  id,
  hackathon_id,
  judge_participant_id,
  submission_id,
  round_id,
  assignment_kind,
  notes,
  viewed_at,
  is_complete,
  completed_at,
  assigned_at
)
SELECT
  md5('rich-assignment-' || theme_slug || '-' || target_status || '-' || project_number || '-' || judge_number)::uuid,
  hackathon_id,
  judge_participant_id,
  submission_id,
  round_id,
  'unified_weighted_score',
  CASE WHEN is_complete THEN 'Reviewed the live demo, project page, safety notes, and user test summary.' ELSE '' END,
  CASE WHEN is_complete OR project_number % 3 = 0 THEN now() - interval '1 day' ELSE NULL END,
  is_complete,
  CASE WHEN is_complete THEN now() - make_interval(hours => (project_number + judge_number)::int) ELSE NULL END,
  now() - interval '4 days'
FROM assignment_rows
ON CONFLICT (id) DO NOTHING;

WITH complete_assignments AS (
  SELECT
    assignment.id AS assignment_id,
    assignment.hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    (submission.metadata->'seed'->>'project_number')::int AS project_number,
    row_number() OVER (
      PARTITION BY assignment.hackathon_id, assignment.submission_id
      ORDER BY assignment.judge_participant_id
    ) AS judge_number
  FROM judge_assignments assignment
  JOIN hackathons h ON h.id = assignment.hackathon_id
  JOIN submissions submission ON submission.id = assignment.submission_id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND assignment.is_complete
),
score_rows AS (
  SELECT complete_assignments.*, criterion_number
  FROM complete_assignments
  CROSS JOIN generate_series(1, 4) AS criterion_number
)
INSERT INTO scores (
  id,
  judge_assignment_id,
  criteria_id,
  score,
  created_at,
  updated_at
)
SELECT
  md5('rich-score-' || assignment_id || '-' || criterion_number)::uuid,
  assignment_id,
  md5('rich-criterion-' || theme_slug || '-' || target_status || '-' || criterion_number)::uuid,
  6 + ((project_number + judge_number + criterion_number) % 5),
  now() - interval '2 days',
  now()
FROM score_rows
ON CONFLICT (id) DO NOTHING;

WITH result_events AS (
  SELECT
    h.id AS hackathon_id,
    h.metadata->'seed'->>'theme_slug' AS theme_slug,
    h.metadata->'seed'->>'target_status' AS target_status,
    md5(
      'rich-round-' || (h.metadata->'seed'->>'theme_slug') || '-' ||
      (h.metadata->'seed'->>'target_status') || '-2'
    )::uuid AS round_id
  FROM hackathons h
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND (h.metadata->'seed'->>'lifecycle_index')::int >= 6
),
ranked_projects AS (
  SELECT
    result_events.*,
    submission.id AS submission_id,
    row_number() OVER (
      PARTITION BY result_events.hackathon_id
      ORDER BY (submission.metadata->'seed'->>'project_number')::int
    ) AS rank
  FROM result_events
  JOIN submissions submission ON submission.hackathon_id = result_events.hackathon_id
  WHERE submission.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
),
winners AS (
  SELECT * FROM ranked_projects WHERE rank <= 3
)
INSERT INTO hackathon_results (
  id,
  hackathon_id,
  submission_id,
  prize_id,
  round_id,
  rank,
  total_score,
  weighted_score,
  judge_count,
  result_kind,
  published_at,
  created_at
)
SELECT
  md5('rich-result-' || theme_slug || '-' || target_status || '-' || rank)::uuid,
  hackathon_id,
  submission_id,
  md5('rich-prize-' || theme_slug || '-' || target_status || '-' || rank)::uuid,
  round_id,
  rank,
  38 - (rank * 2),
  95 - (rank * 4),
  2,
  'prize',
  now() - interval '2 days',
  now() - interval '2 days'
FROM winners
ON CONFLICT (id) DO NOTHING;

WITH result_prizes AS (
  SELECT result.prize_id, result.submission_id
  FROM hackathon_results result
  JOIN hackathons h ON h.id = result.hackathon_id
  WHERE h.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
    AND result.prize_id IS NOT NULL
)
INSERT INTO prize_assignments (
  id,
  prize_id,
  submission_id,
  assigned_at
)
SELECT
  md5('rich-prize-assignment-' || prize_id || '-' || submission_id)::uuid,
  prize_id,
  submission_id,
  now() - interval '2 days'
FROM result_prizes
ON CONFLICT (prize_id, submission_id) DO NOTHING;
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
