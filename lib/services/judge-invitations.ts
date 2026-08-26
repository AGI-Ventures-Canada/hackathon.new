import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonStatus, JudgeInvitation } from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { checkRoleConflict } from "@/lib/services/role-conflict"
import { paceBulkSend } from "@/lib/email/utils"
import { isValidUuid } from "@/lib/utils/uuid"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

const INVITATION_EXPIRY_DAYS = 7
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
const INVITATION_DELIVERY_STATUSES = ["published", "registration_open", "active", "judging"] satisfies HackathonStatus[]

async function expirePendingJudgeInvitation(
  invitationId: string,
  now: string,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judge_invitations")
    .update({ status: "expired", updated_at: now })
    .eq("id", invitationId)
    .eq("status", "pending")
    .lte("expires_at", now)

  if (error) {
    throw new Error(`Failed to expire old judge invitation: ${error.message}`)
  }
}

async function cancelPendingJudgeInvitation(invitationId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judge_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .is("emailed_at", null)

  if (error) {
    throw new Error(`Failed to cancel stale judge invitation: ${error.message}`)
  }
}

export type CreateJudgeInvitationInput = {
  hackathonId: string
  email: string
  invitedByClerkUserId: string
}

export type CreateJudgeInvitationResult =
  | { success: true; invitation: JudgeInvitation }
  | { success: false; error: string; code: string }

export async function createJudgeInvitation(
  input: CreateJudgeInvitationInput
): Promise<CreateJudgeInvitationResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const normalizedEmail = input.email.toLowerCase()

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at")
    .eq("id", input.hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }
  if (getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
  }) === "reject") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }

  const now = new Date().toISOString()

  const { data: existing, error: existingError } = await client
    .from("judge_invitations")
    .select("id, expires_at")
    .eq("hackathon_id", input.hackathonId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle()

  if (existingError) {
    return {
      success: false,
      error: "Failed to check existing invitations",
      code: "lookup_failed",
    }
  }

  if (existing) {
    if (new Date(existing.expires_at).getTime() <= new Date(now).getTime()) {
      try {
        await expirePendingJudgeInvitation(existing.id, now)
      } catch {
        return {
          success: false,
          error: "Failed to check existing invitations",
          code: "lookup_failed",
        }
      }
    } else {
      return { success: false, error: "Invitation already sent to this email", code: "already_invited" }
    }
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    const users = await clerk.users.getUserList({ emailAddress: [normalizedEmail] })
    if (users.data.length > 0) {
      const roleCheck = await checkRoleConflict(input.hackathonId, users.data[0].id, "judge")
      if (roleCheck.conflict) {
        return { success: false, error: roleCheck.error, code: roleCheck.code }
      }
    }
  } catch {
    // non-blocking — if Clerk lookup fails, allow invitation to proceed
    // the conflict will be caught at acceptance time
  }

  const token = randomBytes(32).toString("base64url")

  const { data: invitation, error: insertError } = await client
    .from("judge_invitations")
    .insert({
      hackathon_id: input.hackathonId,
      email: normalizedEmail,
      token,
      invited_by_clerk_user_id: input.invitedByClerkUserId,
      status: "pending",
      expires_at: new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    console.error("Failed to create judge invitation:", insertError)
    return { success: false, error: "Failed to create invitation", code: "insert_failed" }
  }

  return { success: true, invitation: invitation as JudgeInvitation }
}

export type JudgeInvitationWithDetails = JudgeInvitation & {
  hackathon: {
    id: string
    name: string
    slug: string
    status: string
    require_terms_acceptance: boolean
    terms_content: string | null
  }
}

export async function getJudgeInvitationByToken(
  token: string
): Promise<JudgeInvitationWithDetails | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("judge_invitations")
    .select(`
      *,
      hackathons!inner(id, name, slug, status, require_terms_acceptance, terms_content)
    `)
    .eq("token", token)
    .single()

  if (error || !data) {
    return null
  }

  const hackathon = data.hackathons as unknown as {
    id: string
    name: string
    slug: string
    status: string
    require_terms_acceptance: boolean | null
    terms_content: string | null
  }

  return {
    ...data,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      status: hackathon.status,
      require_terms_acceptance: hackathon.require_terms_acceptance ?? false,
      terms_content: hackathon.terms_content ?? null,
    },
  } as JudgeInvitationWithDetails
}

export type AcceptJudgeInvitationResult =
  | { success: true; hackathonId: string; hackathonSlug: string }
  | { success: false; error: string; code: string }

