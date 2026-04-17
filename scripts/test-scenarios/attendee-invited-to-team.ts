import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
  supabase,
} from "./_helpers"

const SLUG = "test-attendee-invited-to-team"

const DEV_USER_EMAIL = "hai@agiventures.ca"

async function run() {
  console.log("Setting up attendee-invited-to-team scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

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

run().catch(console.error)
