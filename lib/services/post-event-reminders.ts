import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PostEventReminder } from "@/lib/db/hackathon-types"
import { createHash } from "node:crypto"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

function publicationFingerprint(publicationVersion: string): string {
  return createHash("sha256").update(publicationVersion).digest("hex").slice(0, 24)
}

export async function schedulePostEventReminders(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, name, slug, status, results_published_at, feedback_survey_sent_at, feedback_survey_url")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load event for post-event reminders: ${hackathonError.message}`)
  }
  if (!hackathon || !hackathon.results_published_at || hackathon.status !== "completed") return 0

  const now = new Date()
  const reminders: Array<{
    hackathon_id: string
    type: string
    scheduled_for: string
    recipient_filter: string
    metadata: Record<string, unknown>
    cancelled_at: null
  }> = []

  const prizeClaimDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  reminders.push({
    hackathon_id: hackathonId,
    type: "prize_claim",
    scheduled_for: prizeClaimDate.toISOString(),
    recipient_filter: "winners",
    metadata: {
      hackathonName: hackathon.name,
      hackathonSlug: hackathon.slug,
      publicationVersion: hackathon.results_published_at,
    },
    cancelled_at: null,
  })

  const orgReminderDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  reminders.push({
    hackathon_id: hackathonId,
    type: "organizer_fulfillment",
    scheduled_for: orgReminderDate.toISOString(),
    recipient_filter: "organizers",
    metadata: {
      hackathonName: hackathon.name,
      hackathonSlug: hackathon.slug,
      publicationVersion: hackathon.results_published_at,
    },
    cancelled_at: null,
  })

  // Only schedule feedback_followup if a survey URL is already configured.
  // If the organizer sets a URL after results are published, they can manually
  // send the survey from the Post-Event panel — no automatic backfill occurs.
  if (!hackathon.feedback_survey_sent_at && hackathon.feedback_survey_url) {
    const feedbackDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    reminders.push({
      hackathon_id: hackathonId,
      type: "feedback_followup",
      scheduled_for: feedbackDate.toISOString(),
      recipient_filter: "all_participants",
      metadata: {
        hackathonName: hackathon.name,
        hackathonSlug: hackathon.slug,
        publicationVersion: hackathon.results_published_at,
        surveyUrl: hackathon.feedback_survey_url,
      },
      cancelled_at: null,
    })
  }

  let created = 0
  for (const reminder of reminders) {
    const { data: existing, error: existingError } = await client
      .from("post_event_reminders")
      .select("sent_at, cancelled_at, metadata")
      .eq("hackathon_id", hackathonId)
      .eq("type", reminder.type)
      .maybeSingle()

    if (existingError) {
      throw new Error(`Failed to inspect ${reminder.type} reminder: ${existingError.message}`)
    }
    if (existing?.sent_at) continue
    if (existing?.cancelled_at) {
      const metadata = existing.metadata as Record<string, unknown> | null
      if (metadata?.cancellationReason !== "results_unpublished") continue
    }

    const { error } = await client
      .from("post_event_reminders")
      .upsert(reminder, {
        onConflict: "hackathon_id,type",
      })

    if (error) {
      throw new Error(`Failed to schedule ${reminder.type} reminder: ${error.message}`)
    }
    created++
  }

  return created
}

export async function listReminders(hackathonId: string): Promise<PostEventReminder[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("post_event_reminders")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("scheduled_for")

  if (error) {
    console.error("Failed to list reminders:", error)
    return []
  }

  return (data ?? []) as PostEventReminder[]
}

export async function getReminderById(
  reminderId: string,
  hackathonId: string
): Promise<PostEventReminder | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("post_event_reminders")
    .select("*")
    .eq("id", reminderId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (error || !data) return null
  return data as PostEventReminder
}

export async function cancelReminder(
  reminderId: string,
  hackathonId: string
): Promise<boolean> {
  try {
    const result = await withDeliveryLease(`post-event-reminder:${reminderId}`, async () => {
      const client = getSupabase() as unknown as SupabaseClient
      const { data, error } = await client
        .from("post_event_reminders")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", reminderId)
        .eq("hackathon_id", hackathonId)
        .is("sent_at", null)
        .is("cancelled_at", null)
        .select("id")
      if (error) throw new Error(`Failed to cancel reminder: ${error.message}`)
      return data !== null && data.length > 0
    })
    return result.acquired ? result.value : false
  } catch {
    return false
  }
}