export async function acceptJudgeInvitation(
  token: string,
  clerkUserId: string,
  userEmails: string | string[]
): Promise<AcceptJudgeInvitationResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const invitation = await getJudgeInvitationByToken(token)

  if (!invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  if (invitation.status !== "pending") {
    return { success: false, error: `Invitation is ${invitation.status}`, code: "not_pending" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await client
      .from("judge_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("status", "pending")
    return { success: false, error: "Invitation has expired", code: "expired" }
  }

  const emails = Array.isArray(userEmails) ? userEmails : [userEmails]
  const matchesInvitation = emails.some(
    (e) => e.toLowerCase() === invitation.email.toLowerCase()
  )

  if (!matchesInvitation) {
    return { success: false, error: "Your email does not match the invitation", code: "email_mismatch" }
  }

  const roleCheck = await checkRoleConflict(invitation.hackathon_id, clerkUserId, "judge")
  if (roleCheck.conflict) {
    return { success: false, error: roleCheck.error, code: roleCheck.code }
  }

  const { addJudge } = await import("@/lib/services/judging")
  const addResult = await addJudge(invitation.hackathon_id, clerkUserId)

  if (!addResult.success) {
    if (addResult.code === "already_judge") {
      await client
        .from("judge_invitations")
        .update({
          status: "accepted",
          accepted_by_clerk_user_id: clerkUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)

      return {
        success: true,
        hackathonId: invitation.hackathon_id,
        hackathonSlug: invitation.hackathon.slug,
      }
    }
    return { success: false, error: addResult.error, code: addResult.code }
  }

  const { error: updateError } = await client
    .from("judge_invitations")
    .update({
      status: "accepted",
      accepted_by_clerk_user_id: clerkUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)

  if (updateError) {
    console.error("Failed to update judge invitation status:", updateError)
  }

  return {
    success: true,
    hackathonId: invitation.hackathon_id,
    hackathonSlug: invitation.hackathon.slug,
  }
}

export async function cancelJudgeInvitation(
  invitationId: string,
  hackathonId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: invitation } = await client
    .from("judge_invitations")
    .select("id, status")
    .eq("id", invitationId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!invitation || invitation.status !== "pending") {
    return { success: false, error: "Invitation not found or not pending" }
  }

  const { error } = await client
    .from("judge_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)

  return { success: !error }
}

export type RemindJudgeInvitationResult =
  | { success: true; invitation: JudgeInvitation }
  | { success: false; error: string; code: string }

export async function remindJudgeInvitation(
  invitationId: string,
  hackathonId: string
): Promise<RemindJudgeInvitationResult> {
  if (!isValidUuid(invitationId) || !isValidUuid(hackathonId)) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: invitation, error: fetchError } = await client
    .from("judge_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (fetchError || !invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is not pending", code: "not_pending" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: "Invitation has expired", code: "expired" }
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  const disposition = getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
  })
  if (disposition === "queue") {
    return { success: false, error: "Go live before sending reminders", code: "hackathon_draft" }
  }
  if (disposition === "reject") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }

  const remindedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from("judge_invitations")
    .update({ reminded_at: remindedAt, updated_at: remindedAt })
    .eq("id", invitationId)
    .eq("status", "pending")
    .is("reminded_at", null)
    .select()
    .maybeSingle()

  if (updateError) {
    return { success: false, error: "Failed to update reminder status", code: "update_failed" }
  }
  if (!updated) {
    return { success: false, error: "A reminder was already sent", code: "already_reminded" }
  }

  return { success: true, invitation: updated as JudgeInvitation }
}

