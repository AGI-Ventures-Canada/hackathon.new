import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830210000_test_event_sandbox.sql"),
  "utf8",
)

describe("test event sandbox migration", () => {
  it("restores email defaults and removes only generated task history on conversion", () => {
    expect(migration).toContain(
      "delete from public.hackathon_notification_settings where hackathon_id = p_hackathon_id;",
    )
    expect(migration).toContain(
      "delete from public.lifecycle_notification_dispatches where hackathon_id = p_hackathon_id;",
    )
    expect(migration).toContain(
      "delete from public.hackathon_terms_acceptances where hackathon_id = p_hackathon_id;",
    )
    expect(migration).toContain("delete from public.organizer_action_item_state")
    expect(migration).toContain("and item_kind = 'generated';")
    expect(migration).not.toContain("delete from public.organizer_custom_action_items")
  })

  it("removes people after participant references are cleared", () => {
    const mentorRequests = migration.indexOf("delete from public.mentor_requests")
    const submissions = migration.indexOf("delete from public.submissions")
    const participants = migration.indexOf("delete from public.hackathon_participants")

    expect(mentorRequests).toBeGreaterThan(-1)
    expect(submissions).toBeGreaterThan(mentorRequests)
    expect(participants).toBeGreaterThan(submissions)
  })
})
