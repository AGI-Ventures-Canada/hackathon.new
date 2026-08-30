import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon, PUBLISHED_STATUSES } from "@/lib/services/public-hackathons"
import { JudgeAssignmentsCard } from "@/components/hackathon/judging/judge-assignments-card"
import { BucketSortPanel } from "@/components/hackathon/judging/bucket-sort-panel"
import { GateCheckPanel } from "@/components/hackathon/judging/gate-check-panel"
import { JudgesPickPanel } from "@/components/hackathon/judging/judges-pick-panel"
import { PageHeader } from "@/components/page-header"
import { AutoRefresh } from "@/components/ui/auto-refresh"
import type { JudgePick } from "@/lib/db/hackathon-types"
import { routeJudgeAssignments } from "@/lib/utils/judging-assignment-routing"
import { JudgeWebMcpTools } from "@/components/hackathon/judging/judge-webmcp-tools"
import type { JudgeWebMcpAssignment } from "@/lib/webmcp/judge-tools"
import { JudgeWorkspaceState } from "@/components/hackathon/judging/judge-workspace-state"

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

  const { getRegistrationInfo } = await import("@/lib/services/hackathons")
  const registrationInfo = await getRegistrationInfo(hackathon.id, userId)

  if (!PUBLISHED_STATUSES.includes(hackathon.status)) {
    if (registrationInfo.participantRole === "judge") {
      return (
        <div className="p-4 md:p-6">
          {hackathon.status !== "archived" && (
            <AutoRefresh intervalMs={JUDGE_PAGE_REFRESH_INTERVAL_MS} />
          )}
          <JudgeWorkspaceState
            state={hackathon.status === "archived" ? "closed" : "draft"}
          />
        </div>
      )
    }
    notFound()
  }

  if (registrationInfo.participantRole !== "judge") {
    redirect(`/e/${slug}`)
  }

  const { isJudgingOpenForHackathon } = await import("@/lib/services/judging")
  const judgingIsOpen = await isJudgingOpenForHackathon(hackathon)

  if (!judgingIsOpen && hackathon.status !== "completed" && hackathon.status !== "archived") {
    return (
      <div className="p-4 md:p-6">
        <AutoRefresh intervalMs={JUDGE_PAGE_REFRESH_INTERVAL_MS} />
        <JudgeWorkspaceState state="before_judging" eventHref={`/e/${slug}`} />
      </div>
    )
  }

  if (hackathon.status !== "active" && hackathon.status !== "judging") {
    return (
      <div className="p-4 md:p-6">
        <JudgeWorkspaceState state="closed" eventHref={`/e/${slug}`} />
      </div>
    )
  }

  const { getJudgeAssignments } = await import("@/lib/services/judging")
  let judgeAssignments = await getJudgeAssignments(hackathon.id, userId)

  if (hackathon.anonymous_judging) {
    judgeAssignments = judgeAssignments.map((assignment) => ({
      ...assignment,
      teamName: null,
      teamMode: null,
      teamMemberCount: null,
      selfJudging: false,
    }))
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

  const webMcpAssignments: JudgeWebMcpAssignment[] = judgeAssignments.map((assignment) => ({
    id: assignment.id,
    submissionId: assignment.submissionId,
    title: assignment.submissionTitle,
    description: assignment.submissionDescription,
    githubUrl: assignment.submissionGithubUrl,
    liveAppUrl: assignment.submissionLiveAppUrl,
    demoVideoUrl: assignment.submissionDemoVideoUrl,
    teamName: assignment.teamName,
    isComplete: assignment.isComplete,
    notes: assignment.notes,
    judgingStyle:
      assignment.judgingStyle === "judges_pick" ||
      assignment.judgingStyle === "bucket_sort" ||
      assignment.judgingStyle === "gate_check"
        ? assignment.judgingStyle
        : "weighted_score",
    prizeName: assignment.prizeName,
  }))

  return (
    <JudgeWebMcpTools
      slug={slug}
      assignments={webMcpAssignments}
      enabled={judgingIsOpen}
    >
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
          <JudgeWorkspaceState
            state="waiting_for_assignments"
            eventHref={`/e/${slug}`}
          />
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
    </JudgeWebMcpTools>
  )
}
