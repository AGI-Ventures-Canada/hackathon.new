import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon, PUBLISHED_STATUSES } from "@/lib/services/public-hackathons"
import { JudgeAssignmentsCard } from "@/components/hackathon/judging/judge-assignments-card"
import { BucketSortPanel } from "@/components/hackathon/judging/bucket-sort-panel"
import { GateCheckPanel } from "@/components/hackathon/judging/gate-check-panel"
import { JudgesPickPanel } from "@/components/hackathon/judging/judges-pick-panel"
import { PageHeader } from "@/components/page-header"
import { AutoRefresh } from "@/components/ui/auto-refresh"
import { Clock } from "lucide-react"
import type { JudgePick } from "@/lib/db/hackathon-types"
import { routeJudgeAssignments } from "@/lib/utils/judging-assignment-routing"

const JUDGE_PAGE_REFRESH_INTERVAL_MS = 15000

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function JudgePage({ params }: PageProps) {
  const { slug } = await params
  const { userId } = await auth()

  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/judge`)}`)
  }

  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) {
    notFound()
  }

  if (!PUBLISHED_STATUSES.includes(hackathon.status)) {
    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole === "judge") {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <Clock className="size-10 text-muted-foreground mb-4" />
          <h1 className="text-xl font-semibold mb-2">This event isn&apos;t live yet</h1>
          <p className="text-muted-foreground max-w-md">
            Judging assignments will appear here once the hackathon is published.
            Check back later.
          </p>
        </div>
      )
    }
    notFound()
  }

  const { getRegistrationInfo } = await import("@/lib/services/hackathons")
  const registrationInfo = await getRegistrationInfo(hackathon.id, userId)

  if (registrationInfo.participantRole !== "judge") {
    redirect(`/e/${slug}`)
  }

  const { getJudgeAssignments } = await import("@/lib/services/judging")
  let judgeAssignments = await getJudgeAssignments(hackathon.id, userId)

  if (hackathon.anonymous_judging) {
    judgeAssignments = judgeAssignments.map((a) => ({ ...a, teamName: null, teamMemberCount: null }))
  }

  const {
    scored: scoredAssignments,
    bucketGroups,
    gateGroups,
    pickGroups,
  } = routeJudgeAssignments(judgeAssignments)
  const visibleAssignmentCount =
    scoredAssignments.length +
    bucketGroups.reduce((count, [, assignments]) => count + assignments.length, 0) +
    gateGroups.reduce((count, [, assignments]) => count + assignments.length, 0) +
    pickGroups.reduce((count, [, assignments]) => count + assignments.length, 0)

  let judgePicks: JudgePick[] = []
  if (pickGroups.length > 0 && registrationInfo.participantId) {
    const { getJudgePicks } = await import("@/lib/services/judge-picks")
    judgePicks = await getJudgePicks(hackathon.id, registrationInfo.participantId)
  }

  const hasUnifiedAssignments = judgeAssignments.some(
    (a) => a.assignmentKind === "unified_weighted_score"
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      <AutoRefresh intervalMs={JUDGE_PAGE_REFRESH_INTERVAL_MS} />
      <PageHeader
        breadcrumbs={[
          { label: hackathon.name, href: `/e/${slug}` },
          { label: "Judging" },
        ]}
        title="Judging"
        description="Review your assigned projects"
      />

      {visibleAssignmentCount === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          You don&apos;t have any assignments yet.
        </p>
      ) : (
        <div className="space-y-6">
          {pickGroups.map(([prizeId, assignments]) => (
            <JudgesPickPanel
              key={prizeId}
              hackathonSlug={slug}
              prizeId={prizeId}
              prizeName={assignments[0]?.prizeName ?? "Judge's pick"}
              maxPicks={Math.max(1, assignments[0]?.maxPicks ?? 1)}
              assignments={assignments}
              initialPicks={judgePicks
                .filter((pick) => pick.prize_id === prizeId)
                .map((pick) => ({ submissionId: pick.submission_id, rank: pick.rank }))}
            />
          ))}

          {bucketGroups.map(([prizeId, assignments]) => (
            <BucketSortPanel
              key={prizeId}
              hackathonSlug={slug}
              prizeName={assignments[0]?.prizeName ?? "Project ranking"}
              assignments={assignments}
            />
          ))}

          {gateGroups.map(([prizeId, assignments]) => (
            <GateCheckPanel
              key={prizeId}
              hackathonSlug={slug}
              prizeName={assignments[0]?.prizeName ?? "Requirements check"}
              assignments={assignments}
            />
          ))}

          {scoredAssignments.length > 0 && (
            <JudgeAssignmentsCard
              hackathonSlug={slug}
              assignments={scoredAssignments}
              teamSettings={{
                minTeamSize: hackathon.min_team_size,
                allowSolo: hackathon.allow_solo,
              }}
              summaryHref={hasUnifiedAssignments ? `/e/${slug}/judge/summary` : undefined}
            />
          )}
        </div>
      )}
    </div>
  )
}
