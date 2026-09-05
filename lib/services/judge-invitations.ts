import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonStatus, JudgeInvitation } from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { checkRoleConflict } from "@/lib/services/role-conflict"
import { paceBulkSend } from "@/lib/email/utils"
import { isValidUuid } from "@/lib/utils/uuid"
import { getJudgeNotificationDisposition as getNotificationDisposition } from "@/lib/utils/judging-window"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

const INVITATION_EXPIRY_DAYS = 7
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
const INVITATION_DELIVERY_STATUSES = ["published", "registration_open", "active", "judging"] satisfies HackathonStatus[]
const JUDGE_NOTIFICATION_MAX_ATTEMPTS = 5
const JUDGE_NOTIFICATION_FIRST_RETRY_MS = 5 * 60 * 1_000

function judgeNotificationRetryDelayMs(failCount: number): number {
  return Math.min(
    JUDGE_NOTIFICATION_FIRST_RETRY_MS * 2 ** Math.max(0, failCount - 1),
    60 * 60 * 1_000,
  )
}

function safeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

function hasPreparedFirstDeliveryWindow(invitation: JudgeInvitation): boolean {
  const createdAt = new Date(invitation.created_at).getTime()
  const updatedAt = new Date(invitation.updated_at).getTime()
  const expiresAt = new Date(invitation.expires_at).getTime()
  if (![createdAt, updatedAt, expiresAt].every(Number.isFinite)) return false
  return updatedAt !== createdAt && Math.abs(expiresAt - updatedAt - INVITATION_EXPIRY_MS) < 1_000
}

