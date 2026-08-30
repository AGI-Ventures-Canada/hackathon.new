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
