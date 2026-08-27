import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPendingInvitation,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-team-approval-review"

const EXTRA_USERS = [
  "seed_user_frank_006",
  "seed_user_grace_007",
  "seed_user_harper_008",
  "seed_user_isaac_009",
  "seed_user_jules_010",
  "seed_user_kai_011",
]

async function run() {
  console.log("Setting up team-approval-review scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Team Approval Review Test",
    status: "active",
    startsAt: new Date(now.getTime() - 2 * 86400000),
    endsAt: new Date(now.getTime() + 5 * 86400000),
    requireTeamApproval: true,
  })

  const users = [...SEED_USERS, ...EXTRA_USERS]

  await createTeamWithMembers(hackathonId, users[0], [users[1]], {
    name: "Approved Builders",
  })
  await createTeamWithMembers(hackathonId, users[2], [users[3], users[4]], {
    name: "Approved Launch Crew",
  })
  await createTeamWithMembers(hackathonId, users[5], [], {
    name: "Solo Approved",
  })

  const pendingWithInvite = await createTeamWithMembers(hackathonId, users[6], [users[7]], {
    name: "Needs a Look",
    status: "pending_approval",
  })
  await createPendingInvitation(
    pendingWithInvite,
    hackathonId,
    "pending-designer@example.com",
    { invitedBy: users[6] }
  )

  await createTeamWithMembers(hackathonId, users[8], [], {
    name: "Waiting Solo",
    status: "pending_approval",
  })
  await createTeamWithMembers(hackathonId, users[9], [users[10]], {
    name: "Waiting With Members",
    status: "pending_approval",
  })

  console.log("Organizer can review 3 approved teams and 3 teams waiting for approval.")
  printReady(SLUG)
}

await run()
