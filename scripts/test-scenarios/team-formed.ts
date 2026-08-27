import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  DEV_USER_ID,
  SEED_USERS,
  supabase,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-team-formed"

async function run() {
  console.log("Setting up team-formed scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Team Formed Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  const teamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [
    SEED_USERS[0],
    SEED_USERS[1],
  ])

  await supabase.from("team_invitations").insert({
    team_id: teamId,
    hackathon_id: hackathonId,
    email: "pending-member@example.com",
    token: crypto.randomUUID(),
    invited_by_clerk_user_id: DEV_USER_ID,
    status: "pending",
    expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
  })

  console.log("Dev user is captain of a 3-person team with 1 pending invite. No submission.")
  printReady(SLUG)
}

await run()
