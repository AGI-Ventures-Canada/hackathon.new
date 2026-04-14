import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  addJudgingCriteria,
  assignJudges,
  seedJudgeDisplayProfiles,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-judging"

async function run() {
  console.log("Setting up judging scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Judging Test Hackathon",
    status: "judging",
    startsAt: new Date(now.getTime() - 3 * 86400000),
    endsAt: new Date(now.getTime() - 1 * 86400000),
    judgingMode: "rubric",
  })

  const teams: string[] = []
  const submissions: string[] = []
  const allUsers = [DEV_USER_ID, ...SEED_USERS]

  for (let i = 0; i < 5; i++) {
    const captain = allUsers[i]
    const teamId = await createTeamWithMembers(hackathonId, captain, [])
    teams.push(teamId)

    const pid = await registerParticipant(hackathonId, captain)
    const subId = await createSubmission(hackathonId, teamId, pid, i)
    submissions.push(subId)
  }

  const judgeUsers = [DEV_USER_ID, SEED_USERS[0], SEED_USERS[1]]
  const judgeParticipantIds: string[] = []
  const judgeTeamIds: Record<string, string> = {}

  for (const userId of judgeUsers) {
    const { data: participant } = await (await import("./_helpers")).supabase
      .from("hackathon_participants")
      .select("id, team_id")
      .eq("hackathon_id", hackathonId)
      .eq("clerk_user_id", userId)
      .single()

    if (participant) {
      await (await import("./_helpers")).supabase
        .from("hackathon_participants")
        .update({ role: "judge" })
        .eq("id", participant.id)

      judgeParticipantIds.push(participant.id)
      if (participant.team_id) {
        judgeTeamIds[participant.id] = participant.team_id
      }
    }
  }

  await addJudgingCriteria(hackathonId)
  await seedJudgeDisplayProfiles(hackathonId, judgeUsers, judgeParticipantIds)
  const assignmentIds = await assignJudges(hackathonId, judgeParticipantIds, submissions, judgeTeamIds)

  console.log(`Created 5 teams, 5 submissions, 3 judges, ${assignmentIds.length} assignments.`)
  console.log("No scores submitted yet — test the full scoring flow.")
  printReady(SLUG)
}

run().catch(console.error)
