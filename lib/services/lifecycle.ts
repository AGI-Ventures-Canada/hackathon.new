import { supabase as getSupabase } from "@/lib/db/client"
import type {
  Hackathon,
  HackathonStatus,
  TransitionEvent,
  TransitionTrigger,
} from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getEffectiveStatus } from "@/lib/utils/timeline"
import {
  EventMutationLeaseError,
  withEventMutationLease,
} from "@/lib/services/event-mutation-lease"

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
    | "transition_unavailable"
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
      code: "event_changed" | "invalid_transition" | "transition_unavailable"
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
  const isSkipAheadCompletion =
    trigger === "auto" &&
    toStatus === "completed" &&
    fromStatus !== "archived" &&
    !validTargets?.includes(toStatus)
  if (!isSkipAheadCompletion && !validTargets?.includes(toStatus)) {
    return {
      success: false,
      error: `Invalid transition from ${fromStatus} to ${toStatus}`,
      code: "invalid_transition",
    }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const updateData: Record<string, unknown> = {
    status: toStatus,
    updated_at: new Date().toISOString(),
  }
  if (input.registrationOpensAt !== undefined) {
    updateData.registration_opens_at = input.registrationOpensAt
  }
  if (input.registrationClosesAt !== undefined) {
    updateData.registration_closes_at = input.registrationClosesAt
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
  }

  const { data: hackathon, error: updateError } = await client
    .from("hackathons")
    .update(updateData)
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .eq("status", fromStatus)
    .select()
    .maybeSingle()

  if (updateError) {
    console.error("Failed to update hackathon status:", updateError)
    return {
      success: false,
      error: "Failed to update status. Try again.",
      code: "transition_unavailable",
    }
  }
  if (!hackathon) {
    return {
      success: false,
      error: "Failed to update status: status has already changed",
      code: "event_changed",
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

async function runTransitionSideEffects(
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
  if (event && !isSkipAheadCompletion) {
    const { dispatchTransitionNotifications } = await import(
      "./notification-dispatcher"
    )
    dispatchTransitionNotifications({
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
    }).catch((err) => {
      console.error(
        `Failed to dispatch notifications for ${fromStatus} → ${toStatus}:`,
        err
      )
    })
  }

  if (
    toStatus === "registration_open" ||
    toStatus === "active" ||
    toStatus === "published"
  ) {
    const { reschedulePreEventReminders } = await import(
      "./pre-event-reminders"
    )
    reschedulePreEventReminders(hackathonId).catch((err) => {
      console.error(
        `Failed to schedule pre-event reminders for ${hackathonId}:`,
        err
      )
    })
  }

  if (toStatus === "completed" || toStatus === "archived") {
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
  }

  if (
    toStatus === "draft" ||
    toStatus === "completed" ||
    toStatus === "archived"
  ) {
    const { cancelRemindersForEntity } = await import("./smart-reminders")
    cancelRemindersForEntity("hackathon_event", hackathonId).catch((err) =>
      console.error(
        `Failed to cancel pre-event reminders for hackathon ${hackathonId}:`,
        err
      )
    )
  }

}

export type AutoTransitionResult = {
  processed: number
  transitions: Array<{ hackathonId: string; from: string; to: string }>
  errors: string[]
}

export async function processAutoTransitions(): Promise<AutoTransitionResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathons, error } = await client
    .from("hackathons")
    .select("id, tenant_id, status, starts_at, ends_at, name, slug")
    .not("status", "in", "(draft,completed,archived)")

  if (error || !hackathons) {
    return { processed: 0, transitions: [], errors: [error?.message ?? "Failed to fetch hackathons"] }
  }

  const result: AutoTransitionResult = {
    processed: 0,
    transitions: [],
    errors: [],
  }

  for (const h of hackathons) {
    const stored = h.status as HackathonStatus
    const effective = getEffectiveStatus({
      status: stored,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
    })

    if (effective === stored) continue

    let transitionResult: TransitionResult
    try {
      transitionResult = await executeTransition({
        hackathonId: h.id as string,
        tenantId: h.tenant_id as string,
        fromStatus: stored,
        toStatus: effective,
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
        to: effective,
      })
    } else if (transitionResult.error) {
      result.errors.push(
        `${h.id}: ${transitionResult.error}`
      )
    }
  }

  return result
}
