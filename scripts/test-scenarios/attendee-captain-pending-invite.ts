import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-captain-pending-invite"

async function run() {
  console.log("Setting up attendee-captain-pending-invite scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Captain Pending Invite Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [])
  const token = await createPendingInvitation(
    teamId,
    hackathonId,
    "unknown-invitee@example.com"
  )

  console.log("Dev user is captain with a pending invite to an unknown email.")
  console.log(`Invitee URL: http://localhost:3000/invite/${token}`)
  printReady(SLUG)
}

run().catch(console.error)
