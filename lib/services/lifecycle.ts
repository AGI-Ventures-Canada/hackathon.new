import { supabase as getSupabase } from "@/lib/db/client"
import type {
  Hackathon,
  HackathonPhase,
  HackathonStatus,
  TransitionEvent,
  TransitionTrigger,
} from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  EventMutationLeaseError,
  withEventMutationLease,
} from "@/lib/services/event-mutation-lease"
import {
  compensateResultPublication,
  readResultPublicationState,
  stageResultPublication,
} from "@/lib/services/result-publication"
import { getJudgingSetupStatus } from "@/lib/services/judging"

const VALID_TRANSITIONS: Record<HackathonStatus, HackathonStatus[]> = {
  draft: ["published", "registration_open"],
  published: ["registration_open", "active", "draft"],
  registration_open: ["active", "published", "draft"],
  active: ["judging", "completed", "registration_open", "published", "draft"],
  judging: ["completed", "active", "registration_open", "published", "draft"],
  completed: ["archived", "judging", "active", "registration_open", "published", "draft"],
  archived: [],
}

const STATUS_TO_EVENT: Partial<Record<HackathonStatus, TransitionEvent>> = {
  registration_open: "registration_opened",
  active: "hackathon_started",
  judging: "judging_started",
}

export type TransitionInput = {
  hackathonId: string
  tenantId: string
  fromStatus: HackathonStatus
  toStatus: HackathonStatus
  trigger: TransitionTrigger
  triggeredBy: string
  registrationOpensAt?: string
  registrationClosesAt?: string | null
  endsAt?: string | null
  resultsPublication?: {
    publishedAt: string
  }
}

export type TransitionResult = {
  success: boolean
  error?: string
  code?:
    | EventMutationLeaseError["code"]
    | "event_changed"
    | "invalid_transition"
    | "judging_not_ready"
    | "transition_unavailable"
  issues?: string[]
  hackathon?: Hackathon
}

type TransitionCommitResult =
  | {
      success: true
      hackathon: Hackathon
      isSkipAheadCompletion: boolean
    }
  | {
      success: false
      error: string
      code:
        | "event_changed"
        | "invalid_transition"
        | "judging_not_ready"
        | "transition_unavailable"
      issues?: string[]
    }

export type JudgingReadiness = {
  isReady: boolean
  canCompleteWithoutJudging: boolean
  requiresJudgeScoring: boolean
  issues: string[]
  submissionCount: number
  judgeCount: number
  unassignedSubmissionCount: number
}

export type JudgingCompletionReadiness = {
  isReady: boolean
  issues: string[]
  incompleteAssignmentCount: number
  incompletePickListCount: number
}

type JudgingPrizeRow = {
  id: string
  judging_style: string | null
  round_id: string | null
}

type JudgingAssignmentRow = {
  id?: string
  submission_id: string
  prize_id: string | null
  judge_participant_id: string
  assignment_kind: string | null
  round_id?: string | null
  is_complete?: boolean | null
}

const JUDGE_SCORED_STYLES = new Set([
  "weighted_score",
  "gate_check",
  "bucket_sort",
  "judges_pick",
])

