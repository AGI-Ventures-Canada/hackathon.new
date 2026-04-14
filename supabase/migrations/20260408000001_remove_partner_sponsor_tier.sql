-- Migrate existing "partner" sponsors to "none"
UPDATE hackathon_sponsors SET tier = 'none' WHERE tier = 'partner';

-- Change default from "partner" to "none"
ALTER TABLE hackathon_sponsors ALTER COLUMN tier SET DEFAULT 'none';

-- Recreate enum without "partner"
ALTER TYPE sponsor_tier RENAME TO sponsor_tier_old;
CREATE TYPE sponsor_tier AS ENUM ('title', 'gold', 'silver', 'bronze', 'none');
ALTER TABLE hackathon_sponsors ALTER COLUMN tier DROP DEFAULT;
ALTER TABLE hackathon_sponsors ALTER COLUMN tier TYPE sponsor_tier USING tier::text::sponsor_tier;
ALTER TABLE hackathon_sponsors ALTER COLUMN tier SET DEFAULT 'none';
DROP TYPE sponsor_tier_old;
