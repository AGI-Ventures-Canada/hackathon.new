import {
  processAutoTransitions,
  reconcilePendingTeamsForClosedHackathons,
} from "@/lib/services/lifecycle"
import { processScheduledChallengeReleases } from "@/lib/services/challenges"
import { processDueSchedules } from "@/lib/services/schedules"
import { isAuthorizedCronRequest } from "@/lib/auth/cron"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [transitionsResult, releasesResult, schedulesResult, teamCloseoutResult] = await Promise.allSettled([
    processAutoTransitions(),
    processScheduledChallengeReleases(),
    processDueSchedules(),
    reconcilePendingTeamsForClosedHackathons(),
  ])
  const hasFailures =
    transitionsResult.status === "rejected" ||
    releasesResult.status === "rejected" ||
    schedulesResult.status === "rejected" ||
    teamCloseoutResult.status === "rejected" ||
    (transitionsResult.status === "fulfilled" && transitionsResult.value.errors.length > 0) ||
    (releasesResult.status === "fulfilled" && releasesResult.value.errors.length > 0) ||
    (schedulesResult.status === "fulfilled" && schedulesResult.value.failed > 0) ||
    (teamCloseoutResult.status === "fulfilled" && teamCloseoutResult.value.failed > 0)

  return Response.json({
    transitions:
      transitionsResult.status === "fulfilled"
        ? transitionsResult.value
        : { error: String(transitionsResult.reason) },
    scheduledChallengeReleases:
      releasesResult.status === "fulfilled"
        ? releasesResult.value
        : { error: String(releasesResult.reason) },
    schedules:
      schedulesResult.status === "fulfilled"
        ? schedulesResult.value
        : { error: String(schedulesResult.reason) },
    pendingTeamCloseout:
      teamCloseoutResult.status === "fulfilled"
        ? teamCloseoutResult.value
        : { error: String(teamCloseoutResult.reason) },
  }, { status: hasFailures ? 500 : 200 })
}