export async function getJudgingReadiness(
  hackathonId: string,
): Promise<JudgingReadiness> {
  const client = getSupabase() as unknown as SupabaseClient
  const [submissions, prizes] = await Promise.all([
    client
      .from("submissions")
      .select("id", { count: "exact" })
      .eq("hackathon_id", hackathonId)
      .eq("status", "submitted"),
    client
      .from("prizes")
      .select("id, judging_style, round_id")
      .eq("hackathon_id", hackathonId),
  ])

  const submissionRows = (submissions.data ?? []) as Array<{ id: string }>
  const submissionCount = submissions.count ?? submissionRows.length
  if (submissions.error) {
    return {
      isReady: false,
      canCompleteWithoutJudging: false,
      requiresJudgeScoring: false,
      issues: ["We couldn't check the projects. Try again."],
      submissionCount: 0,
      judgeCount: 0,
      unassignedSubmissionCount: 0,
    }
  }

  if (submissionCount === 0) {
    return {
      isReady: false,
      canCompleteWithoutJudging: true,
      requiresJudgeScoring: false,
      issues: ["No projects are ready to score."],
      submissionCount: 0,
      judgeCount: 0,
      unassignedSubmissionCount: 0,
    }
  }

  if (prizes.error) {
    return {
      isReady: false,
      canCompleteWithoutJudging: false,
      requiresJudgeScoring: false,
      issues: ["We couldn't check how projects will be judged. Try again."],
      submissionCount,
      judgeCount: 0,
      unassignedSubmissionCount: 0,
    }
  }

  const prizeRows = (prizes.data ?? []) as JudgingPrizeRow[]
  const judgeScoredPrizes = prizeRows.filter((prize) =>
    JUDGE_SCORED_STYLES.has(prize.judging_style ?? ""),
  )
  const requiresJudgeScoring = judgeScoredPrizes.length > 0
  const setup = await getJudgingSetupStatus(hackathonId)

  if (!requiresJudgeScoring) {
    return {
      isReady: setup.isReady,
      canCompleteWithoutJudging: false,
      requiresJudgeScoring: false,
      issues: setup.issues,
      submissionCount,
      judgeCount: 0,
      unassignedSubmissionCount: 0,
    }
  }

  const [judges, assignments, activeRound] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "judge"),
    client
      .from("judge_assignments")
      .select("submission_id, prize_id, judge_participant_id, assignment_kind, round_id")
      .eq("hackathon_id", hackathonId),
    client
      .from("judging_rounds")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ])

  const judgeRows = (judges.data ?? []) as Array<{ id: string }>
  const judgeCount = judgeRows.length
  const issues: string[] = []

  if (judges.error) {
    issues.push("We couldn't check the judges. Try again.")
  } else if (judgeCount === 0) {
    issues.push("Add at least one judge.")
  }

  issues.push(...setup.issues)

  if (submissionRows.length !== submissionCount || assignments.error) {
    issues.push("We couldn't check who will score each project. Try again.")
  }

  const relevantRoundIds = new Set(
    judgeScoredPrizes
      .map((prize) => prize.round_id)
      .filter((roundId): roundId is string => roundId !== null),
  )
  const activeRoundId = (activeRound.data as { id: string } | null)?.id ?? null
  if (activeRoundId) relevantRoundIds.add(activeRoundId)

  const roundSubmissions = relevantRoundIds.size > 0
    ? await client
        .from("round_submissions")
        .select("round_id, submission_id")
        .in("round_id", [...relevantRoundIds])
    : { data: [] as Array<{ round_id: string; submission_id: string }>, error: null }

  if (activeRound.error || roundSubmissions.error) {
    issues.push("We couldn't check the judging rounds. Try again.")
  }

  const acceptedJudgeIds = new Set(judgeRows.map((judge) => judge.id))
  const validAssignments = ((assignments.data ?? []) as JudgingAssignmentRow[])
    .filter((assignment) => acceptedJudgeIds.has(assignment.judge_participant_id))
  const submittedIds = new Set(submissionRows.map((submission) => submission.id))
  const roundPools = new Map<string, Set<string>>()
  for (const row of roundSubmissions.data ?? []) {
    if (!submittedIds.has(row.submission_id)) continue
    const pool = roundPools.get(row.round_id) ?? new Set<string>()
    pool.add(row.submission_id)
    roundPools.set(row.round_id, pool)
  }

  const missingSubmissionIds = new Set<string>()
  const weightedPrizes = judgeScoredPrizes.filter(
    (prize) => prize.judging_style === "weighted_score",
  )
  if (weightedPrizes.length > 0) {
    const weightedPool = activeRoundId && (roundPools.get(activeRoundId)?.size ?? 0) > 0
      ? roundPools.get(activeRoundId)!
      : submittedIds
    const assignedIds = new Set(
      validAssignments
        .filter((assignment) => assignment.assignment_kind === "unified_weighted_score")
        .map((assignment) => assignment.submission_id),
    )
    for (const submissionId of weightedPool) {
      if (!assignedIds.has(submissionId)) missingSubmissionIds.add(submissionId)
    }
  }

  for (const prize of judgeScoredPrizes) {
    if (prize.judging_style === "weighted_score") continue
    const prizePool = prize.round_id && (roundPools.get(prize.round_id)?.size ?? 0) > 0
      ? roundPools.get(prize.round_id)!
      : submittedIds
    const assignedIds = new Set(
      validAssignments
        .filter((assignment) => assignment.prize_id === prize.id)
        .map((assignment) => assignment.submission_id),
    )
    for (const submissionId of prizePool) {
      if (!assignedIds.has(submissionId)) missingSubmissionIds.add(submissionId)
    }
  }

  const unassignedSubmissionCount = missingSubmissionIds.size
  if (
    !assignments.error &&
    submissionRows.length === submissionCount &&
    !activeRound.error &&
    !roundSubmissions.error &&
    unassignedSubmissionCount > 0
  ) {
    issues.push(
      `${unassignedSubmissionCount} ${unassignedSubmissionCount === 1 ? "project still needs" : "projects still need"} judge assignments.`,
    )
  }

  return {
    isReady:
      submissionCount > 0 &&
      !judges.error &&
      judgeCount > 0 &&
      setup.isReady &&
      !assignments.error &&
      submissionRows.length === submissionCount &&
      !activeRound.error &&
      !roundSubmissions.error &&
      unassignedSubmissionCount === 0,
    canCompleteWithoutJudging: false,
    requiresJudgeScoring,
    issues,
    submissionCount,
    judgeCount,
    unassignedSubmissionCount,
  }
}

