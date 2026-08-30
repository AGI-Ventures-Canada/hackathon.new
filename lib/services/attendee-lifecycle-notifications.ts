import { clerkClient } from "@clerk/nextjs/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import {
  consumeDeliverySlot,
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"
import { withDeliveryLease } from "@/lib/services/delivery-lease"

type LifecycleNotificationType =
  | "registration_confirmed"
  | "team_approved"
  | "team_denied"

type LifecycleNotificationRow = {
  id: string
  hackathon_id: string
  team_id: string | null
  clerk_user_id: string
  notification_type: LifecycleNotificationType
  fail_count: number
  hackathons: {
    name: string
    slug: string
    status: string
    starts_at: string | null
    ends_at: string | null
  } | null
  teams: { name: string } | null
}

export type AttendeeLifecycleDeliveryResult = {
  attempted: number
  sent: number
  skipped: number
  failed: number
}

async function markCancelled(
  client: SupabaseClient,
  notificationId: string,
  message: string,
): Promise<void> {
  const { error } = await client
    .from("attendee_lifecycle_notifications")
    .update({
      cancelled_at: new Date().toISOString(),
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .is("sent_at", null)
    .is("cancelled_at", null)
  if (error) throw new Error(`Failed to cancel attendee email: ${error.message}`)
}

async function recordFailure(
  client: SupabaseClient,
  notification: LifecycleNotificationRow,
  message: string,
): Promise<void> {
  const { error } = await client
    .from("attendee_lifecycle_notifications")
    .update({
      fail_count: notification.fail_count + 1,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notification.id)
    .is("sent_at", null)
    .is("cancelled_at", null)
  if (error) throw new Error(`Failed to record attendee email failure: ${error.message}`)
}

async function markSent(
  client: SupabaseClient,
  notificationId: string,
): Promise<void> {
  const sentAt = new Date().toISOString()
  const { error } = await client
    .from("attendee_lifecycle_notifications")
    .update({ sent_at: sentAt, last_error: null, updated_at: sentAt })
    .eq("id", notificationId)
    .is("sent_at", null)
    .is("cancelled_at", null)
  if (error) throw new Error(`Failed to mark attendee email sent: ${error.message}`)
}

async function sendNotification(
  notification: LifecycleNotificationRow,
  to: string,
): Promise<boolean> {
  const hackathon = notification.hackathons
  if (!hackathon) return false

  if (notification.notification_type === "registration_confirmed") {
    const { sendRegistrationConfirmationEmail } = await import(
      "@/lib/email/registration-confirmation"
    )
    const result = await sendRegistrationConfirmationEmail({
      notificationId: notification.id,
      to,
      hackathonName: hackathon.name,
      hackathonSlug: hackathon.slug,
    })
    return result.success
  }

  if (!notification.team_id || !notification.teams?.name) return false
  const { sendTeamApprovedEmail, sendTeamDeniedEmail } = await import(
    "@/lib/email/team-review"
  )
  const send = notification.notification_type === "team_approved"
    ? sendTeamApprovedEmail
    : sendTeamDeniedEmail
  const result = await send({
    to,
    teamId: notification.team_id,
    teamName: notification.teams.name,
    hackathonName: hackathon.name,
    hackathonSlug: hackathon.slug,
  })
  return result.success
}

export async function retryPendingAttendeeLifecycleEmails(
  limit = 20,
  budget?: DeliveryBudget,
  filter?: {
    hackathonId: string
    clerkUserId: string
    notificationType?: LifecycleNotificationType
  },
): Promise<AttendeeLifecycleDeliveryResult> {
  const client = getSupabase() as unknown as SupabaseClient
  let query = client
    .from("attendee_lifecycle_notifications")
    .select(
      "id, hackathon_id, team_id, clerk_user_id, notification_type, fail_count, hackathons!inner(name, slug, status, starts_at, ends_at), teams(name)"
    )
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lt("fail_count", 5)
    .neq("hackathons.status", "draft")
    .order("created_at", { ascending: true })
    .limit(limit)
  if (filter) {
    query = query
      .eq("hackathon_id", filter.hackathonId)
      .eq("clerk_user_id", filter.clerkUserId)
    if (filter.notificationType) {
      query = query.eq("notification_type", filter.notificationType)
    }
  }
  const { data, error } = await query

  if (error) throw new Error(`Failed to load attendee emails: ${error.message}`)

  const result: AttendeeLifecycleDeliveryResult = {
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  }
  const rows = (data ?? []) as unknown as LifecycleNotificationRow[]
  if (rows.length === 0) return result
  const clerk = await clerkClient()
  const emailCache = new Map<string, string | null>()

  for (const row of rows) {
    if (!hasDeliveryCapacity(budget)) break
    const hackathon = row.hackathons
    if (!hackathon) {
      await markCancelled(client, row.id, "Event is missing")
      result.skipped++
      continue
    }
    if (hackathon.status === "draft") {
      result.skipped++
      continue
    }
    if (!["published", "registration_open", "active", "judging"].includes(hackathon.status)) {
      await markCancelled(client, row.id, "Event is no longer accepting attendee changes")
      result.skipped++
      continue
    }
    if (hackathon.ends_at && new Date(hackathon.ends_at).getTime() <= Date.now()) {
      await markCancelled(client, row.id, "Event has ended")
      result.skipped++
      continue
    }
    if (
      row.notification_type !== "registration_confirmed" &&
      (!row.team_id || !row.teams?.name)
    ) {
      await markCancelled(client, row.id, "Team is missing")
      result.skipped++
      continue
    }
    if (row.notification_type === "registration_confirmed") {
      const { data: participant, error: participantError } = await client
        .from("hackathon_participants")
        .select("id")
        .eq("hackathon_id", row.hackathon_id)
        .eq("clerk_user_id", row.clerk_user_id)
        .eq("role", "participant")
        .maybeSingle()
      if (participantError) {
        throw new Error(`Failed to validate attendee email: ${participantError.message}`)
      }
      if (!participant) {
        await markCancelled(client, row.id, "Recipient is no longer registered")
        result.skipped++
        continue
      }
    }

    result.attempted++
    if (!consumeDeliverySlot(budget)) break
    try {
      let email = emailCache.get(row.clerk_user_id)
      if (email === undefined) {
        const user = await clerk.users.getUser(row.clerk_user_id)
        email = user.primaryEmailAddress?.emailAddress
          ?? user.emailAddresses[0]?.emailAddress
          ?? null
        email = email?.trim().toLowerCase() ?? null
        emailCache.set(row.clerk_user_id, email)
      }
      if (!email) {
        await markCancelled(client, row.id, "Recipient email is missing")
        result.skipped++
        continue
      }

      const delivery = await withDeliveryLease(
        `attendee-lifecycle:${row.id}`,
        () => sendNotification(row, email as string),
      )
      if (!delivery.acquired) {
        result.skipped++
        continue
      }
      if (!delivery.value) {
        await recordFailure(client, row, "Email provider did not accept the message")
        result.failed++
        continue
      }
      await markSent(client, row.id)
      result.sent++
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError)
      await recordFailure(client, row, message)
      result.failed++
    }
  }

  return result
}

export async function deliverAttendeeLifecycleEmailsForUser(
  hackathonId: string,
  clerkUserId: string,
  notificationType?: LifecycleNotificationType,
): Promise<AttendeeLifecycleDeliveryResult> {
  return retryPendingAttendeeLifecycleEmails(5, undefined, {
    hackathonId,
    clerkUserId,
    notificationType,
  })
}
