import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-solo-submitted"

async function run() {
  console.log("Setting up attendee-solo-submitted scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Solo Submitted Test",
    status: "active",
    startsAt: new Date(now.getTime() - 5 * 86400000),
    endsAt: new Date(now.getTime() + 2 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [])
  const participantId = await registerParticipant(hackathonId, DEV_USER_ID)
  await createSubmission(hackathonId, teamId, participantId, 0)

  console.log("Dev user registered solo (team of 1) and submitted. allow_solo=true on hackathon.")
  printReady(SLUG)
}

run().catch(console.error)
