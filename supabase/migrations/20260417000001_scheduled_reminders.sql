CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  hackathon_id uuid REFERENCES hackathons(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  urgency text NOT NULL DEFAULT 'low',
  sent_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(entity_type, entity_id, scheduled_for)
);

CREATE INDEX idx_scheduled_reminders_pending
  ON scheduled_reminders(scheduled_for)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX idx_scheduled_reminders_entity
  ON scheduled_reminders(entity_type, entity_id);

ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to scheduled_reminders" ON scheduled_reminders FOR ALL USING (false);
