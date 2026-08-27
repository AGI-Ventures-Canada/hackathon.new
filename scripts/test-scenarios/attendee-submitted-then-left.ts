import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  removeTeamMember,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
  supabase,
} from "./_helpers"

const SLUG = "test-attendee-submitted-then-left"

async function run() {
  console.log("Setting up attendee-submitted-then-left scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Submitted Then Left Test",
    status: "active",
    startsAt: new Date(now.getTime() - 5 * 86400000),
    endsAt: new Date(now.getTime() + 2 * 86400000),
  })

  const remainingCaptain = SEED_USERS[0]
  const teamId = await createTeamWithMembers(hackathonId, remainingCaptain, [
    DEV_USER_ID,
    SEED_USERS[1],
  ])

  const submitterPid = await registerParticipant(hackathonId, DEV_USER_ID)
  await createSubmission(hackathonId, teamId, submitterPid, 1)

  await removeTeamMember(hackathonId, DEV_USER_ID)
  await supabase
    .from("teams")
    .update({ captain_clerk_user_id: remainingCaptain })
    .eq("id", teamId)

  console.log(`Dev user submitted and then left the team. ${remainingCaptain} remains as captain.`)
  console.log("Repros: dev user can still hit /edit because participant_id matches the submission.")
  printReady(SLUG)
}

await run()
