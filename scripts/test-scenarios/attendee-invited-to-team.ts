import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
  supabase,
} from "./_helpers"

const SLUG = "test-attendee-invited-to-team"

const DEV_USER_EMAIL = process.env.SCENARIO_DEV_USER_EMAIL ?? "dev-user@example.com"

async function run() {
  console.log("Setting up attendee-invited-to-team scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Invited To Team Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const otherCaptain = SEED_USERS[0]
  const teamId = await createTeamWithMembers(hackathonId, otherCaptain, [SEED_USERS[1]])

  await supabase.from("teams").update({ name: "The Other Captain's Team" }).eq("id", teamId)

  const token = await createPendingInvitation(
    teamId,
    hackathonId,
    DEV_USER_EMAIL,
    { invitedBy: otherCaptain }
  )

  console.log(`Dev user has a pending invite from ${otherCaptain} to "The Other Captain's Team".`)
  console.log(`Accept URL: http://localhost:3000/invite/${token}`)
  printReady(SLUG)
}

await run()
