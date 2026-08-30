import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830043830_harden_attendee_team_lifecycle.sql"
  ),
  "utf8"
)

describe("attendee team lifecycle migration", () => {
  it("keeps invitation acceptance inside the event and team lifecycle", () => {
    expect(migration).toContain("v_invitation.team_hackathon_id <> v_invitation.hackathon_id")
    expect(migration).toContain("v_hackathon.status NOT IN ('published', 'registration_open', 'active')")
    expect(migration).toContain("v_hackathon.registration_opens_at")
    expect(migration).toContain("LOWER(BTRIM(p_user_email)) <> LOWER(BTRIM(v_invitation.email))")
  })

  it("blocks role changes and project orphaning before moving an attendee", () => {
    expect(migration).toContain("v_existing_participant.role <> 'participant'")
    expect(migration).toContain("'project_exists'::TEXT")
    expect(migration).toContain("submission.team_id = v_existing_participant.team_id")
    expect(migration).toContain("submission.participant_id = v_existing_participant.id")
  })

  it("checks team capacity before creating an attendee", () => {
    const capacityGate = migration.indexOf("v_team_member_count >= v_hackathon.max_team_size")
    const attendeeInsert = migration.indexOf(
      "INSERT INTO public.hackathon_participants (hackathon_id, clerk_user_id, role)"
    )

    expect(capacityGate).toBeGreaterThan(-1)
    expect(attendeeInsert).toBeGreaterThan(capacityGate)
  })

  it("keeps the security definer RPC limited to the service role", () => {
    expect(migration).toContain("SECURITY DEFINER")
    expect(migration).toContain("SET search_path = public")
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM PUBLIC"
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) TO service_role"
    )
  })

  it("queues registration and team review emails in the same database change", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.attendee_lifecycle_notifications")
    expect(migration).toContain("enqueue_attendee_registration_notification")
    expect(migration).toContain("'registration_confirmed'")
    expect(migration).toContain("'team_approved'")
    expect(migration).toContain("'team_denied'")
    expect(migration).toContain("ON CONFLICT DO NOTHING")
    expect(migration).toContain("promote_teams_when_review_is_disabled")
    expect(migration).toContain("!~ '^(seed_user_|user_seed_|user_demo_)'")
    expect(migration).toContain("hackathon.description LIKE 'Test hackathon for the % scenario.%'")
  })
})
