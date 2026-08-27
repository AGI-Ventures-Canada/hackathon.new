import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-submitted"

async function run() {
  console.log("Setting up submitted scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Submitted Test",
    status: "active",
    startsAt: new Date(now.getTime() - 5 * 86400000),
    endsAt: new Date(now.getTime() + 2 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [SEED_USERS[0]])

  const participantId = (
    await registerParticipant(hackathonId, DEV_USER_ID)
  )

  await createSubmission(hackathonId, teamId, participantId, 0)

  console.log("Dev user has a team with a submitted project. Hackathon ends in 2 days.")
  printReady(SLUG)
}

await run()
