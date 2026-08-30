ALTER TABLE scheduled_reminders
  DROP CONSTRAINT IF EXISTS scheduled_reminders_entity_type_entity_id_scheduled_for_key;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_reminders_identity_idx
  ON scheduled_reminders(entity_type, entity_id, reminder_type, scheduled_for);