export async function getPendingReminders(limit = 50): Promise<PostEventReminder[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("post_event_reminders")
    .select("*")
    .lte("scheduled_for", new Date().toISOString())
    .is("sent_at", null)
    .is("cancelled_at", null)
    .order("scheduled_for")
    .limit(limit)

  if (error) {
    throw new Error(`Failed to get pending post-event reminders: ${error.message}`)
  }

  return (data ?? []) as PostEventReminder[]
}

async function getPendingReminderForDelivery(
  reminderId: string,
  hackathonId: string,
): Promise<PostEventReminder | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("post_event_reminders")
    .select("*")
    .eq("id", reminderId)
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load pending post-event reminder: ${error.message}`)
  }

  if (Array.isArray(data)) {
    return (data as PostEventReminder[]).find(
      (reminder) => reminder.id === reminderId,
    ) ?? null
  }
  return data as PostEventReminder | null
}

async function markReminderCancelled(
  reminderId: string,
  expectedScheduledFor?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  let query = client
    .from("post_event_reminders")
    .update({
      cancelled_at: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    })
    .eq("id", reminderId)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (expectedScheduledFor) {
    query = query.eq("scheduled_for", expectedScheduledFor)
  }

  const { error } = await query

  if (error) {
    throw new Error(`Failed to cancel stale post-event reminder: ${error.message}`)
  }
}

async function validateReminderLifecycle(
  reminder: PostEventReminder,
): Promise<"send" | "cancel" | "stale"> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .select("status, results_published_at")
    .eq("id", reminder.hackathon_id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to validate post-event reminder: ${error.message}`)
  }

  if (!data?.results_published_at || data.status !== "completed") return "cancel"

  const metadata = reminder.metadata as Record<string, unknown>
  const publicationVersion = typeof metadata.publicationVersion === "string"
    ? metadata.publicationVersion
    : null
  if (publicationVersion && publicationVersion !== data.results_published_at) return "stale"

  return "send"
}

export async function markReminderSent(
  reminderId: string,
  expectedScheduledFor?: string,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("post_event_reminders")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", reminderId)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (expectedScheduledFor) {
    query = query.eq("scheduled_for", expectedScheduledFor)
  }

  const { data, error } = await query.select("id")

  if (error || data?.length !== 1) {
    throw new Error(`Failed to mark post-event reminder sent: ${error?.message ?? "reminder is no longer pending"}`)
  }
}

async function processPendingReminder(
  reminder: PostEventReminder,
  budget?: DeliveryBudget,
): Promise<{ sent: number; deferred: boolean }> {
  const lifecycle = await validateReminderLifecycle(reminder)
  if (lifecycle === "cancel") {
    await markReminderCancelled(reminder.id, reminder.scheduled_for)
    return { sent: 0, deferred: false }
  }
  if (lifecycle === "stale") {
    const metadata = reminder.metadata as Record<string, unknown>
    await markReminderCancelled(reminder.id, reminder.scheduled_for, {
      ...metadata,
      cancellationReason: "stale_publication",
      cancelledPublicationVersion:
        typeof metadata.publicationVersion === "string"
          ? metadata.publicationVersion
          : null,
    })
    return { sent: 0, deferred: false }
  }

  const metadata = reminder.metadata as Record<string, unknown>
  const hackathonName = typeof metadata.hackathonName === "string"
    ? metadata.hackathonName.trim()
    : ""
  const hackathonSlug = typeof metadata.hackathonSlug === "string"
    ? metadata.hackathonSlug.trim()
    : ""
  if (!hackathonName || !hackathonSlug) {
    throw new Error("Post-event reminder is missing its event name or URL slug.")
  }

  const {
    sendReminderEmailsWithResult,
    buildPrizeClaimReminderContent,
    buildOrganizerFulfillmentReminderContent,
    buildFeedbackFollowupContent,
  } = await import("@/lib/email/post-event-reminders")

  const publicationVersion = typeof metadata.publicationVersion === "string"
    ? metadata.publicationVersion
    : null
  const deliveryKey = publicationVersion
    ? `post-event/${reminder.id}/${publicationFingerprint(publicationVersion)}`
    : `post-event/${reminder.id}`
  let summary: {
    eligible: number
    sent: number
    failed: number
    deferred?: true
  } = { eligible: 0, sent: 0, failed: 0 }

  if (reminder.type === "prize_claim") {
    const content = buildPrizeClaimReminderContent(hackathonName, hackathonSlug)
    summary = await sendReminderEmailsWithResult(
      reminder.hackathon_id,
      "prize_claim",
      reminder.recipient_filter,
      (name) => ({ ...content, hackathonName, participantName: name }),
      deliveryKey,
      budget,
    )
  } else if (reminder.type === "organizer_fulfillment") {
    const { getFulfillmentSummary } = await import("@/lib/services/prize-fulfillment")
    const fulfillmentSummary = await getFulfillmentSummary(reminder.hackathon_id)
    const unfulfilled =
      fulfillmentSummary.assigned +
      fulfillmentSummary.contacted +
      fulfillmentSummary.shipped
    if (unfulfilled > 0) {
      const content = buildOrganizerFulfillmentReminderContent(hackathonName, hackathonSlug, unfulfilled)
      summary = await sendReminderEmailsWithResult(
        reminder.hackathon_id,
        "organizer_fulfillment",
        reminder.recipient_filter,
        (name) => ({ ...content, hackathonName, participantName: name }),
        deliveryKey,
        budget,
      )
    }
  } else if (reminder.type === "feedback_followup") {
    const surveyUrl = typeof metadata.surveyUrl === "string" ? metadata.surveyUrl.trim() : ""
    if (surveyUrl) {
      const content = buildFeedbackFollowupContent(hackathonName, surveyUrl)
      summary = await sendReminderEmailsWithResult(
        reminder.hackathon_id,
        "feedback_followup",
        reminder.recipient_filter,
        (name) => ({ ...content, hackathonName, participantName: name }),
        deliveryKey,
        budget,
      )
    }
  } else {
    throw new Error(`Unknown post-event reminder type: ${reminder.type}`)
  }

  if (summary.failed > 0) {
    throw new Error(
      `${summary.failed} of ${summary.eligible} post-event reminder emails failed.`,
    )
  }

  if (summary.deferred) return { sent: summary.sent, deferred: true }

  await markReminderSent(reminder.id, reminder.scheduled_for)
  return { sent: summary.sent, deferred: false }
}

