import { getJudgingDistributionPreview } from "@/lib/services/judging-distribution"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/db/client"
import { isValidUuid } from "@/lib/utils/uuid"
import { getSubmissionDeadline } from "@/lib/services/schedule-items"
import { listJudgeInvitations } from "@/lib/services/judge-invitations"
import {
  evaluateJudgingSetup,
  getJudgingProgress,
  listCoreCriteria,
  listJudges,
  listPrizeCriteriaByPrizeIds,
  listPrizes,
  listRounds,
} from "@/lib/services/judging"
import { getJudgeNotificationDisposition, validateJudgingSchedule } from "@/lib/utils/judging-window"
import type {
  ConfigureJudgingInput,
  JudgingSettings,
  JudgingSetup,
  JudgingSetupIssue,
} from "@/lib/judging/setup"
import { judgingInvitationState } from "@/lib/judging/setup"

export class JudgingSetupError extends Error {
  constructor(
    public readonly code:
      "not_found" | "invalid_input" | "judging_changed" | "judging_locked" | "unavailable",
    message: string,
  ) {
    super(message)
  }
}

type SetupEvent = {
  id: string
  slug: string
  name: string
  status: string
  updated_at: string
  results_published_at: string | null
  judging_opens_at: string | null
  judging_closes_at: string | null
  judging_timezone: string
  judging_instructions: string | null
  judging_browse_enabled: boolean
  judging_target_reviews: number
  judging_reminders_enabled: boolean
  is_test_event: boolean
}

export async function getJudgingSetup(hackathonId: string): Promise<JudgingSetup> {
  if (!isValidUuid(hackathonId)) throw new JudgingSetupError("not_found", "Event not found.")
  const client = supabase() as unknown as SupabaseClient
  const [
    eventResult,
    prizes,
    judges,
    rounds,
    coreCriteria,
    invitations,
    progress,
    submissionDeadline,
    submissionsResult,
    roomsResult,
  ] = await Promise.all([
    client
      .from("hackathons")
      .select(
        "id,slug,name,status,updated_at,results_published_at,judging_opens_at,judging_closes_at,judging_timezone,judging_instructions,judging_browse_enabled,judging_target_reviews,judging_reminders_enabled,is_test_event",
      )
      .eq("id", hackathonId)
      .maybeSingle(),
    listPrizes(hackathonId),
    listJudges(hackathonId),
    listRounds(hackathonId),
    listCoreCriteria(hackathonId),
    listJudgeInvitations(hackathonId, "pending"),
    getJudgingProgress(hackathonId),
    getSubmissionDeadline(hackathonId),
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("status", "submitted"),
    client.from("rooms").select("id,name").eq("hackathon_id", hackathonId),
  ])
  if (eventResult.error || submissionsResult.error || roomsResult.error)
    throw new JudgingSetupError("unavailable", "We couldn't load judging settings. Try again.")
  if (!eventResult.data) throw new JudgingSetupError("not_found", "Event not found.")
  const event = eventResult.data as SetupEvent
  const criteriaMap = await listPrizeCriteriaByPrizeIds(prizes.map((prize) => prize.id))
  const allCriteria = [
    ...coreCriteria.map((c) => ({
      prize_id: null,
      weight: c.weight,
      min_score: c.minScore,
      max_score: c.maxScore,
    })),
    ...[...criteriaMap].flatMap(([prizeId, criteria]) =>
      criteria.map((c) => ({
        prize_id: prizeId,
        weight: c.weight,
        min_score: c.minScore,
        max_score: c.maxScore,
      })),
    ),
  ]
  const buckets = prizes.flatMap((p) =>
    (p.buckets ?? []).map((b) => ({ prize_id: p.id, label: b.label })),
  )
  const scoring = evaluateJudgingSetup(prizes, allCriteria, buckets)
  const issues: JudgingSetupIssue[] = []
  if (prizes.length === 0)
    issues.push({ code: "no_prizes", message: "Add your first prize.", editor: "prizes" })
  for (const prize of prizes) {
    for (const [index, message] of evaluateJudgingSetup(
      [prize],
      allCriteria,
      buckets,
    ).issues.entries()) {
      issues.push({
        code: `scorecard:${prize.id}:${index}`,
        message,
        editor: "scorecard",
        prizeId: prize.id,
      })
    }
  }
  if (scoring.requiresJudgeScoring && judges.length === 0)
    issues.push({
      code: "no_judges",
      message: invitations.length
        ? "Your judges still need to accept their invitations."
        : "Invite someone to judge.",
      editor: "judges",
    })
  if (
    scoring.requiresJudgeScoring &&
    !event.results_published_at &&
    !["completed", "archived"].includes(event.status)
  ) {
    const distribution = await getJudgingDistributionPreview(hackathonId, {
      targetReviewsPerProject: event.judging_target_reviews ?? 3,
    })
    const missing = distribution.coverage.filter((pair) => pair.assigned === 0)
    const reduced = distribution.coverage.filter(
      (pair) => pair.assigned > 0 && pair.assigned < (event.judging_target_reviews ?? 3),
    )
    for (const pair of missing)
      issues.push({
        code: `coverage:${pair.projectId}:${pair.prizeId}`,
        message: `${pair.projectTitle} needs judges for ${pair.prizeName}.`,
        editor: "assignments",
        prizeId: pair.prizeId,
      })
    if (reduced.length)
      issues.push({
        code: "reduced_coverage",
        message: `${reduced.length} prizes need more project reviews to meet your target.`,
        editor: "assignments",
        blocking: false,
      })
  }
  if (!event.judging_opens_at || !event.judging_closes_at)
    issues.push({
      code: "judging_schedule",
      message: "Set when judging opens and closes.",
      editor: "schedule",
      blocking: false,
    })
  const visiblePrizes = prizes.filter((p) => !p.is_screening)
  const invitationDetails = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    status: i.status,
    createdAt: i.created_at,
    emailedAt: i.emailed_at ?? null,
    remindedAt: i.reminded_at ?? null,
    ...judgingInvitationState(i, getJudgeNotificationDisposition(event) === "queue", new Date(), getJudgeNotificationDisposition(event) !== "reject"),
  }))
  const failedInvitations = invitationDetails.filter((invite) => invite.delivery === "failed")
  if (failedInvitations.length)
    issues.push({
      code: "invitation_delivery",
      message: `${failedInvitations.length} ${failedInvitations.length === 1 ? "invitation needs" : "invitations need"} another try.`,
      editor: "judges",
      blocking: false,
    })
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    version: event.updated_at,
    status: event.status,
    resultsPublishedAt: event.results_published_at,
    submissionDeadline,
    settings: {
      opensAt: event.judging_opens_at,
      closesAt: event.judging_closes_at,
      timezone: event.judging_timezone || "UTC",
      instructions: event.judging_instructions ?? "",
      browseEnabled: event.judging_browse_enabled ?? false,
      targetReviewsPerProject: event.judging_target_reviews ?? 3,
      remindersEnabled: event.judging_reminders_enabled ?? true,
    },
    prizes: visiblePrizes,
    coreCriteria,
    prizeCriteria: [...criteriaMap].map(([prizeId, criteria]) => ({ prizeId, criteria })),
    judges,
    rounds,
    rooms: roomsResult.data ?? [],
    invitations: invitationDetails,
    progress,
    submissionCount: submissionsResult.count ?? 0,
    readiness: {
      isReady: !issues.some((issue) => issue.blocking !== false),
      issues,
      requiresJudgeScoring: scoring.requiresJudgeScoring,
      scoringLocked:
        progress.completedAssignments > 0 ||
        !!event.results_published_at ||
        ["completed", "archived"].includes(event.status),
    },
  }
}