export async function releaseJudgeInvitationReminderClaim(
  invitationId: string,
  remindedAt: string,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judge_invitations")
    .update({ reminded_at: null, updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .eq("reminded_at", remindedAt)

  if (error) {
    throw new Error(`Failed to release judge invitation reminder claim: ${error.message}`)
  }
}

export async function markJudgeInvitationEmailed(invitationId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judge_invitations")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .is("emailed_at", null)

  if (error) {
    throw new Error(`Failed to mark judge invitation emailed: ${error.message}`)
  }
}

export async function sendPendingJudgeInvitationEmails(
  hackathonId: string,
  hackathonName: string,
  inviterName: string,
  opts?: { hackathonSlug?: string; hackathonStartsAt?: string | null; hackathonEndsAt?: string | null },
  limit = 100,
  budget?: DeliveryBudget,
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const claimed = await withDeliveryLease(
    `judge-invitations:${hackathonId}`,
    () => sendPendingJudgeInvitationEmailsUnlocked(
      hackathonId,
      hackathonName,
      inviterName,
      opts,
      limit,
      budget,
    ),
  )
  return claimed.acquired
    ? claimed.value
    : { sent: 0, total: 0, failedEmails: [] }
}

async function sendPendingJudgeInvitationEmailsUnlocked(
  hackathonId: string,
  hackathonName: string,
  inviterName: string,
  opts: { hackathonSlug?: string; hackathonStartsAt?: string | null; hackathonEndsAt?: string | null } | undefined,
  limit: number,
  budget?: DeliveryBudget,
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError) {
    throw new Error(`Failed to validate judge invitation delivery: ${hackathonError.message}`)
  }
  if (!hackathon) return { sent: 0, total: 0, failedEmails: [] }

  const disposition = getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at ?? null,
    ends_at: hackathon.ends_at ?? null,
  })
  if (disposition !== "send") {
    return { sent: 0, total: 0, failedEmails: [] }
  }

  const { data: pending, error: pendingError } = await client
    .from("judge_invitations")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .is("emailed_at", null)
    .gt("expires_at", now)
    .order("created_at")
    .limit(limit)

  if (pendingError) {
    throw new Error(`Failed to load pending judge invitations: ${pendingError.message}`)
  }

  if (!pending || pending.length === 0) return { sent: 0, total: 0, failedEmails: [] }

  const { sendJudgeInvitationEmail } = await import("@/lib/email/judge-invitations")
  const { scheduleReminders } = await import("@/lib/services/smart-reminders")

  const invitations = pending as JudgeInvitation[]
  const failedEmails: string[] = []
  let sent = 0
  let total = 0
  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  for (let index = 0; index < invitations.length; index += 1) {
    if (!hasDeliveryCapacity(budget)) break
    const listedInvitation = invitations[index]
    try {
      const { data: currentInvitation, error: currentInvitationError } = await client
        .from("judge_invitations")
        .select("*")
        .eq("id", listedInvitation.id)
        .eq("hackathon_id", hackathonId)
        .eq("status", "pending")
        .is("emailed_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      if (currentInvitationError) {
        throw new Error(`Failed to revalidate judge invitation: ${currentInvitationError.message}`)
      }
      const invitation = Array.isArray(currentInvitation)
        ? (currentInvitation as JudgeInvitation[]).find(
            (candidate) => candidate.id === listedInvitation.id,
          ) ?? null
        : currentInvitation as JudgeInvitation | null
      if (!invitation) continue
      total++

      const { data: currentHackathon, error: currentHackathonError } = await client
        .from("hackathons")
        .select("name, slug, status, starts_at, ends_at")
        .eq("id", hackathonId)
        .maybeSingle()
      if (currentHackathonError) {
        throw new Error(`Failed to revalidate judge invitation event: ${currentHackathonError.message}`)
      }
      if (!currentHackathon) {
        await cancelPendingJudgeInvitation(invitation.id)
        continue
      }
      const currentDisposition = getNotificationDisposition({
        status: currentHackathon.status as HackathonStatus,
        starts_at: currentHackathon.starts_at ?? null,
        ends_at: currentHackathon.ends_at ?? null,
      })
      if (currentDisposition === "queue") break
      if (currentDisposition === "reject") {
        await cancelPendingJudgeInvitation(invitation.id)
        continue
      }

      const recipientUsers = await clerk.users.getUserList({
        emailAddress: [invitation.email.toLowerCase()],
        limit: 1,
      })
      const recipient = recipientUsers.data[0]
      if (recipient) {
        const { data: existingParticipant, error: participantError } = await client
          .from("hackathon_participants")
          .select("role")
          .eq("hackathon_id", hackathonId)
          .eq("clerk_user_id", recipient.id)
          .maybeSingle()
        if (participantError) {
          throw new Error(`Failed to validate invitation recipient: ${participantError.message}`)
        }
        if (existingParticipant && existingParticipant.role !== "participant") {
          await cancelPendingJudgeInvitation(invitation.id)
          continue
        }
      }

      const emailInput = {
        to: invitation.email,
        hackathonName: currentHackathon.name ?? hackathonName,
        inviterName,
        inviteToken: invitation.token,
        expiresAt: invitation.expires_at,
        hackathonSlug: currentHackathon.slug ?? opts?.hackathonSlug,
        hackathonStartsAt: currentHackathon.starts_at ?? opts?.hackathonStartsAt,
        hackathonEndsAt: currentHackathon.ends_at ?? opts?.hackathonEndsAt,
        deliveryId: invitation.id,
      }
      if (!consumeDeliverySlot(budget)) break
      await paceBulkSend(index)
      const result = await sendJudgeInvitationEmail(emailInput)
      if (!result.success) throw new Error("Invitation email was not accepted")

      await markJudgeInvitationEmailed(invitation.id)
      sent++
      await scheduleReminders(
        "judge_invitation",
        invitation.id,
        hackathonId,
        "invitation_reminder",
        new Date(invitation.created_at),
        new Date(invitation.expires_at),
        {
          email: invitation.email,
          hackathonName: currentHackathon.name ?? hackathonName,
          inviterName,
          inviteToken: invitation.token,
          expiresAt: invitation.expires_at,
        },
      ).catch((error) => {
        console.error(`Failed to schedule judge invitation reminder ${invitation.id}:`, error)
      })
    } catch (error) {
      console.error(
        `Failed to deliver pending judge invitation ${listedInvitation.id} (hackathon=${hackathonId}):`,
        error,
      )
      failedEmails.push(listedInvitation.email)
    }
  }

  return { sent, total, failedEmails }
}

