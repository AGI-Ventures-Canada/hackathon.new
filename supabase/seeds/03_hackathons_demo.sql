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
