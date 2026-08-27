import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-team-pending-approval"

async function run() {
  console.log("Setting up attendee-team-pending-approval scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Pending Team Approval Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
    requireTeamApproval: true,
  })

  const devTeamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [SEED_USERS[0]], {
    name: "Dev Team Waiting",
    status: "pending_approval",
  })
  const token = await createPendingInvitation(
    devTeamId,
    hackathonId,
    "future-member@example.com",
    { invitedBy: DEV_USER_ID }
  )

  await createTeamWithMembers(hackathonId, SEED_USERS[1], [SEED_USERS[2]], {
    name: "Already Approved",
  })
  await createTeamWithMembers(hackathonId, SEED_USERS[3], [], {
    name: "Another Pending Team",
    status: "pending_approval",
  })

  console.log("Dev user is captain of a team waiting for approval.")
  console.log(`Invitee URL: http://localhost:3000/invite/${token}`)
  printReady(SLUG)
}

await run()