export async function retryPendingJudgeInvitationEmails(
  limit = 50,
  budget?: DeliveryBudget,
): Promise<{ events: number; sent: number; failed: number }> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()
  const { data, error } = await client
    .from("judge_invitations")
    .select("hackathon_id, hackathons!inner(name, slug, status, starts_at, ends_at)")
    .eq("status", "pending")
    .is("emailed_at", null)
    .gt("expires_at", now)
    .in("hackathons.status", INVITATION_DELIVERY_STATUSES)
    .order("created_at")
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load retryable judge invitations: ${error.message}`)
  }

  const events = new Map<string, {
    name: string
    slug: string
    starts_at: string | null
    ends_at: string | null
  }>()
  for (const row of (data ?? []) as unknown as Array<{
    hackathon_id: string
    hackathons: {
      name: string
      slug: string
      status: HackathonStatus
      starts_at: string | null
      ends_at: string | null
    }
  }>) {
    const disposition = getNotificationDisposition(row.hackathons)
    if (disposition === "send" && !events.has(row.hackathon_id)) {
      events.set(row.hackathon_id, row.hackathons)
    }
  }

  let sent = 0
  let failed = 0
  let remaining = limit
  let processedEvents = 0
  for (const [hackathonId, hackathon] of events) {
    if (!hasDeliveryCapacity(budget)) break
    processedEvents++
    const result = await sendPendingJudgeInvitationEmails(
      hackathonId,
      hackathon.name,
      "The organizer",
      {
        hackathonSlug: hackathon.slug,
        hackathonStartsAt: hackathon.starts_at,
        hackathonEndsAt: hackathon.ends_at,
      },
      remaining,
      budget,
    )
    sent += result.sent
    failed += result.failedEmails.length
    remaining -= result.total
    if (remaining <= 0) break
  }

  return { events: processedEvents, sent, failed }
}

export async function hasPendingJudgeInvitation(hackathonId: string, email: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const normalizedEmail = email.toLowerCase()
  const now = new Date().toISOString()

  const { data, error } = await client
    .from("judge_invitations")
    .select("id, expires_at")
    .eq("hackathon_id", hackathonId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle()

  if (error) throw new Error(`Failed to check pending invitation: ${error.message}`)

  if (data && new Date(data.expires_at).getTime() <= new Date(now).getTime()) {
    await expirePendingJudgeInvitation(data.id, now)
    return false
  }

  return data !== null
}

export async function hasPendingJudgeEntry(hackathonId: string, email: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const [invitationResult, notificationResult] = await Promise.allSettled([
    hasPendingJudgeInvitation(hackathonId, email),
    client
      .from("judge_pending_notifications")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("email", email.toLowerCase())
      .is("sent_at", null)
      .maybeSingle(),
  ])

  if (invitationResult.status === "rejected") throw invitationResult.reason
  if (notificationResult.status === "rejected") throw notificationResult.reason
  if (notificationResult.value.error) throw new Error(`Failed to check pending notification: ${notificationResult.value.error.message}`)

  return invitationResult.value || notificationResult.value.data !== null
}

export async function createJudgePendingNotification(
  hackathonId: string,
  participantId: string,
  email: string,
  addedByName: string
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client.from("judge_pending_notifications").upsert(
    {
      hackathon_id: hackathonId,
      participant_id: participantId,
      email: email.toLowerCase(),
      added_by_name: addedByName,
      sent_at: null,
    },
    { onConflict: "hackathon_id,participant_id" }
  )

  if (error) {
    throw new Error(`Failed to create judge pending notification: ${error.message}`)
  }
}

export async function countPendingJudgeInvitations(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()
  const { count, error } = await client
    .from("judge_invitations")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .gt("expires_at", now)
  if (error) return 0
  return count ?? 0
}

export async function listJudgeInvitations(
  hackathonId: string,
  status?: string
): Promise<JudgeInvitation[]> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("judge_invitations")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to list judge invitations:", error)
    return []
  }

  return data as JudgeInvitation[]
}
