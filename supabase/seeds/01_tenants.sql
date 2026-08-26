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
