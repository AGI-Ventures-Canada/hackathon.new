import { supabase, SEED_USERS, createTeamWithMembers, createSubmission, registerParticipant } from "./test-scenarios/_helpers"

const arg = process.argv[2]
if (!arg) {
  console.error("Usage: bun run scripts/seed-demo-submissions.ts <hackathon-slug-or-id>")
  process.exit(1)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveHackathonId(slugOrId: string): Promise<string> {
  if (UUID_RE.test(slugOrId)) {
    const { data } = await supabase.from("hackathons").select("id").eq("id", slugOrId).single()
    if (!data) {
      console.error(`Hackathon not found: ${slugOrId}`)
      process.exit(1)
    }
    return data.id
  }
  const { data } = await supabase.from("hackathons").select("id").eq("slug", slugOrId).single()
  if (!data) {
    console.error(`Hackathon not found by slug: ${slugOrId}`)
    process.exit(1)
  }
  return data.id
}

async function findExistingTeamForCaptain(hackathonId: string, captainUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("teams")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("captain_clerk_user_id", captainUserId)
    .maybeSingle()
  return data?.id ?? null
}

async function teamHasSubmission(teamId: string): Promise<boolean> {
  const { data } = await supabase
    .from("submissions")
    .select("id")
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle()
  return !!data
}

async function run() {
  const hackathonId = await resolveHackathonId(arg)
  console.log(`Seeding demo submissions for hackathon ${hackathonId}`)

  let created = 0
  let skipped = 0
  for (let i = 0; i < SEED_USERS.length; i++) {
    const captain = SEED_USERS[i]

    let teamId = await findExistingTeamForCaptain(hackathonId, captain)
    if (!teamId) {
      teamId = await createTeamWithMembers(hackathonId, captain, [])
    }

    if (await teamHasSubmission(teamId)) {
      console.log(`  ${captain}: skipped (already has submission)`)
      skipped++
      continue
    }

    const participantId = await registerParticipant(hackathonId, captain)
    const submissionId = await createSubmission(hackathonId, teamId, participantId, i)
    console.log(`  ${captain}: submission ${submissionId}`)
    created++
  }

  console.log(`\nCreated ${created} submission(s), skipped ${skipped}.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
