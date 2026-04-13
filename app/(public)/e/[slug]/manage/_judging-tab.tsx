import { listPrizes, listJudges, getJudgingProgress, listRounds } from "@/lib/services/judging"
import { listJudgeInvitations } from "@/lib/services/judge-invitations"
import { calculateResults, getResults } from "@/lib/services/results"
import { JudgingTabClient } from "@/components/hackathon/judging/judging-tab-client"

export type JudgingTabContentProps = {
  hackathonId: string
  submissions: Array<{ id: string; title: string }>
  resultsPublishedAt: string | null
}

export async function JudgingTabContent({
  hackathonId,
  submissions,
  resultsPublishedAt,
}: JudgingTabContentProps) {
  if (!resultsPublishedAt) {
    await calculateResults(hackathonId)
  }


  const [prizes, judges, progress, rounds, pendingInvitations, results] = await Promise.all([
    listPrizes(hackathonId),
    listJudges(hackathonId),
    getJudgingProgress(hackathonId),
    listRounds(hackathonId),
    listJudgeInvitations(hackathonId, "pending"),
    getResults(hackathonId),
  ])

  const visiblePrizes = prizes.filter((p) => !p.is_screening)

  return (
    <JudgingTabClient
      hackathonId={hackathonId}
      prizes={visiblePrizes.map((p) => ({
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
      }))}
      judges={judges.map((j) => ({
        participantId: j.participantId,
        clerkUserId: j.clerkUserId,
        displayName: j.displayName,
        email: j.email,
        imageUrl: j.imageUrl,
        prizeIds: j.prizeIds,
      }))}
      progress={progress}
      rounds={rounds.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        isActive: r.status === "active",
        displayOrder: r.displayOrder,
        advancement: r.advancement,
        advancementConfig: r.advancementConfig,
        prizeCount: r.prizeCount,
        screeningPrizeId: r.screeningPrizeId,
      }))}
      pendingInvitations={pendingInvitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
        createdAt: inv.created_at,
      }))}
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
    />
  )
}
