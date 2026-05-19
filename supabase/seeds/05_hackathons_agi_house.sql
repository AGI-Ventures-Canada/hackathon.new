-- ============================================================================
-- HACKATHONS - AGI HOUSE
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
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
    'published',
    2,
    4,
    false,
    false,
    now() - interval '1 day',
    now()
  )
ON CONFLICT (id) DO NOTHING;