async function prepareJudgeInvitationForFirstDelivery(
  client: SupabaseClient,
  invitation: JudgeInvitation,
): Promise<JudgeInvitation | null> {
  const now = new Date()
  const expiresAt = new Date(invitation.expires_at).getTime()
  if (hasPreparedFirstDeliveryWindow(invitation) && expiresAt > now.getTime()) {
    return invitation
  }

  const deliveryWindowStartedAt = now.toISOString()
  const freshExpiresAt = new Date(now.getTime() + INVITATION_EXPIRY_MS).toISOString()
  const { data, error } = await client
    .from("judge_invitations")
    .update({
      status: "pending",
      expires_at: freshExpiresAt,
      updated_at: deliveryWindowStartedAt,
    })
    .eq("id", invitation.id)
    .eq("hackathon_id", invitation.hackathon_id)
    .in("status", ["pending", "expired"])
    .is("emailed_at", null)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to start judge invitation delivery window: ${error.message}`)
  }
  if (!data) return null

  const updatedInvitation = Array.isArray(data)
    ? (data as JudgeInvitation[]).find((candidate) => candidate.id === invitation.id) ?? invitation
    : data as JudgeInvitation

  return {
    ...updatedInvitation,
    expires_at: freshExpiresAt,
    updated_at: deliveryWindowStartedAt,
    status: "pending",
  }
}

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
  message?: string
  prizeIds?: string[]
  roomIds?: string[]
}

export type CreateJudgeInvitationResult =
  | { success: true; invitation: JudgeInvitation }
  | { success: false; error: string; code: string }

export async function createJudgeInvitation(
  input: CreateJudgeInvitationInput
): Promise<CreateJudgeInvitationResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const normalizedEmail = input.email.trim().toLowerCase()
  const { validateJudgeInvitationScope } = await import("@/lib/services/judge-invitation-scope")
  await validateJudgeInvitationScope(input.hackathonId, input)

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event")
    .eq("id", input.hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }
  if (getNotificationDisposition({
    ...hackathon,
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
    is_test_event: hackathon.is_test_event,
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
      personal_message: input.message?.trim() || null,
      requested_prize_ids: input.prizeIds ?? [],
      requested_room_ids: input.roomIds ?? [],
      scope_applied_at: !input.prizeIds?.length && !input.roomIds?.length ? new Date().toISOString() : null,
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
    starts_at: string | null
    ends_at: string | null
    is_test_event: boolean
    judging_opens_at?: string | null
    judging_closes_at?: string | null
    judging_timezone?: string | null
    results_published_at?: string | null
    judging_instructions?: string | null
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
      hackathons!inner(id, name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, judging_instructions, results_published_at, is_test_event, require_terms_acceptance, terms_content)
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
    starts_at: string | null
    ends_at: string | null
    is_test_event: boolean | null
    judging_opens_at?: string | null
    judging_closes_at?: string | null
    judging_timezone?: string | null
    results_published_at?: string | null
    judging_instructions?: string | null
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
      starts_at: hackathon.starts_at,
      ends_at: hackathon.ends_at,
      is_test_event: hackathon.is_test_event ?? false,
      judging_opens_at: hackathon.judging_opens_at,
      judging_closes_at: hackathon.judging_closes_at,
      judging_timezone: hackathon.judging_timezone,
      results_published_at: hackathon.results_published_at,
      judging_instructions: hackathon.judging_instructions,
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

  if (
    getNotificationDisposition({
      ...invitation.hackathon,
      status: invitation.hackathon.status as HackathonStatus,
      starts_at: invitation.hackathon.starts_at,
      ends_at: invitation.hackathon.ends_at,
      is_test_event: invitation.hackathon.is_test_event,
    }) === "reject"
  ) {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }

  const emails = Array.isArray(userEmails) ? userEmails : [userEmails]
  const matchesInvitation = emails.some(
    (e) => e.trim().toLowerCase() === invitation.email.trim().toLowerCase()
  )

  if (!matchesInvitation) {
    return { success: false, error: "Your email does not match the invitation", code: "email_mismatch" }
  }

  const matchedEmail = emails.find(
    (email) => email.trim().toLowerCase() === invitation.email.trim().toLowerCase()
  ) as string
  const { data, error: claimError } = await client.rpc("accept_judge_invitation_atomic", {
    p_token: token,
    p_clerk_user_id: clerkUserId,
    p_email: matchedEmail,
  })
  if (claimError) {
    console.error("Failed to accept judge invitation:", claimError)
    return { success: false, error: "Failed to accept invitation", code: "claim_failed" }
  }
  const claimed = (Array.isArray(data) ? data[0] : data) as {
    success: boolean
    error_code: string | null
    hackathon_id: string | null
    hackathon_slug: string | null
    cancelled_invitation_ids: string[] | null
  } | null
  if (!claimed?.success) {
    const code = claimed?.error_code ?? "claim_failed"
    const messages: Record<string, string> = {
      not_found: "Invitation not found",
      not_pending: "Invitation is no longer pending",
      expired: "Invitation has expired",
      email_mismatch: "Your email does not match the invitation",
      hackathon_ended: "Hackathon has ended",
      project_role_conflict: "You are on a team with a project. Leave or remove the project before becoming a judge.",
    }
    return { success: false, error: messages[code] ?? "Failed to accept invitation", code }
  }
  if (claimed.cancelled_invitation_ids?.length) {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    for (const invitationId of claimed.cancelled_invitation_ids) {
      cancelRemindersForEntity("judge_invitation", invitationId).catch((err) =>
        console.error(`Failed to cancel reminders for judge_invitation ${invitationId}:`, err)
      )
    }
  }

  const invitationScope = invitation as JudgeInvitation & { requested_prize_ids?: string[]; requested_room_ids?: string[] }
  if (invitationScope.requested_prize_ids?.length || invitationScope.requested_room_ids?.length) {
    const { data: participant } = await client.from("hackathon_participants").select("id").eq("hackathon_id", invitation.hackathon_id).eq("clerk_user_id", clerkUserId).eq("role", "judge").maybeSingle()
    if (participant) {
      const { applyJudgeInvitationScope } = await import("@/lib/services/judge-invitation-scope")
      await applyJudgeInvitationScope(invitation.hackathon_id, participant.id, { prizeIds: invitationScope.requested_prize_ids, roomIds: invitationScope.requested_room_ids }).then(async () => {
        const saved = await client.from("judge_invitations").update({ scope_applied_at: new Date().toISOString() }).eq("id", invitation.id)
        if (saved.error) throw new Error("Could not save invitation scope.")
      }).catch((error) => console.error("Could not apply accepted judge scope:", error))
    }
  }
  const { reconcileJudgingNotifications } = await import("@/lib/services/judging-notifications")
  await reconcileJudgingNotifications(invitation.hackathon_id).catch((error) => console.error("Could not prepare judge updates:", error))
  const { scheduleAcceptedJudgeReminders } = await import(
    "@/lib/services/pre-event-reminders"
  )
  if (!invitation.hackathon.judging_opens_at) await scheduleAcceptedJudgeReminders({
    invitationId: invitation.id,
    hackathonId: claimed.hackathon_id as string,
    hackathonName: invitation.hackathon.name,
    hackathonSlug: claimed.hackathon_slug as string,
    startsAt: invitation.hackathon.starts_at,
    endsAt: invitation.hackathon.ends_at,
    recipientClerkUserId: clerkUserId,
    isTestEvent: invitation.hackathon.is_test_event,
  }).catch((error) => {
    console.error("Failed to schedule accepted judge reminders:", error)
  })

  return {
    success: true,
    hackathonId: claimed.hackathon_id as string,
    hackathonSlug: claimed.hackathon_slug as string,
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

  const { data: cancelledInvitation, error } = await client
    .from("judge_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()

  if (error || !cancelledInvitation) return { success: false }

  const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
  await cancelRemindersForEntity("judge_invitation", invitationId).catch((err) =>
    console.error(`Failed to cancel reminders for judge_invitation ${invitationId}:`, err)
  )
  return { success: true }
}

export async function declineJudgeInvitation(
  invitationId: string,
  hackathonId: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: declinedInvitation, error } = await client
    .from("judge_invitations")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("hackathon_id", hackathonId)
    .in("status", ["pending", "declined"])
    .select("id")
    .maybeSingle()

  if (error) return { success: false, error: "Failed to decline invitation" }
  if (!declinedInvitation) {
    return { success: false, error: "Invitation not found or cannot be declined" }
  }

  const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
  await cancelRemindersForEntity("judge_invitation", invitationId).catch((err) =>
    console.error(`Failed to cancel reminders for judge_invitation ${invitationId}:`, err)
  )
  return { success: true }
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
    .select("status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  const disposition = getNotificationDisposition({
    ...hackathon,
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
    is_test_event: hackathon.is_test_event,
  })
  if (disposition === "queue") {
    return { success: false, error: "Go live before sending reminders", code: "hackathon_draft" }
  }
  if (disposition === "reject") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }

  if (invitation.emailed_at && Date.now() - Date.parse(invitation.emailed_at) < 24 * 60 * 60_000) {
    return { success: false, error: "Wait a day before sending another reminder.", code: "reminder_cooldown" }
  }
  const remindedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from("judge_invitations")
    .update({ reminded_at: remindedAt, updated_at: remindedAt })
    .eq("id", invitationId)
    .eq("status", "pending")
    .or(`reminded_at.is.null,reminded_at.lte.${new Date(Date.now() - 24 * 60 * 60_000).toISOString()}`)
    .is("reminders_stopped_at", null)
    .select()
    .maybeSingle()

  if (updateError) {
    return { success: false, error: "Failed to update reminder status", code: "update_failed" }
  }
  if (!updated) {
    return { success: false, error: "Wait a day before sending another reminder.", code: "reminder_cooldown" }
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
    .update({ emailed_at: new Date().toISOString(), delivery_fail_count: 0, delivery_next_attempt_at: null, delivery_last_error: null })
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
  opts?: {
    onlyEmail?: string
    hackathonSlug?: string
    hackathonStartsAt?: string | null
    hackathonEndsAt?: string | null
    hackathonTimezone?: string | null
  },
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
  opts: {
    onlyEmail?: string
    hackathonSlug?: string
    hackathonStartsAt?: string | null
    hackathonEndsAt?: string | null
    hackathonTimezone?: string | null
  } | undefined,
  limit: number,
  budget?: DeliveryBudget,
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError) {
    throw new Error(`Failed to validate judge invitation delivery: ${hackathonError.message}`)
  }
  if (!hackathon) return { sent: 0, total: 0, failedEmails: [] }

  const disposition = getNotificationDisposition({
    ...hackathon,
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at ?? null,
    ends_at: hackathon.ends_at ?? null,
    is_test_event: hackathon.is_test_event,
  })
  if (disposition !== "send") {
    return { sent: 0, total: 0, failedEmails: [] }
  }

  let pendingQuery = client
    .from("judge_invitations")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .in("status", ["pending", "expired"])
    .is("emailed_at", null)
    .lt("delivery_fail_count", 5)
    .or(`delivery_next_attempt_at.is.null,delivery_next_attempt_at.lte.${new Date().toISOString()}`)
    .order("created_at")
    .limit(limit)
  if (opts?.onlyEmail) pendingQuery = pendingQuery.eq("email", opts.onlyEmail.trim().toLowerCase())
  const { data: pending, error: pendingError } = await pendingQuery

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
        .in("status", ["pending", "expired"])
        .is("emailed_at", null)
        .maybeSingle()
      if (currentInvitationError) {
        throw new Error(`Failed to revalidate judge invitation: ${currentInvitationError.message}`)
      }
      const current = Array.isArray(currentInvitation)
        ? (currentInvitation as JudgeInvitation[]).find(
            (candidate) => candidate.id === listedInvitation.id,
          ) ?? null
        : currentInvitation as JudgeInvitation | null
      if (!current) continue

      const { data: currentHackathon, error: currentHackathonError } = await client
        .from("hackathons")
        .select("name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event")
        .eq("id", hackathonId)
        .maybeSingle()
      if (currentHackathonError) {
        throw new Error(`Failed to revalidate judge invitation event: ${currentHackathonError.message}`)
      }
      if (!currentHackathon) {
        await cancelPendingJudgeInvitation(current.id)
        continue
      }
      const currentDisposition = getNotificationDisposition({
        ...currentHackathon,
        status: currentHackathon.status as HackathonStatus,
        starts_at: currentHackathon.starts_at ?? null,
        ends_at: currentHackathon.ends_at ?? null,
        is_test_event: currentHackathon.is_test_event,
      })
      if (currentDisposition === "queue") break
      if (currentDisposition === "reject") {
        await cancelPendingJudgeInvitation(current.id)
        continue
      }

      const invitation = await prepareJudgeInvitationForFirstDelivery(client, current)
      if (!invitation) continue
      total++

      const recipientUsers = await clerk.users.getUserList({
        emailAddress: [invitation.email.trim().toLowerCase()],
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
        hackathonStartsAt: currentHackathon.judging_opens_at ?? currentHackathon.starts_at ?? opts?.hackathonStartsAt,
        hackathonEndsAt: currentHackathon.judging_closes_at ?? currentHackathon.ends_at ?? opts?.hackathonEndsAt,
        hackathonTimezone: currentHackathon.judging_timezone ?? opts?.hackathonTimezone ?? "UTC",
        deliveryId: invitation.id,
        personalMessage: (invitation as JudgeInvitation & { personal_message?: string | null }).personal_message ?? undefined,
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
        new Date(invitation.updated_at),
        new Date(invitation.expires_at),
        {
          email: invitation.email,
          hackathonName: currentHackathon.name ?? hackathonName,
          inviterName,
          inviteToken: invitation.token,
          expiresAt: invitation.expires_at,
          hackathonSlug: currentHackathon.slug ?? opts?.hackathonSlug,
          hackathonStartsAt: currentHackathon.judging_opens_at ?? currentHackathon.starts_at ?? opts?.hackathonStartsAt,
          hackathonEndsAt: currentHackathon.judging_closes_at ?? currentHackathon.ends_at ?? opts?.hackathonEndsAt,
          hackathonTimezone: currentHackathon.judging_timezone ?? opts?.hackathonTimezone ?? "UTC",
        },
      ).catch((error) => {
        console.error(`Failed to schedule judge invitation reminder ${invitation.id}:`, error)
      })
    } catch (error) {
      console.error(
        `Failed to deliver pending judge invitation ${listedInvitation.id} (hackathon=${hackathonId}):`,
        error,
      )
      const failures = ((listedInvitation as JudgeInvitation & { delivery_fail_count?: number }).delivery_fail_count ?? 0) + 1
      const retry = await client.from("judge_invitations").update({ delivery_fail_count: failures, delivery_next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** (failures - 1)) * 60_000).toISOString(), delivery_last_error: "Invitation delivery failed." }).eq("id", listedInvitation.id).is("emailed_at", null)
      if (retry.error) throw new Error("Could not save invitation retry.")
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
  const { data, error } = await client
    .from("judge_invitations")
    .select("hackathon_id, hackathons!inner(name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event)")
    .in("status", ["pending", "expired"])
    .is("emailed_at", null)
    .lt("delivery_fail_count", 5)
    .or(`delivery_next_attempt_at.is.null,delivery_next_attempt_at.lte.${new Date().toISOString()}`)
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
    is_test_event: boolean
    judging_timezone?: string | null
    results_published_at?: string | null
    judging_opens_at?: string | null
    judging_closes_at?: string | null
  }>()
  for (const row of (data ?? []) as unknown as Array<{
    hackathon_id: string
    hackathons: {
      name: string
      slug: string
      status: HackathonStatus
      starts_at: string | null
      ends_at: string | null
      is_test_event: boolean
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
        hackathonStartsAt: hackathon.judging_opens_at ?? hackathon.starts_at,
        hackathonEndsAt: hackathon.judging_closes_at ?? hackathon.ends_at,
        hackathonTimezone: hackathon.judging_timezone ?? "UTC",
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
  const normalizedEmail = email.trim().toLowerCase()
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
      .eq("email", email.trim().toLowerCase())
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
  addedByName: string,
  failure?: unknown,
  scope?: { prizeIds?: string[]; roomIds?: string[] },
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = Date.now()
  const failed = failure !== undefined

  const { error } = await client.from("judge_pending_notifications").upsert(
    {
      hackathon_id: hackathonId,
      participant_id: participantId,
      email: email.trim().toLowerCase(),
      added_by_name: addedByName,
      sent_at: null,
      ...(scope ? { requested_prize_ids: scope.prizeIds ?? [], requested_room_ids: scope.roomIds ?? [], scope_applied_at: null } : {}),
      fail_count: failed ? 1 : 0,
      last_error: failed ? safeDeliveryError(failure) : null,
      next_attempt_at: failed
        ? new Date(now + JUDGE_NOTIFICATION_FIRST_RETRY_MS).toISOString()
        : null,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "hackathon_id,participant_id" }
  )

  if (error) {
    throw new Error(`Failed to create judge pending notification: ${error.message}`)
  }
}

type PendingJudgeNotificationRetryRow = {
  requested_prize_ids?: string[]
  requested_room_ids?: string[]
  scope_applied_at?: string | null
  id: string
  hackathon_id: string
  participant_id: string
  email: string
  added_by_name: string
  fail_count: number
  hackathons: {
    name: string
    slug: string
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
    is_test_event: boolean
    judging_opens_at?: string | null
    judging_closes_at?: string | null
    judging_timezone?: string | null
    results_published_at?: string | null
  }
}

export type JudgeNotificationRetryResult = {
  attempted: number
  sent: number
  failed: number
  exhausted: number
  skippedDueToLease: boolean
}

async function retryPendingJudgeNotificationsUnlocked(
  limit: number,
  budget?: DeliveryBudget,
): Promise<Omit<JudgeNotificationRetryResult, "skippedDueToLease">> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()
  const { data, error } = await client
    .from("judge_pending_notifications")
    .select("id, hackathon_id, participant_id, email, added_by_name, fail_count, requested_prize_ids, requested_room_ids, scope_applied_at, hackathons!inner(name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event)")
    .is("sent_at", null)
    .lt("fail_count", JUDGE_NOTIFICATION_MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .in("hackathons.status", INVITATION_DELIVERY_STATUSES)
    .order("created_at", { ascending: true })
    .limit(Math.min(50, Math.max(1, limit)))

  if (error) {
    throw new Error(`Failed to load pending judge notifications: ${error.message}`)
  }

  const result = { attempted: 0, sent: 0, failed: 0, exhausted: 0 }
  const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
  for (const listed of (data ?? []) as unknown as PendingJudgeNotificationRetryRow[]) {
    if (!hasDeliveryCapacity(budget)) break

    const currentResult = await client
      .from("judge_pending_notifications")
      .select("id, hackathon_id, participant_id, email, added_by_name, fail_count, requested_prize_ids, requested_room_ids, scope_applied_at, hackathons!inner(name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event)")
      .eq("id", listed.id)
      .is("sent_at", null)
      .lt("fail_count", JUDGE_NOTIFICATION_MAX_ATTEMPTS)
      .maybeSingle()
    if (currentResult.error) {
      throw new Error(`Failed to revalidate judge notification: ${currentResult.error.message}`)
    }
    const current = currentResult.data as unknown as PendingJudgeNotificationRetryRow | null
    if (!current) continue
    if (getNotificationDisposition(current.hackathons) !== "send") continue
    const recipientCheck = await client.from("hackathon_participants").select("role").eq("id", current.participant_id).eq("hackathon_id", current.hackathon_id).maybeSingle()
    if (recipientCheck.error) throw new Error("Could not verify the judge recipient.")
    if (recipientCheck.data?.role !== "judge") continue
    if (!consumeDeliverySlot(budget)) break

    result.attempted++
    try {
      if (!current.scope_applied_at && (current.requested_prize_ids?.length || current.requested_room_ids?.length)) {
        const { applyJudgeInvitationScope } = await import("@/lib/services/judge-invitation-scope")
        await applyJudgeInvitationScope(current.hackathon_id, current.participant_id, { prizeIds: current.requested_prize_ids, roomIds: current.requested_room_ids })
        const scoped = await client.from("judge_pending_notifications").update({ scope_applied_at: new Date().toISOString() }).eq("id", current.id)
        if (scoped.error) throw new Error("Could not record the judge's prizes and rooms.")
      }
      const delivery = await sendJudgeAddedNotification({
        to: current.email,
        deliveryId: current.participant_id,
        hackathonName: current.hackathons.name,
        hackathonSlug: current.hackathons.slug,
        addedByName: current.added_by_name,
        hackathonStartsAt: current.hackathons.judging_opens_at ?? current.hackathons.starts_at,
        hackathonEndsAt: current.hackathons.judging_closes_at ?? current.hackathons.ends_at,
        hackathonTimezone: current.hackathons.judging_timezone ?? "UTC",
      })
      if (!delivery.success) throw new Error("Judge notification email was not accepted")

      const sentAt = new Date().toISOString()
      const sentResult = await client
        .from("judge_pending_notifications")
        .update({
          sent_at: sentAt,
          last_error: null,
          next_attempt_at: null,
          updated_at: sentAt,
        })
        .eq("id", current.id)
        .eq("fail_count", current.fail_count)
        .is("sent_at", null)
        .select("id")
        .maybeSingle()
      if (sentResult.error) {
        throw new Error(`Failed to save judge notification delivery: ${sentResult.error.message}`)
      }
      if (!sentResult.data) continue
      result.sent++
    } catch (deliveryError) {
      const nextFailCount = Math.min(
        JUDGE_NOTIFICATION_MAX_ATTEMPTS,
        current.fail_count + 1,
      )
      const failedAt = Date.now()
      const failedResult = await client
        .from("judge_pending_notifications")
        .update({
          fail_count: nextFailCount,
          last_error: safeDeliveryError(deliveryError),
          next_attempt_at: new Date(
            failedAt + judgeNotificationRetryDelayMs(nextFailCount),
          ).toISOString(),
          updated_at: new Date(failedAt).toISOString(),
        })
        .eq("id", current.id)
        .eq("fail_count", current.fail_count)
        .is("sent_at", null)
      if (failedResult.error) {
        throw new Error(`Failed to save judge notification retry: ${failedResult.error.message}`)
      }
      result.failed++
      if (nextFailCount >= JUDGE_NOTIFICATION_MAX_ATTEMPTS) result.exhausted++
    }
  }
  return result
}

export async function retryPendingJudgeNotifications(
  limit = 20,
  budget?: DeliveryBudget,
): Promise<JudgeNotificationRetryResult> {
  const claimed = await withDeliveryLease(
    "judge-pending-notifications",
    () => retryPendingJudgeNotificationsUnlocked(limit, budget),
  )
  if (!claimed.acquired) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: true,
    }
  }
  return { ...claimed.value, skippedDueToLease: false }
}

export async function listPendingJudgeNotifications(
  hackathonId: string,
): Promise<Array<{ participantId: string; email: string; createdAt: string }>> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judge_pending_notifications")
    .select("participant_id, email, created_at")
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)

  if (error) {
    console.error("Failed to list pending judge notifications:", error)
    return []
  }

  return ((data ?? []) as Array<{
    participant_id: string
    email: string
    created_at: string
  }>).map((notification) => ({
    participantId: notification.participant_id,
    email: notification.email,
    createdAt: notification.created_at,
  }))
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
): Promise<Array<Omit<JudgeInvitation, "token">>> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("judge_invitations")
    .select("id, hackathon_id, email, invited_by_clerk_user_id, status, accepted_by_clerk_user_id, expires_at, emailed_at, reminded_at, created_at, updated_at")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }
  if (status === "pending") {
    query = query.gt("expires_at", new Date().toISOString())
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to list judge invitations:", error)
    return []
  }

  return (data ?? []).map((row) => {
    const invitation = { ...(row as JudgeInvitation) } as Partial<JudgeInvitation>
    delete invitation.token
    return invitation as Omit<JudgeInvitation, "token">
  })
}

export async function recordJudgeInvitationDeliveryFailure(invitationId: string): Promise<void> {
  const { error } = await (getSupabase() as unknown as SupabaseClient).from("judge_invitations").update({ delivery_fail_count: 1, delivery_last_error: "The invitation could not be delivered. Try again.", delivery_next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", invitationId).is("emailed_at", null)
  if (error) throw new Error("Could not save this invitation's delivery status.")
}
