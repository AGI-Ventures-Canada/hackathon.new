import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-invite-declined"

async function run() {
  console.log("Setting up attendee-invite-declined scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Invite Declined Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [])
  await createPendingInvitation(
    teamId,
    hackathonId,
    "declined-invitee@example.com",
    { status: "declined" }
  )

  console.log("Dev user is captain with a declined invite record. Try re-inviting the same email.")
  printReady(SLUG)
}

run().catch(console.error)
