import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  registerParticipant,
  createSubmission,
  addJudgingCriteria,
  assignJudges,
  submitRandomScores,
  buildDefaultPrizes,
  createPrizes,
  autoAssignAndInitFulfillments,
  DEV_USER_ID,
  SEED_USERS,
  printReady,
  promptForOptionalTenantId,
  supabase,
  seedJudgeDisplayProfiles,
} from "./_helpers"

const SLUG = "test-attendee-winner-pending-claim"

async function run() {
  console.log("Setting up attendee-winner-pending-claim scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Winner Pending Claim Test",
    status: "judging",
    startsAt: new Date(now.getTime() - 10 * 86400000),
    endsAt: new Date(now.getTime() - 2 * 86400000),
    resultsPublishedAt: new Date(now.getTime() - 3600_000).toISOString(),
  })

  const devTeamId = await createTeamWithMembers(hackathonId, DEV_USER_ID, [SEED_USERS[0]])
  const devPid = await registerParticipant(hackathonId, DEV_USER_ID)
  const devSubId = await createSubmission(hackathonId, devTeamId, devPid, 0)

  const otherTeams: { teamId: string; subId: string }[] = []
  for (let i = 1; i < 4; i++) {
    const captain = SEED_USERS[i]
    const tid = await createTeamWithMembers(hackathonId, captain, [])
    const pid = await registerParticipant(hackathonId, captain)
    const sid = await createSubmission(hackathonId, tid, pid, i)
    otherTeams.push({ teamId: tid, subId: sid })
  }

  const criteriaIds = await addJudgingCriteria(hackathonId)

  const judgeUserIds = [SEED_USERS[4]]
  const judgePids: string[] = []
  const judgeTeamIds: Record<string, string> = {}
  for (const j of judgeUserIds) {
    const pid = await registerParticipant(hackathonId, j, "judge")
    judgePids.push(pid)
    judgeTeamIds[pid] = ""
  }

  await seedJudgeDisplayProfiles(hackathonId, judgeUserIds, judgePids)

  const allSubIds = [devSubId, ...otherTeams.map((o) => o.subId)]
  const assignmentIds = await assignJudges(hackathonId, judgePids, allSubIds, judgeTeamIds)

  for (const aid of assignmentIds) await submitRandomScores(aid, criteriaIds)

  const { data: devAssignments } = await supabase
    .from("judge_assignments")
    .select("id, submission_id")
    .eq("hackathon_id", hackathonId)

  for (const a of devAssignments ?? []) {
    for (const cid of criteriaIds) {
      await supabase.from("scores").upsert(
        {
          judge_assignment_id: a.id,
          criteria_id: cid,
          score: a.submission_id === devSubId ? 5 : 1,
        },
        { onConflict: "judge_assignment_id,criteria_id" }
      )
    }
  }

  const { calculateCoreOnlyResults } = await import("@/lib/services/judging")
  await calculateCoreOnlyResults(hackathonId)

  const prizeIds = await createPrizes(hackathonId, buildDefaultPrizes(criteriaIds))

  const { assigned, fulfillments } = await autoAssignAndInitFulfillments(hackathonId)

  console.log(`Winner's team: dev user. Results published, ${assigned} prizes assigned, ${fulfillments} fulfillment rows initialized.`)
  console.log(`Prize IDs: ${prizeIds.join(", ")}`)
  printReady(SLUG)
}

await run()
