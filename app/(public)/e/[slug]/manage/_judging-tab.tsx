import { listPrizes, listJudges, getJudgingProgress, listRounds, listCoreCriteria, listPrizeCriteriaByPrizeIds, getWeightedScoreAssignmentSummary } from "@/lib/services/judging"
import { listJudgeInvitations, listPendingJudgeNotifications } from "@/lib/services/judge-invitations"
import { calculateResults, getResults, getResultsByPrize } from "@/lib/services/results"
import { JudgingTabClient } from "@/components/hackathon/judging/judging-tab-client"
import type { ManageJtab } from "@/lib/utils/manage-tabs"

export type JudgingTabContentProps = {
  hackathonId: string
  slug: string
  submissions: Array<{ id: string; title: string }>
  resultsPublishedAt: string | null
  activeJtab: ManageJtab
  locationType: "in_person" | "virtual" | "hybrid" | null
  hackathonStatus?: string | null
  notificationDisposition?: "queue" | "send" | "reject"
}

export async function JudgingTabContent({
  hackathonId,
  slug,
  submissions,
  resultsPublishedAt,
  activeJtab,
  locationType,
  hackathonStatus = null,
  notificationDisposition,
}: JudgingTabContentProps) {
  if (!resultsPublishedAt) {
    await calculateResults(hackathonId)
  }

  const prizes = await listPrizes(hackathonId)
  const visiblePrizes = prizes.filter((p) => !p.is_screening)

  const weightedPrizeIds = visiblePrizes
    .filter((p) => p.judging_style === "weighted_score")
    .map((p) => p.id)
  const hasWeightedPrizes = weightedPrizeIds.length > 0

  const [judges, progress, rounds, pendingInvitations, pendingNotifications, results, coreCriteria, weightedAssignmentSummary, weightedPrizeCriteriaMap, resultsByPrize] = await Promise.all([
    listJudges(hackathonId),
    getJudgingProgress(hackathonId),
    listRounds(hackathonId),
    listJudgeInvitations(hackathonId, "pending"),
    listPendingJudgeNotifications(hackathonId),
    getResults(hackathonId),
    listCoreCriteria(hackathonId),
    hasWeightedPrizes ? getWeightedScoreAssignmentSummary(hackathonId) : Promise.resolve(undefined),
    listPrizeCriteriaByPrizeIds(weightedPrizeIds),
    getResultsByPrize(hackathonId),
  ])

  const queuedNotificationParticipantIds = new Set(
    pendingNotifications.map((notification) => notification.participantId),
  )

  const prizesForClient = visiblePrizes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    value: p.value,
    judgingStyle: p.judging_style,
    assignmentMode: p.assignment_mode,
    maxPicks: p.max_picks,
    roundId: p.round_id,
    displayOrder: p.display_order,
    totalAssignments: p.totalAssignments,
    completedAssignments: p.completedAssignments,
    judgeCount: p.judgeCount,
    allowedTeamModes: p.allowed_team_modes,
    sponsorName: p.sponsorName ?? null,
    criteria:
      p.judging_style === "weighted_score"
        ? (weightedPrizeCriteriaMap.get(p.id) ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            weight: c.weight,
            minScore: c.minScore,
            maxScore: c.maxScore,
          }))
        : (p.criteria?.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
          })) ?? null),
    buckets: p.buckets?.map((b) => ({
      id: b.id,
      level: b.level,
      label: b.label,
      description: b.description,
    })) ?? null,
  }))

  const judgesForClient = judges.map((j) => ({
    participantId: j.participantId,
    clerkUserId: j.clerkUserId,
    displayName: j.displayName,
    email: j.email,
    imageUrl: j.imageUrl,
    prizeIds: j.prizeIds,
    notificationQueued: queuedNotificationParticipantIds.has(j.participantId),
  }))

  const roundsForClient = rounds.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    isActive: r.status === "active",
    displayOrder: r.displayOrder,
    advancement: r.advancement,
    advancementConfig: r.advancementConfig,
    prizeCount: r.prizeCount,
    submissionCount: r.submissionCount,
    screeningPrizeId: r.screeningPrizeId,
  }))

  const pendingInvitesForClient = pendingInvitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: inv.status,
    createdAt: inv.created_at,
    remindedAt: inv.reminded_at ?? null,
    emailedAt: inv.emailed_at ?? null,
    token: inv.token,
  }))

  return (
    <JudgingTabClient
      hackathonId={hackathonId}
      slug={slug}
      prizes={prizesForClient}
      judges={judgesForClient}
      progress={progress}
      rounds={roundsForClient}
      pendingInvitations={pendingInvitesForClient}
      results={results.map((r) => ({
        id: r.id,
        rank: r.rank,
        submissionId: r.submission_id,
        submissionTitle: r.submissionTitle,
        teamName: r.teamName,
        totalScore: r.total_score,
        weightedScore: r.weighted_score,
        judgeCount: r.judge_count,
        publishedAt: r.published_at,
        prizes: r.prizes,
      }))}
      submissions={submissions}
      isPublished={resultsPublishedAt !== null}
      locationType={locationType}
      hackathonStatus={hackathonStatus}
      notificationDisposition={notificationDisposition}
      activeJtab={activeJtab}
      coreCriteria={coreCriteria}
      weightedAssignmentSummary={weightedAssignmentSummary}
      resultsByPrize={resultsByPrize}
    />
  )
}