export async function processReminder(reminder: PostEventReminder): Promise<number> {
  const claimed = await withDeliveryLease(
    `post-event-reminder:${reminder.id}`,
    async () => {
      const pending = await getPendingReminderForDelivery(reminder.id, reminder.hackathon_id)
      if (!pending) throw new Error("This reminder is no longer pending.")
      return processPendingReminder(pending)
    },
  )
  if (!claimed.acquired) throw new Error("This reminder is already being sent.")
  return claimed.value.sent
}

export async function processAllPendingReminders(
  limit = 50,
  budget?: DeliveryBudget,
): Promise<{
  processed: number
  totalSent: number
  errors: number
}> {
  const pending = await getPendingReminders(limit)
  let processed = 0
  let totalSent = 0
  let errors = 0

  for (const reminder of pending) {
    if (!hasDeliveryCapacity(budget)) break
    try {
      const claimed = await withDeliveryLease(
        `post-event-reminder:${reminder.id}`,
        async () => {
          const current = await getPendingReminderForDelivery(
            reminder.id,
            reminder.hackathon_id,
          )
          if (!current) return null
          return processPendingReminder(current, budget)
        },
      )
      if (!claimed.acquired) continue
      if (!claimed.value) continue
      totalSent += claimed.value.sent
      if (claimed.value.deferred) break
      processed++
    } catch (err) {
      console.error(`Failed to process reminder ${reminder.id}:`, err)
      errors++
    }
  }

  return { processed, totalSent, errors }
}

export async function cancelPendingPostEventReminders(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: pending, error: pendingError } = await client
    .from("post_event_reminders")
    .select("id, metadata")
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (pendingError) {
    throw new Error(`Failed to cancel post-event reminders: ${pendingError.message}`)
  }

  let cancelled = 0
  for (const reminder of pending ?? []) {
    const metadata = reminder.metadata && typeof reminder.metadata === "object"
      ? reminder.metadata as Record<string, unknown>
      : {}
    const result = await withDeliveryLease(`post-event-reminder:${reminder.id}`, async () => {
      const { data, error } = await client
        .from("post_event_reminders")
        .update({
          cancelled_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            cancellationReason: "results_unpublished",
            cancelledPublicationVersion:
              typeof metadata.publicationVersion === "string"
                ? metadata.publicationVersion
                : null,
          },
        })
        .eq("id", reminder.id)
        .is("sent_at", null)
        .is("cancelled_at", null)
        .select("id")
        .maybeSingle()
      if (error) throw new Error(`Failed to cancel post-event reminders: ${error.message}`)
      return Boolean(data)
    })
    if (result.acquired && result.value) cancelled++
  }

  return cancelled
}