export function validateJudgingSettings(settings: JudgingSettings): string | null {
  const scheduleError = validateJudgingSchedule({
    opensAt: settings.opensAt,
    closesAt: settings.closesAt,
    timezone: settings.timezone,
  })
  if (scheduleError) return scheduleError
  if (
    !Number.isInteger(settings.targetReviewsPerProject) ||
    settings.targetReviewsPerProject < 1 ||
    settings.targetReviewsPerProject > 20
  )
    return "Choose between 1 and 20 judges per project."
  if (settings.instructions.length > 5000)
    return "Keep judging instructions under 5,000 characters."
  return null
}

export async function configureJudgingSetup(
  hackathonId: string,
  input: ConfigureJudgingInput,
): Promise<JudgingSetup> {
  const setup = await getJudgingSetup(hackathonId)
  const settings = { ...setup.settings, ...input.settings }
  const validationError = validateJudgingSettings(settings)
  if (validationError) throw new JudgingSetupError("invalid_input", validationError)
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("configure_judging_setup", {
    p_hackathon_id: hackathonId,
    p_expected_updated_at: input.expectedVersion,
    p_request_key: input.requestKey,
    p_settings: input.settings ?? {},
    p_apply_starter: input.applyStarter ?? false,
    p_prize_name: input.starterPrizeName ?? "Best overall",
  })
  if (error || !data) {
    const code = error?.message.includes("judging_changed")
      ? "judging_changed"
      : error?.message.includes("judging_locked")
        ? "judging_locked"
        : "unavailable"
    throw new JudgingSetupError(
      code,
      code === "judging_changed"
        ? "Judging changed. Reload the settings before saving."
        : code === "judging_locked"
          ? "Reviews have started. Add a new round to change scoring."
          : "We couldn't save judging settings. Try again.",
    )
  }
  const { reconcileJudgingNotifications } = await import("@/lib/services/judging-notifications")
  await reconcileJudgingNotifications(hackathonId).catch(() => {
    console.error("Judging notification reconciliation failed; cron will retry.")
  })
  return getJudgingSetup(hackathonId)
}
