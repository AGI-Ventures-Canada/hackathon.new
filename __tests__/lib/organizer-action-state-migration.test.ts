import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830190000_organizer_action_item_state.sql"),
  "utf8",
)

describe("organizer action state migration", () => {
  it("stores shared generated and custom task state per event", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.organizer_action_item_state")
    expect(migration).toContain("PRIMARY KEY (hackathon_id, action_id)")
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.organizer_custom_action_items")
    expect(migration).toContain("REFERENCES public.hackathons(id) ON DELETE CASCADE")
  })

  it("keeps browser clients out of the task tables", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY")
    expect(migration).toContain("FOR ALL USING (FALSE)")
  })

  it("serializes inserts and caps custom tasks per event", () => {
    expect(migration).toContain("pg_advisory_xact_lock")
    expect(migration).toContain("organizer_custom_action_items_limit")
    expect(migration).toContain(") >= 500 THEN")
    expect(migration).toContain("BEFORE INSERT ON public.organizer_custom_action_items")
  })

  it("adds every health field needed by the live action list", () => {
    expect(migration).toContain("'unsent_team_invitation_email_count'")
    expect(migration).toContain("'unsent_judge_invitation_email_count'")
    expect(migration).toContain("'failed_reminder_count'")
    expect(migration).toContain("FROM public.judge_pending_notifications")
    expect(migration).toContain("FROM public.lifecycle_notification_dispatches")
    expect(migration).toContain("fail_count >= 3")
    expect(migration).toContain("fail_count >= 5")
    expect(migration).toContain("'require_location_verification'")
  })
})
