import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830180000_reminder_identity_reconciliation.sql",
  ),
  "utf8",
)

describe("reminder identity migration", () => {
  it("replaces the old time-only identity with a reminder-type identity", () => {
    expect(migration).toContain(
      "DROP CONSTRAINT IF EXISTS scheduled_reminders_entity_type_entity_id_scheduled_for_key",
    )
    expect(migration).toContain(
      "ON scheduled_reminders(entity_type, entity_id, reminder_type, scheduled_for)",
    )
  })
})
