import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-team-at-capacity"

async function run() {
  console.log("Setting up attendee-team-at-capacity scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Team At Capacity Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [
    SEED_USERS[0],
    SEED_USERS[1],
    SEED_USERS[2],
  ])

  const token = await createPendingInvitation(
    teamId,
    hackathonId,
    "overflow-invitee@example.com"
  )

  console.log("Dev user is captain of a 4-person team (at max) with 1 extra pending invite.")
  console.log(`Pending invite URL: http://localhost:3000/invite/${token}`)
  console.log("Accepting should fail with 'team full' — good repro for capacity TOCTOU.")
  printReady(SLUG)
}

run().catch(console.error)
