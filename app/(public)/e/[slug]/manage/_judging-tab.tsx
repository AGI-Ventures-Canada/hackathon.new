import { listPrizes, listJudges, getJudgingProgress, listRounds } from "@/lib/services/judging"
import { listJudgeInvitations } from "@/lib/services/judge-invitations"
import { calculateResults, getResults } from "@/lib/services/results"
import { JudgingTabClient } from "@/components/hackathon/judging/judging-tab-client"
import { JudgingSetupWizard } from "@/components/hackathon/judging/judging-setup-wizard"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "./_tabs-url-sync"
import type { ManageJtab } from "@/lib/utils/manage-tabs"

export type JudgingTabContentProps = {
  hackathonId: string
  slug: string
  submissions: Array<{ id: string; title: string }>
  resultsPublishedAt: string | null
  activeJtab: ManageJtab
  hasJudgingSetup: boolean
}

export async function JudgingTabContent({
  hackathonId,
  slug,
  submissions,
  resultsPublishedAt,
  activeJtab,
  hasJudgingSetup,
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
    criteria: p.criteria?.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })) ?? null,
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
    screeningPrizeId: r.screeningPrizeId,
  }))

  const pendingInvitesForClient = pendingInvitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: inv.status,
    createdAt: inv.created_at,
  }))

  const dataView = (
    <JudgingTabClient
      hackathonId={hackathonId}
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
    />
  )

  const wizard = (
    <JudgingSetupWizard
      hackathonId={hackathonId}
      slug={slug}
      prizes={prizesForClient}
      judges={judgesForClient}
      rounds={roundsForClient}
      pendingInvitations={pendingInvitesForClient}
    />
  )

  if (!hasJudgingSetup) {
    return wizard
  }

  return (
    <TabsUrlSync paramKey="jtab" value={activeJtab}>
      <TabsList variant="line">
        <TabsTrigger value="data">All data</TabsTrigger>
        <TabsTrigger value="setup">Setup guide</TabsTrigger>
      </TabsList>
      <TabsContent value="data" forceMount className="data-[state=inactive]:hidden">
        {dataView}
      </TabsContent>
      <TabsContent value="setup" forceMount className="data-[state=inactive]:hidden">
        {wizard}
      </TabsContent>
    </TabsUrlSync>
  )
}
