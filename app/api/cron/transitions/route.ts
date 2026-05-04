import { processAutoTransitions } from "@/lib/services/lifecycle"
import { processScheduledChallengeReleases } from "@/lib/services/challenges"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [transitionsResult, releasesResult] = await Promise.allSettled([
    processAutoTransitions(),
    processScheduledChallengeReleases(),
  ])
  return Response.json({
    transitions:
      transitionsResult.status === "fulfilled"
        ? transitionsResult.value
        : { error: String(transitionsResult.reason) },
    scheduledChallengeReleases:
      releasesResult.status === "fulfilled"
        ? releasesResult.value
        : { error: String(releasesResult.reason) },
  })
}
