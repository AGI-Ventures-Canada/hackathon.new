import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  addJudgingCriteria,
  assignJudges,
  seedJudgeDisplayProfiles,
  submitRandomScores,
  buildDefaultPrizes,
  createPrizes,
  DEV_USER_ID,
  SEED_USERS,
  supabase,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-judging-in-progress"

async function run() {
  console.log("Setting up judging-in-progress scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Judging In Progress Test",
    status: "judging",
    startsAt: new Date(now.getTime() - 5 * 86400000),
    endsAt: new Date(now.getTime() - 2 * 86400000),
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
    const { data: participant } = await supabase
      .from("hackathon_participants")
      .select("id, team_id")
      .eq("hackathon_id", hackathonId)
      .eq("clerk_user_id", userId)
      .single()

    if (participant) {
      await supabase
        .from("hackathon_participants")
        .update({ role: "judge" })
        .eq("id", participant.id)

      judgeParticipantIds.push(participant.id)
      if (participant.team_id) {
        judgeTeamIds[participant.id] = participant.team_id
      }
    }
  }

  const criteriaIds = await addJudgingCriteria(hackathonId)
  await seedJudgeDisplayProfiles(hackathonId, judgeUsers, judgeParticipantIds)
  const assignmentIds = await assignJudges(hackathonId, judgeParticipantIds, submissions, judgeTeamIds)

  const halfPoint = Math.floor(assignmentIds.length * 0.6)
  for (let i = 0; i < halfPoint; i++) {
    await submitRandomScores(assignmentIds[i], criteriaIds)
  }

  const prizes = buildDefaultPrizes(criteriaIds)
  await createPrizes(hackathonId, prizes)

  console.log(`Created 5 teams, 5 submissions, 3 judges, ${assignmentIds.length} assignments.`)
  console.log(`${halfPoint} assignments scored, ${assignmentIds.length - halfPoint} remaining.`)
  console.log("3 prizes defined (not assigned — results not calculated yet).")
  printReady(SLUG)
}

run().catch(console.error)
