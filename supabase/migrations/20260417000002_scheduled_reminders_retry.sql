ALTER TABLE scheduled_reminders ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;
ALTER TABLE scheduled_reminders ADD COLUMN IF NOT EXISTS last_error text;

DROP INDEX IF EXISTS idx_scheduled_reminders_pending;
CREATE INDEX idx_scheduled_reminders_pending
  ON scheduled_reminders(scheduled_for)
  WHERE sent_at IS NULL AND cancelled_at IS NULL AND fail_count < 3;