export async function getJudgingCompletionReadiness(
  hackathonId: string,
): Promise<JudgingCompletionReadiness> {
  const startReadiness = await getJudgingReadiness(hackathonId)
  if (startReadiness.canCompleteWithoutJudging) {
    return {
      isReady: true,
      issues: [],
      incompleteAssignmentCount: 0,
      incompletePickListCount: 0,
    }
  }
  if (!startReadiness.isReady) {
    return {
      isReady: false,
      issues: startReadiness.issues,
      incompleteAssignmentCount: 0,
      incompletePickListCount: 0,
    }
  }
  if (!startReadiness.requiresJudgeScoring) {
    return {
      isReady: true,
      issues: [],
      incompleteAssignmentCount: 0,
      incompletePickListCount: 0,
    }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const [prizes, judges, assignments, activeRound] = await Promise.all([
    client
      .from("prizes")
      .select("id, judging_style, round_id")
      .eq("hackathon_id", hackathonId),
    client
      .from("hackathon_participants")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "judge"),
    client
      .from("judge_assignments")
      .select("id, submission_id, prize_id, judge_participant_id, assignment_kind, round_id, is_complete")
      .eq("hackathon_id", hackathonId),
    client
      .from("judging_rounds")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ])

  if (prizes.error || judges.error || assignments.error || activeRound.error) {
    return {
      isReady: false,
      issues: ["We couldn't check the judging work. Try again."],
      incompleteAssignmentCount: 0,
      incompletePickListCount: 0,
    }
  }

  const prizeRows = (prizes.data ?? []) as JudgingPrizeRow[]
  const prizeStyles = new Map(
    prizeRows.map((prize) => [prize.id, prize.judging_style]),
  )
  const hasWeightedScoring = prizeRows.some(
    (prize) => prize.judging_style === "weighted_score",
  )
  const acceptedJudgeIds = new Set(
    ((judges.data ?? []) as Array<{ id: string }>).map((judge) => judge.id),
  )
  const activeRoundId = (activeRound.data as { id: string } | null)?.id ?? null
  const relevantAssignments = ((assignments.data ?? []) as JudgingAssignmentRow[])
    .filter((assignment) => acceptedJudgeIds.has(assignment.judge_participant_id))
    .filter(
      (assignment) =>
        !activeRoundId ||
        assignment.round_id === null ||
        assignment.round_id === undefined ||
        assignment.round_id === activeRoundId,
    )
    .filter((assignment) => {
      if (
        hasWeightedScoring &&
        assignment.assignment_kind === "unified_weighted_score"
      ) return true
      if (!assignment.prize_id) return false
      return JUDGE_SCORED_STYLES.has(
        prizeStyles.get(assignment.prize_id) ?? "",
      )
    })

  const incompleteAssignmentCount = relevantAssignments.filter((assignment) => {
    if (
      assignment.prize_id &&
      prizeStyles.get(assignment.prize_id) === "judges_pick"
    ) return false
    return assignment.is_complete !== true
  }).length

  const requiredPickLists = new Set(
    relevantAssignments
      .filter(
        (assignment) =>
          assignment.prize_id !== null &&
          prizeStyles.get(assignment.prize_id) === "judges_pick",
      )
      .map(
        (assignment) =>
          `${assignment.judge_participant_id}:${assignment.prize_id}`,
      ),
  )
  let incompletePickListCount = 0
  if (requiredPickLists.size > 0) {
    const { data: picks, error: picksError } = await client
      .from("judge_picks")
      .select("judge_participant_id, prize_id")
      .eq("hackathon_id", hackathonId)
    if (picksError) {
      return {
        isReady: false,
        issues: ["We couldn't check the judges' picks. Try again."],
        incompleteAssignmentCount,
        incompletePickListCount: 0,
      }
    }
    const completedPickLists = new Set(
      (picks ?? []).map(
        (pick) => `${pick.judge_participant_id}:${pick.prize_id}`,
      ),
    )
    incompletePickListCount = [...requiredPickLists].filter(
      (key) => !completedPickLists.has(key),
    ).length
  }

  const issues: string[] = []
  if (incompleteAssignmentCount > 0) {
    issues.push(
      `${incompleteAssignmentCount} ${incompleteAssignmentCount === 1 ? "judge task still needs" : "judge tasks still need"} a score.`,
    )
  }
  if (incompletePickListCount > 0) {
    issues.push(
      `${incompletePickListCount} ${incompletePickListCount === 1 ? "judge still needs" : "judges still need"} to send picks.`,
    )
  }

  return {
    isReady: issues.length === 0,
    issues,
    incompleteAssignmentCount,
    incompletePickListCount,
  }
}

