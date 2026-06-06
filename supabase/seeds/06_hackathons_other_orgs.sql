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
