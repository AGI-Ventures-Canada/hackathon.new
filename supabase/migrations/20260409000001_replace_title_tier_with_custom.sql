-- Add custom_tier_label column for user-defined tier names
ALTER TABLE hackathon_sponsors ADD COLUMN IF NOT EXISTS custom_tier_label text;

-- Migrate existing "title" sponsors to "custom" with their label preserved
UPDATE hackathon_sponsors
SET custom_tier_label = 'Title'
WHERE tier = 'title';

-- Recreate enum: remove "title", add "custom"
ALTER TYPE sponsor_tier RENAME TO sponsor_tier_old;
CREATE TYPE sponsor_tier AS ENUM ('gold', 'silver', 'bronze', 'custom', 'none');
ALTER TABLE hackathon_sponsors ALTER COLUMN tier DROP DEFAULT;
ALTER TABLE hackathon_sponsors ALTER COLUMN tier TYPE sponsor_tier
  USING CASE WHEN tier::text = 'title' THEN 'custom'::sponsor_tier ELSE tier::text::sponsor_tier END;
ALTER TABLE hackathon_sponsors ALTER COLUMN tier SET DEFAULT 'none';
DROP TYPE sponsor_tier_old;
