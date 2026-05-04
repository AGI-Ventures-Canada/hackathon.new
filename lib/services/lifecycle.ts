import { supabase as getSupabase } from "@/lib/db/client"
import type {
  Hackathon,
  HackathonStatus,
  TransitionEvent,
  TransitionTrigger,
} from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getEffectiveStatus } from "@/lib/utils/timeline"

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
  completed: "results_published",
}

export type TransitionInput = {
  hackathonId: string
  tenantId: string
  fromStatus: HackathonStatus
  toStatus: HackathonStatus
  trigger: TransitionTrigger
  triggeredBy: string
}

export type TransitionResult = {
  success: boolean
  error?: string
  hackathon?: Hackathon
}

export async function executeTransition(
  input: TransitionInput
): Promise<TransitionResult> {
  const { fromStatus, toStatus, hackathonId, tenantId, trigger, triggeredBy } =
    input

  const validTargets = VALID_TRANSITIONS[fromStatus]
  if (!validTargets?.includes(toStatus)) {
    return {
      success: false,
      error: `Invalid transition from ${fromStatus} to ${toStatus}`,
    }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: updateError } = await client
    .from("hackathons")
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .eq("status", fromStatus)
    .select()
    .single()

  if (updateError || !hackathon) {
    return {
      success: false,
      error: `Failed to update status: ${updateError?.message ?? "status has already changed"}`,
    }
  }

  await client.from("hackathon_transitions").insert({
    hackathon_id: hackathonId,
    from_status: fromStatus,
    to_status: toStatus,
    trigger,
    triggered_by: triggeredBy,
  })

  const event = STATUS_TO_EVENT[toStatus]
  if (event) {
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

  if (toStatus === "published" || toStatus === "active") {
    const { releaseChallenges } = await import("./challenges")
    const { getTriggerItem } = await import("./schedule-items")
    const triggerItem = await getTriggerItem(hackathonId, "challenge_release")
    if (triggerItem) {
      const linkedToEventPublish = triggerItem.linked_to === "event_publish"
      const linkedToEventStart =
        toStatus === "active" && triggerItem.linked_to === "event_start"
      const customTimePassed =
        toStatus === "active" &&
        triggerItem.linked_to === null &&
        triggerItem.starts_at <= new Date().toISOString()
      if (linkedToEventPublish || linkedToEventStart || customTimePassed) {
        releaseChallenges(hackathonId, tenantId).catch((err) => {
          console.error(
            `Failed to auto-release challenges for ${hackathonId}:`,
            err
          )
        })
      }
    }
  }

  if (toStatus === "completed" || toStatus === "archived") {
    const { cancelRemindersForEntity } = await import("./smart-reminders")
    cancelRemindersForEntity("hackathon_event", hackathonId).catch((err) =>
      console.error(`Failed to cancel pre-event reminders for hackathon ${hackathonId}:`, err)
    )
  }

  return { success: true, hackathon: hackathon as unknown as Hackathon }
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

    const transitionResult = await executeTransition({
      hackathonId: h.id as string,
      tenantId: h.tenant_id as string,
      fromStatus: stored,
      toStatus: effective,
      trigger: "auto",
      triggeredBy: "system",
    })

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

