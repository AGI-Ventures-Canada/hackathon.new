import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-invite-expired"

async function run() {
  console.log("Setting up attendee-invite-expired scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Invite Expired Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [])
  const token = await createPendingInvitation(
    teamId,
    hackathonId,
    "expired-invitee@example.com",
    { expiresInHours: -24 * 8 }
  )

  console.log("Dev user is captain with an invite that expired 8 days ago.")
  console.log(`Expired URL: http://localhost:3000/invite/${token}`)
  printReady(SLUG)
}

await run()
