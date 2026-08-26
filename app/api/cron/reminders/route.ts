import { processPendingReminders } from "@/lib/services/smart-reminders"
import { processAllPendingReminders } from "@/lib/services/post-event-reminders"
import { retryPendingResultEmails } from "@/lib/services/results"
import { retryPendingTeamInvitationEmails } from "@/lib/services/team-invitations"
import { retryPendingJudgeInvitationEmails } from "@/lib/services/judge-invitations"
import { isAuthorizedCronRequest } from "@/lib/auth/cron"
import { createDeliveryBudget } from "@/lib/services/delivery-budget"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const CRON_BATCH_LIMITS = {
  scheduled: 25,
  postEvent: 5,
  results: 5,
  teamInvitations: 20,
  judgeInvitations: 20,
} as const

const CRON_RECIPIENT_LIMIT = 12
const WORKER_WINDOW_MS = 30_000
const CRON_WORK_DEADLINE_MS = 250_000

function createWorkerBudget(startedAt: number) {
  return createDeliveryBudget(
    CRON_RECIPIENT_LIMIT,
    Math.min(startedAt + CRON_WORK_DEADLINE_MS, Date.now() + WORKER_WINDOW_MS),
  )
}

async function settle<T>(work: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await work() }
  } catch (reason) {
    return { status: "rejected", reason }
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const scheduled = await settle(() => processPendingReminders(
    CRON_BATCH_LIMITS.scheduled,
    {},
    createWorkerBudget(startedAt),
  ))
  const postEvent = await settle(() => processAllPendingReminders(
    CRON_BATCH_LIMITS.postEvent,
    createWorkerBudget(startedAt),
  ))
  const results = await settle(() => retryPendingResultEmails(
    CRON_BATCH_LIMITS.results,
    createWorkerBudget(startedAt),
  ))
  const teamInvitations = await settle(() =>
    retryPendingTeamInvitationEmails(
      CRON_BATCH_LIMITS.teamInvitations,
      createWorkerBudget(startedAt),
    ))
  const judgeInvitations = await settle(() =>
    retryPendingJudgeInvitationEmails(
      CRON_BATCH_LIMITS.judgeInvitations,
      createWorkerBudget(startedAt),
    ))

  const hasFailures =
    scheduled.status === "rejected" ||
    postEvent.status === "rejected" ||
    results.status === "rejected" ||
    teamInvitations.status === "rejected" ||
    judgeInvitations.status === "rejected" ||
    (scheduled.status === "fulfilled" && scheduled.value.errors > 0) ||
    (postEvent.status === "fulfilled" && postEvent.value.errors > 0) ||
    (results.status === "fulfilled" && results.value.errors > 0) ||
    (teamInvitations.status === "fulfilled" && teamInvitations.value.failed > 0) ||
    (judgeInvitations.status === "fulfilled" && judgeInvitations.value.failed > 0)

  return Response.json({
    scheduled:
      scheduled.status === "fulfilled"
        ? scheduled.value
        : { error: String(scheduled.reason) },
    postEvent:
      postEvent.status === "fulfilled"
        ? postEvent.value
        : { error: String(postEvent.reason) },
    results:
      results.status === "fulfilled"
        ? results.value
        : { error: String(results.reason) },
    teamInvitations:
      teamInvitations.status === "fulfilled"
        ? teamInvitations.value
        : { error: String(teamInvitations.reason) },
    judgeInvitations:
      judgeInvitations.status === "fulfilled"
        ? judgeInvitations.value
        : { error: String(judgeInvitations.reason) },
  }, { status: hasFailures ? 500 : 200 })
}