export async function executeTransition(
  input: TransitionInput
): Promise<TransitionResult> {
  let commit: TransitionCommitResult
  try {
    commit = await withEventMutationLease(input.hackathonId, () =>
      commitTransition(input),
    )
  } catch (error) {
    if (error instanceof EventMutationLeaseError) {
      return { success: false, error: error.message, code: error.code }
    }
    throw error
  }

  if (!commit.success) return commit

  await runTransitionSideEffects(
    input,
    commit.hackathon,
    commit.isSkipAheadCompletion,
  )

  return { success: true, hackathon: commit.hackathon }
}

async function commitTransition(
  input: TransitionInput,
): Promise<TransitionCommitResult> {
  const { fromStatus, toStatus, hackathonId, tenantId, trigger, triggeredBy } =
    input

  const validTargets = VALID_TRANSITIONS[fromStatus]
  const isSkipAheadCompletion = false
  if (!validTargets?.includes(toStatus)) {
    return {
      success: false,
      error: `Invalid transition from ${fromStatus} to ${toStatus}`,
      code: "invalid_transition",
    }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const transitionNow = new Date()

  if (toStatus === "judging") {
    const readiness = await getJudgingReadiness(hackathonId)
    if (!readiness.isReady) {
      return {
        success: false,
        error: `Get judging ready first. ${readiness.issues.join(" ")}`,
        code: "judging_not_ready",
        issues: readiness.issues,
      }
    }
  }

  if (fromStatus === "active" && toStatus === "completed") {
    const readiness = await getJudgingReadiness(hackathonId)
    if (!readiness.canCompleteWithoutJudging) {
      const issues = readiness.issues.filter(
        (issue) => issue !== "No projects are ready to score.",
      )
      return {
        success: false,
        error: `Projects must go through judging before the event can finish.${issues.length > 0 ? ` ${issues.join(" ")}` : ""}`,
        code: "judging_not_ready",
        ...(issues.length > 0 ? { issues } : {}),
      }
    }
  }

  if (fromStatus === "judging" && toStatus === "completed") {
    const readiness = await getJudgingCompletionReadiness(hackathonId)
    if (!readiness.isReady) {
      return {
        success: false,
        error: `Finish judging first. ${readiness.issues.join(" ")}`,
        code: "judging_not_ready",
        issues: readiness.issues,
      }
    }
  }

  const isManualReopen =
    trigger === "manual" &&
    toStatus === "active" &&
    (fromStatus === "judging" || fromStatus === "completed")
  let activeRoundToReset: string | null = null
  let judgingPhase: HackathonPhase = "preliminaries"
  if (input.endsAt !== undefined || isManualReopen) {
    const { data: currentDates, error: currentDatesError } = await client
      .from("hackathons")
      .select("status, phase, starts_at, ends_at")
      .eq("id", hackathonId)
      .eq("tenant_id", tenantId)
      .maybeSingle()

    if (currentDatesError) {
      return {
        success: false,
        error: "We couldn't check the event dates. Try again.",
        code: "transition_unavailable",
      }
    }
    if (!currentDates || currentDates.status !== fromStatus) {
      return {
        success: false,
        error: "The event changed. Refresh the page and try again.",
        code: "event_changed",
      }
    }

    const candidateEnd =
      input.endsAt !== undefined ? input.endsAt : currentDates.ends_at
    if (
      trigger === "manual" &&
      toStatus === "active" &&
      candidateEnd === null
    ) {
      return {
        success: false,
        error: "Pick a future end time before reopening this event.",
        code: "invalid_transition",
      }
    }
    if (candidateEnd !== null) {
      const endTime = new Date(candidateEnd).getTime()
      if (!Number.isFinite(endTime)) {
        return {
          success: false,
          error: "Pick a valid event end time.",
          code: "invalid_transition",
        }
      }
      if (
        currentDates.starts_at &&
        new Date(currentDates.starts_at).getTime() >= endTime
      ) {
        return {
          success: false,
          error: "The event must end after it starts.",
          code: "invalid_transition",
        }
      }
      if (
        trigger === "manual" &&
        toStatus === "active" &&
        endTime <= transitionNow.getTime()
      ) {
        return {
          success: false,
          error: "Pick a future end time before reopening this event.",
          code: "invalid_transition",
        }
      }
    }

    if (isManualReopen) {
      const { data: activeRound, error: activeRoundError } = await client
        .from("judging_rounds")
        .select("id")
        .eq("hackathon_id", hackathonId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
      if (activeRoundError) {
        return {
          success: false,
          error: "We couldn't close the current judging round. Try again.",
          code: "transition_unavailable",
        }
      }
      activeRoundToReset = (activeRound as { id: string } | null)?.id ?? null
    }
  }

  if (toStatus === "judging") {
    const { data: activeRound, error: activeRoundError } = await client
      .from("judging_rounds")
      .select("round_type")
      .eq("hackathon_id", hackathonId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (activeRoundError) {
      return {
        success: false,
        error: "We couldn't check the current judging round. Try again.",
        code: "transition_unavailable",
      }
    }
    judgingPhase =
      (activeRound as { round_type: string | null } | null)?.round_type ===
      "finals"
        ? "finals"
        : "preliminaries"
  }

  const updateData: Record<string, unknown> = {
    status: toStatus,
    phase:
      toStatus === "active"
        ? isManualReopen
          ? "submission_open"
          : "build"
        : toStatus === "judging"
          ? judgingPhase
          : null,
    updated_at: transitionNow.toISOString(),
  }
  if (input.registrationOpensAt !== undefined) {
    updateData.registration_opens_at = input.registrationOpensAt
  }
  if (input.registrationClosesAt !== undefined) {
    updateData.registration_closes_at = input.registrationClosesAt
  }
  if (input.endsAt !== undefined) {
    updateData.ends_at = input.endsAt
  }
  if (input.resultsPublication) {
    if (toStatus !== "completed") {
      return {
        success: false,
        error: "Results can only be published when completing an event",
        code: "invalid_transition",
      }
    }
    updateData.results_published_at = input.resultsPublication.publishedAt
    updateData.winner_emails_sent_at = null
    updateData.results_announcement_sent_at = null
  } else if (fromStatus === "completed" && toStatus !== "archived") {
    updateData.results_published_at = null
    updateData.winner_emails_sent_at = null
    updateData.results_announcement_sent_at = null
  }

  if (input.resultsPublication) {
    const { data: current, error: currentError } = await client
      .from("hackathons")
      .select("status, results_published_at")
      .eq("id", hackathonId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (currentError) {
      return {
        success: false,
        error: "Failed to verify the event before publishing results",
        code: "transition_unavailable",
      }
    }
    if (
      !current ||
      current.status !== fromStatus ||
      current.results_published_at
    ) {
      return {
        success: false,
        error: "Failed to update status: status has already changed",
        code: "event_changed",
      }
    }

    const staged = await stageResultPublication(
      client,
      hackathonId,
      input.resultsPublication.publishedAt,
    )
    if (!staged.success) {
      return {
        success: false,
        error: staged.error,
        code: "transition_unavailable",
      }
    }
  }

  if (activeRoundToReset) {
    const { error: roundResetError } = await client
      .from("judging_rounds")
      .update({
        status: "planned",
        is_active: false,
        updated_at: transitionNow.toISOString(),
      })
      .eq("id", activeRoundToReset)
      .eq("hackathon_id", hackathonId)
      .eq("status", "active")
    if (roundResetError) {
      return {
        success: false,
        error: "We couldn't close the current judging round. Try again.",
        code: "transition_unavailable",
      }
    }
  }

  let hackathon: unknown = null
  let updateError: { message: string } | null = null
  let updateFailure:
    | {
        error: string
        code: "event_changed" | "transition_unavailable"
        cause?: unknown
      }
    | undefined
  try {
    const updateResult = await client
      .from("hackathons")
      .update(updateData)
      .eq("id", hackathonId)
      .eq("tenant_id", tenantId)
      .eq("status", fromStatus)
      .select()
      .maybeSingle()
    hackathon = updateResult.data
    updateError = updateResult.error
  } catch (error) {
    updateFailure = {
      error: "Failed to update status. Try again.",
      code: "transition_unavailable",
      cause: error,
    }
  }

  if (updateError) {
    updateFailure = {
      error: "Failed to update status. Try again.",
      code: "transition_unavailable",
      cause: updateError,
    }
  } else if (!hackathon && !updateFailure) {
    updateFailure = {
      error: "Failed to update status: status has already changed",
      code: "event_changed",
    }
  }

  if (updateFailure) {
    if (activeRoundToReset) {
      const { data: restored, error: restoreError } = await client.rpc(
        "activate_judging_round",
        {
          p_hackathon_id: hackathonId,
          p_round_id: activeRoundToReset,
        },
      )
      if (restoreError || restored !== true) {
        console.error(
          `Failed to restore judging round ${activeRoundToReset} after a status update failure:`,
          restoreError,
        )
      }
    }
    if (input.resultsPublication) {
      const publicationState = await readResultPublicationState(
        client,
        hackathonId,
        tenantId,
        input.resultsPublication.publishedAt,
      )
      if (publicationState.state === "committed") {
        hackathon = publicationState.hackathon
      } else {
        if (publicationState.state === "not_committed") {
          try {
            await compensateResultPublication(
              client,
              hackathonId,
              input.resultsPublication.publishedAt,
            )
          } catch (error) {
            console.error("Failed to reconcile result publication:", error)
            return {
              success: false,
              error: "Result publication could not be confirmed. Try again.",
              code: "transition_unavailable",
            }
          }
        }
        if (updateFailure.cause) {
          console.error("Failed to update hackathon status:", updateFailure.cause)
        }
        return {
          success: false,
          error: updateFailure.error,
          code: updateFailure.code,
        }
      }
    } else {
      if (updateFailure.cause) {
        console.error("Failed to update hackathon status:", updateFailure.cause)
      }
      return {
        success: false,
        error: updateFailure.error,
        code: updateFailure.code,
      }
    }
  }

  if (fromStatus === "completed" && toStatus !== "archived") {
    const { error: unpublishError } = await client
      .from("hackathon_results")
      .update({ published_at: null })
      .eq("hackathon_id", hackathonId)
    if (unpublishError) {
      console.error("Failed to clear stale result publication state:", unpublishError)
    }
  }

  await client.from("hackathon_transitions").insert({
    hackathon_id: hackathonId,
    from_status: fromStatus,
    to_status: toStatus,
    trigger,
    triggered_by: triggeredBy,
  })

  return {
    success: true,
    hackathon: hackathon as unknown as Hackathon,
    isSkipAheadCompletion,
  }
}

export async function runTransitionSideEffects(
  input: TransitionInput,
  hackathon: Hackathon,
  isSkipAheadCompletion: boolean,
): Promise<void> {
  const { fromStatus, toStatus, hackathonId, tenantId, trigger, triggeredBy } =
    input

  let coincidentChallenges:
    | Array<{ title: string; description: string | null }>
    | undefined

  if (toStatus === "published" || toStatus === "active") {
    try {
      const { getTriggerItem } = await import("./schedule-items")
      const triggerItem = await getTriggerItem(
        hackathonId,
        "challenge_release"
      )
      if (triggerItem) {
        const linkedToEventPublish = triggerItem.linked_to === "event_publish"
        const linkedToEventStart =
          toStatus === "active" && triggerItem.linked_to === "event_start"
        const customTimePassed =
          toStatus === "active" &&
          triggerItem.linked_to === null &&
          triggerItem.starts_at <= new Date().toISOString()
        const shouldRelease =
          linkedToEventPublish || linkedToEventStart || customTimePassed

        if (shouldRelease) {
          const releaseTrigger: "event_publish" | "event_start" | "scheduled" =
            linkedToEventPublish
              ? "event_publish"
              : linkedToEventStart
                ? "event_start"
                : "scheduled"
          const { releaseChallenges, listChallenges } = await import(
            "./challenges"
          )
          const released = await releaseChallenges(hackathonId, tenantId, {
            dispatchNotification: false,
            trigger: releaseTrigger,
          })
          if (released) {
            const items = await listChallenges(hackathonId)
            if (items.length > 0) {
              coincidentChallenges = items.map((c) => ({
                title: c.title,
                description: c.description,
              }))
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `Failed to evaluate challenge release for ${hackathonId}:`,
        err
      )
    }
  }

  const event = STATUS_TO_EVENT[toStatus]
  const isResultsRollback = fromStatus === "completed" && toStatus === "judging"
  if (event && !isSkipAheadCompletion && !isResultsRollback) {
    const { dispatchTransitionNotifications } = await import(
      "./notification-dispatcher"
    )
    try {
      await dispatchTransitionNotifications({
        type: event,
        hackathonId,
        tenantId,
        hackathon: {
          name: hackathon.name,
          slug: hackathon.slug,
          starts_at: hackathon.starts_at,
          ends_at: hackathon.ends_at,
        },
        trigger,
        triggeredBy,
        fromStatus,
        toStatus,
        challenges: coincidentChallenges,
        isTestEvent: hackathon.is_test_event,
      })
    } catch (err) {
      console.error(
        `Failed to dispatch notifications for ${fromStatus} → ${toStatus}:`,
        err
      )
    }
  }

  const { reschedulePreEventReminders } = await import(
    "./pre-event-reminders"
  )
  try {
    await reschedulePreEventReminders(hackathonId)
  } catch (err) {
    console.error(
      `Failed to reconcile pre-event reminders for ${hackathonId}:`,
      err,
    )
  }

  if (toStatus === "completed" || toStatus === "archived") {
    try {
      await closePendingJudgeWorkForClosedHackathon(hackathonId)
    } catch (error) {
      console.error(
        `Failed to close pending judge work for hackathon ${hackathonId}:`,
        error,
      )
    }

    try {
      const { denyPendingTeamsForClosedHackathon } = await import("./hackathons")
      let closeout = await denyPendingTeamsForClosedHackathon(hackathonId)
      for (let attempt = 1; attempt < 3 && closeout.failed.length > 0; attempt++) {
        closeout = await denyPendingTeamsForClosedHackathon(hackathonId)
      }
      if (closeout.failed.length > 0) {
        console.error(
          `Failed to close ${closeout.failed.length} pending team(s) for hackathon ${hackathonId}:`,
          closeout.failed
        )
      }
    } catch (error) {
      console.error(
        `Failed to close pending teams for hackathon ${hackathonId}:`,
        error,
      )
    }
  }

}

export type AutoTransitionResult = {
  processed: number
  transitions: Array<{ hackathonId: string; from: string; to: string }>
  errors: string[]
}

export type ClosedTeamReconciliationResult = {
  events: number
  denied: number
  failed: number
  errors: string[]
}

export type ClosedJudgeWorkReconciliationResult = {
  events: number
  failed: number
  errors: string[]
}

export async function closePendingJudgeWorkForClosedHackathon(
  hackathonId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError) {
    throw new Error(`Failed to check the closed event: ${hackathonError.message}`)
  }
  if (!hackathon || !["completed", "archived"].includes(hackathon.status)) {
    return false
  }

  const closedAt = now.toISOString()
  const invitationResult = await client
    .from("judge_invitations")
    .update({ status: "cancelled", updated_at: closedAt })
    .eq("hackathon_id", hackathonId)
    .in("status", ["pending", "expired"])
  if (invitationResult.error) {
    throw new Error(`Failed to close judge invitations: ${invitationResult.error.message}`)
  }

  const notificationResult = await client
    .from("judge_pending_notifications")
    .delete()
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)
  if (notificationResult.error) {
    throw new Error(`Failed to close judge emails: ${notificationResult.error.message}`)
  }

  const reminderResult = await client
    .from("scheduled_reminders")
    .update({ cancelled_at: closedAt })
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)
    .is("cancelled_at", null)
  if (reminderResult.error) {
    throw new Error(`Failed to close judge reminders: ${reminderResult.error.message}`)
  }

  return true
}

export async function reconcilePendingJudgeWorkForClosedHackathons(
  limit: number = 50,
  now: Date = new Date(),
): Promise<ClosedJudgeWorkReconciliationResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)))
  const candidateIds = new Set<string>()
  const errors: string[] = []

  const invitationResult = await client
    .from("judge_invitations")
    .select("hackathon_id, hackathons!inner(status)")
    .in("status", ["pending", "expired"])
    .in("hackathons.status", ["completed", "archived"])
    .order("updated_at", { ascending: true })
    .limit(boundedLimit)
  if (invitationResult.error) errors.push(invitationResult.error.message)
  for (const row of invitationResult.data ?? []) {
    if (typeof row.hackathon_id === "string") candidateIds.add(row.hackathon_id)
  }

  const notificationResult = await client
    .from("judge_pending_notifications")
    .select("hackathon_id, hackathons!inner(status)")
    .is("sent_at", null)
    .in("hackathons.status", ["completed", "archived"])
    .order("created_at", { ascending: true })
    .limit(boundedLimit)
  if (notificationResult.error) errors.push(notificationResult.error.message)
  for (const row of notificationResult.data ?? []) {
    if (typeof row.hackathon_id === "string") candidateIds.add(row.hackathon_id)
  }

  const reminderResult = await client
    .from("scheduled_reminders")
    .select("hackathon_id, hackathons!inner(status)")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .in("hackathons.status", ["completed", "archived"])
    .order("scheduled_for", { ascending: true })
    .limit(boundedLimit)
  if (reminderResult.error) errors.push(reminderResult.error.message)
  for (const row of reminderResult.data ?? []) {
    if (typeof row.hackathon_id === "string") candidateIds.add(row.hackathon_id)
  }

  let events = 0
  let failed = errors.length
  for (const hackathonId of [...candidateIds].slice(0, boundedLimit)) {
    try {
      if (await closePendingJudgeWorkForClosedHackathon(hackathonId, now)) events++
    } catch (error) {
      failed++
      errors.push(
        `${hackathonId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return { events, failed, errors }
}

export async function reconcilePendingTeamsForClosedHackathons(
  limit: number = 50,
): Promise<ClosedTeamReconciliationResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("teams")
    .select("hackathon_id, hackathon:hackathons!inner(status)")
    .eq("status", "pending_approval")
    .in("hackathon.status", ["completed", "archived"])
    .limit(limit)

  if (error) {
    return { events: 0, denied: 0, failed: 0, errors: [error.message] }
  }

  const hackathonIds = [...new Set(
    (data ?? []).map((team) => team.hackathon_id as string),
  )]
  const result: ClosedTeamReconciliationResult = {
    events: hackathonIds.length,
    denied: 0,
    failed: 0,
    errors: [],
  }
  const { denyPendingTeamsForClosedHackathon } = await import("./hackathons")

  for (const hackathonId of hackathonIds) {
    try {
      const closeout = await denyPendingTeamsForClosedHackathon(hackathonId)
      result.denied += closeout.denied
      result.failed += closeout.failed.length
      if (closeout.failed.length > 0) {
        result.errors.push(
          `${hackathonId}: ${closeout.failed.map((failure) => `${failure.teamId}:${failure.code}`).join(",")}`,
        )
      }
    } catch (closeoutError) {
      result.failed++
      result.errors.push(
        `${hackathonId}: ${closeoutError instanceof Error ? closeoutError.message : String(closeoutError)}`,
      )
    }
  }

  return result
}

function hasReached(value: string | null, now: Date): boolean {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time <= now.getTime()
}

export const AUTO_TRANSITION_BATCH_LIMIT = 50
export const AUTO_TRANSITION_PAGE_WINDOW_MS = 60_000

export async function processAutoTransitions(
  now: Date = new Date(),
): Promise<AutoTransitionResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const firstPageResult = await client
    .from("hackathons")
    .select(
      "id, tenant_id, status, registration_opens_at, starts_at, ends_at, name, slug, is_test_event",
      { count: "exact" },
    )
    .not("status", "in", "(draft,completed,archived)")
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .range(0, AUTO_TRANSITION_BATCH_LIMIT - 1)

  if (firstPageResult.error || !firstPageResult.data) {
    return {
      processed: 0,
      transitions: [],
      errors: [firstPageResult.error?.message ?? "Failed to fetch hackathons"],
    }
  }

  const totalCandidates = firstPageResult.count ?? firstPageResult.data.length
  const pageCount = Math.max(
    1,
    Math.ceil(totalCandidates / AUTO_TRANSITION_BATCH_LIMIT),
  )
  const pageIndex = Math.floor(
    now.getTime() / AUTO_TRANSITION_PAGE_WINDOW_MS,
  ) % pageCount
  let hackathons = firstPageResult.data

  if (pageIndex > 0) {
    const pageStart = pageIndex * AUTO_TRANSITION_BATCH_LIMIT
    const pageResult = await client
      .from("hackathons")
      .select("id, tenant_id, status, registration_opens_at, starts_at, ends_at, name, slug, is_test_event")
      .not("status", "in", "(draft,completed,archived)")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(pageStart, pageStart + AUTO_TRANSITION_BATCH_LIMIT - 1)

    if (pageResult.error || !pageResult.data) {
      return {
        processed: 0,
        transitions: [],
        errors: [pageResult.error?.message ?? "Failed to fetch hackathons"],
      }
    }
    hackathons = pageResult.data
  }

  const result: AutoTransitionResult = {
    processed: 0,
    transitions: [],
    errors: [],
  }

  for (const h of hackathons) {
    if (h.is_test_event) continue
    const stored = h.status as HackathonStatus
    let targetStatus: HackathonStatus | null = null

    if (stored === "published" || stored === "registration_open") {
      if (hasReached(h.starts_at, now)) {
        targetStatus = "active"
      } else if (
        stored === "published" &&
        hasReached(h.registration_opens_at, now)
      ) {
        targetStatus = "registration_open"
      }
    } else if (stored === "active") {
      const eventEndReached = hasReached(h.ends_at, now)
      const { data: submissionDeadline, error: deadlineError } = await client
        .from("hackathon_schedule_items")
        .select("starts_at")
        .eq("hackathon_id", h.id)
        .eq("trigger_type", "submission_deadline")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      const submissionDeadlineReached = hasReached(
        submissionDeadline?.starts_at ?? null,
        now,
      )

      if (deadlineError && !eventEndReached) {
        result.errors.push(
          `${h.id}: We couldn't check the project deadline. Try again.`,
        )
        continue
      }
      if (!eventEndReached && !submissionDeadlineReached) continue

      let readiness: JudgingReadiness
      try {
        readiness = await getJudgingReadiness(h.id as string)
      } catch (readinessError) {
        result.errors.push(
          `${h.id}: ${readinessError instanceof Error ? readinessError.message : String(readinessError)}`,
        )
        continue
      }

      if (readiness.canCompleteWithoutJudging) {
        targetStatus = "completed"
      } else if (readiness.isReady) {
        targetStatus = "judging"
      } else {
        result.errors.push(`${h.id}: ${readiness.issues.join(" ")}`)
        continue
      }
    }

    if (!targetStatus || targetStatus === stored) continue

    let transitionResult: TransitionResult
    try {
      transitionResult = await executeTransition({
        hackathonId: h.id as string,
        tenantId: h.tenant_id as string,
        fromStatus: stored,
        toStatus: targetStatus,
        trigger: "auto",
        triggeredBy: "system",
      })
    } catch (error) {
      result.errors.push(
        `${h.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }

    if (transitionResult.success) {
      result.processed++
      result.transitions.push({
        hackathonId: h.id as string,
        from: stored,
        to: targetStatus,
      })
    } else if (transitionResult.error) {
      result.errors.push(
        `${h.id}: ${transitionResult.error}`
      )
    }
  }

  return result
}
