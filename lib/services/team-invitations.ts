import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonStatus, TeamInvitation, TeamStatus } from "@/lib/db/hackathon-types"
import { checkRoleConflict } from "@/lib/services/role-conflict"
import { paceBulkSend } from "@/lib/email/utils"
import { isValidUuid } from "@/lib/utils/uuid"
import { canInviteTeamMembers, hasRegistrationOpened } from "@/lib/utils/team-invite"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import { getQueueReason, type QueueReasonCode } from "@/lib/utils/notification-delivery"
import type { SupabaseClient } from "@supabase/supabase-js"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

const INVITATION_EXPIRY_DAYS = 7
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
const TEAM_STATUSES_OPEN_FOR_INVITES: ReadonlySet<TeamStatus> = new Set<TeamStatus>([
  "forming",
  "pending_approval",
])
const INVITATION_DELIVERY_STATUSES = ["published", "registration_open", "active", "judging"] satisfies HackathonStatus[]
const TEAM_MUTATION_LOCKED_STATUSES: ReadonlySet<HackathonStatus> = new Set([
  "judging",
  "completed",
  "archived",
])

type PendingCaptainMarker = {
  team_id: string | null
  email: string
  is_captain_invite: boolean
}

function createInvitationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function clearPendingCaptainMarker(
  client: SupabaseClient,
  invitation: PendingCaptainMarker | null,
): Promise<void> {
  if (!invitation?.is_captain_invite || !invitation.team_id) return

  const { error } = await client
    .from("teams")
    .update({ pending_captain_email: null, updated_at: new Date().toISOString() })
    .eq("id", invitation.team_id)
    .eq("pending_captain_email", invitation.email)
  if (error) {
    throw new Error(`Failed to clear stale captain invitation: ${error.message}`)
  }
}

async function expirePendingTeamInvitation(
  invitationId: string,
  now: string,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: invitation, error } = await client
    .from("team_invitations")
    .update({ status: "expired", updated_at: now })
    .eq("id", invitationId)
    .eq("status", "pending")
    .lte("expires_at", now)
    .select("team_id, email, is_captain_invite")
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to expire old team invitation: ${error.message}`)
  }
  await clearPendingCaptainMarker(client, invitation)
}

async function cancelPendingTeamInvitation(invitationId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: invitation, error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .is("emailed_at", null)
    .select("team_id, email, is_captain_invite")
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to cancel stale team invitation: ${error.message}`)
  }

  await clearPendingCaptainMarker(client, invitation)
}

export type CreateInvitationInput = {
  teamId: string
  hackathonId: string
  email: string
  invitedByClerkUserId: string
}

export type CreateInvitationResult =
  | { success: true; invitation: TeamInvitation }
  | { success: false; error: string; code: string }

export type AcceptInvitationResult =
  | { success: true; teamId: string; hackathonId: string }
  | { success: false; error: string; code: string }

export type InvitationWithDetails = TeamInvitation & {
  team: { name: string }
  hackathon: {
    id: string
    name: string
    slug: string
    status: string
    require_terms_acceptance: boolean
    terms_content: string | null
  }
}

export async function createTeamInvitation(
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const client = getSupabase()
  const normalizedEmail = input.email.trim().toLowerCase()

  const { data: team, error: teamError } = await client
    .from("teams")
    .select("id, hackathon_id, captain_clerk_user_id, status")
    .eq("id", input.teamId)
    .eq("hackathon_id", input.hackathonId)
    .single()

  if (teamError || !team) {
    return { success: false, error: "Team not found", code: "team_not_found" }
  }

  if (team.captain_clerk_user_id !== input.invitedByClerkUserId) {
    return { success: false, error: "Only team captain can invite members", code: "not_captain" }
  }

  if (team.status === "locked") {
    return { success: false, error: "Team is locked", code: "team_locked" }
  }

  if (!TEAM_STATUSES_OPEN_FOR_INVITES.has(team.status)) {
    return { success: false, error: "Team can't receive invites", code: "team_not_open" }
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, status, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, max_team_size")
    .eq("id", input.hackathonId)
    .single()

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

  if (!canInviteTeamMembers({
    isFormingCaptain: true,
    hackathonStatus: hackathon.status,
    startsAt: hackathon.starts_at,
    endsAt: hackathon.ends_at,
    registrationClosesAt: hackathon.registration_closes_at,
    allowLateRegistration: hackathon.allow_late_registration,
    nowIso: new Date().toISOString(),
  })) {
    return { success: false, error: "Registration has closed", code: "registration_closed" }
  }

  const now = new Date().toISOString()

  const { count: memberCount, error: memberCountError } = await client
    .from("hackathon_participants")
    .select("*", { count: "exact", head: true })
    .eq("team_id", input.teamId)

  if (memberCountError) {
    return {
      success: false,
      error: "Failed to check team size",
      code: "capacity_check_failed",
    }
  }

  const { count: pendingCount, error: pendingCountError } = await client
    .from("team_invitations")
    .select("*", { count: "exact", head: true })
    .eq("team_id", input.teamId)
    .eq("status", "pending")
    .gt("expires_at", now)

  if (pendingCountError) {
    return {
      success: false,
      error: "Failed to check pending invitations",
      code: "capacity_check_failed",
    }
  }

  const totalPotential = (memberCount ?? 0) + (pendingCount ?? 0) + 1
  if (hackathon.max_team_size && totalPotential > hackathon.max_team_size) {
    return { success: false, error: "Team would exceed maximum size", code: "team_full" }
  }

  const { data: existing, error: existingError } = await client
    .from("team_invitations")
    .select("id, expires_at")
    .eq("team_id", input.teamId)
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
        await expirePendingTeamInvitation(existing.id, now)
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
      const roleCheck = await checkRoleConflict(input.hackathonId, users.data[0].id, "participant")
      if (roleCheck.conflict) {
        return { success: false, error: roleCheck.error, code: roleCheck.code }
      }
    }
  } catch {
    // non-blocking — if Clerk lookup fails, allow invitation to proceed
    // the conflict will be caught at acceptance time
  }

  const token = createInvitationToken()
  const registrationOpensAt = hackathon.registration_opens_at
    ? new Date(hackathon.registration_opens_at).getTime()
    : Date.now()
  const expiresAt = new Date(
    Math.max(Date.now(), Number.isFinite(registrationOpensAt) ? registrationOpensAt : Date.now()) +
      INVITATION_EXPIRY_MS,
  ).toISOString()

  const { data: invitation, error: insertError } = await client
    .from("team_invitations")
    .insert({
      team_id: input.teamId,
      hackathon_id: input.hackathonId,
      email: normalizedEmail,
      token,
      invited_by_clerk_user_id: input.invitedByClerkUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (insertError) {
    console.error("Failed to create invitation:", insertError)
    return { success: false, error: "Failed to create invitation", code: "insert_failed" }
  }

  return { success: true, invitation: invitation as TeamInvitation }
}

export async function getInvitationByToken(
  token: string
): Promise<InvitationWithDetails | null> {
  const client = getSupabase()

  const { data, error } = await client
    .from("team_invitations")
    .select(`
      *,
      teams!inner(name),
      hackathons!inner(id, name, slug, status, require_terms_acceptance, terms_content)
    `)
    .eq("token", token)
    .single()

  if (error || !data) {
    return null
  }

  const team = data.teams as unknown as { name: string }
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
    team: { name: team.name },
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      status: hackathon.status,
      require_terms_acceptance: hackathon.require_terms_acceptance ?? false,
      terms_content: hackathon.terms_content ?? null,
    },
  } as InvitationWithDetails
}

export async function acceptTeamInvitation(
  token: string,
  clerkUserId: string,
  userEmail: string
): Promise<AcceptInvitationResult> {
  const client = getSupabase()

  const { data, error } = await client.rpc("accept_team_invitation", {
    p_token: token,
    p_clerk_user_id: clerkUserId,
    p_user_email: userEmail.trim().toLowerCase(),
  })

  if (error) {
    console.error("Failed to accept invitation:", error)
    return { success: false, error: "Failed to accept invitation", code: "rpc_failed" }
  }

  const result = data?.[0]
  if (!result) {
    return { success: false, error: "Failed to accept invitation", code: "no_result" }
  }

  if (result.success) {
    return {
      success: true,
      teamId: result.team_id,
      hackathonId: result.hackathon_id,
    }
  }

  return {
    success: false,
    error: result.error_message || "Failed to accept invitation",
    code: result.error_code || "unknown",
  }
}

export async function cancelOtherPendingTeamInvitations(
  hackathonId: string,
  emails: string[],
  acceptedInvitationId: string,
): Promise<number> {
  const normalizedEmails = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  )
  if (normalizedEmails.length === 0) return 0

  const client = getSupabase()
  const { data, error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("hackathon_id", hackathonId)
    .in("email", normalizedEmails)
    .eq("status", "pending")
    .neq("id", acceptedInvitationId)
    .select("id")

  if (error) {
    console.error("Failed to cancel other team invitations:", error)
    return 0
  }

  const invitations = (data ?? []) as Array<{ id: string }>
  if (invitations.length > 0) {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    await Promise.allSettled(
      invitations.map((item) => cancelRemindersForEntity("team_invitation", item.id)),
    )
  }
  return invitations.length
}

export async function findPendingTeamInvitationForEmails(
  hackathonId: string,
  emails: string[],
): Promise<{ token: string; teamName: string } | null> {
  const normalizedEmails = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  )
  if (normalizedEmails.length === 0) return null

  const client = getSupabase()
  const { data, error } = await client
    .from("team_invitations")
    .select("token, teams!inner(name, status)")
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .in("email", normalizedEmails)
    .limit(10)

  if (error) {
    console.error("Failed to check pending team invitations:", error)
    return null
  }

  const row = (data ?? []).find((item) => {
    const team = item.teams as unknown as { status: string } | Array<{ status: string }>
    const status = Array.isArray(team) ? team[0]?.status : team?.status
    return status !== "disbanded"
  }) as unknown as {
    token: string
    teams: { name: string } | Array<{ name: string }>
  } | undefined
  if (!row) return null
  const team = Array.isArray(row.teams) ? row.teams[0] : row.teams
  return team ? { token: row.token, teamName: team.name } : null
}

export async function declineTeamInvitation(
  token: string,
  userEmails: string[]
): Promise<{ success: boolean; error?: string; code?: string }> {
  const client = getSupabase()

  const { data: invitation } = await client
    .from("team_invitations")
    .select("id, email")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (!invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const normalizedEmails = userEmails.map((email) => email.trim().toLowerCase())
  if (!normalizedEmails.includes(invitation.email.trim().toLowerCase())) {
    return { success: false, error: "You can only decline invitations sent to your email", code: "email_mismatch" }
  }

  const { error } = await client
    .from("team_invitations")
    .update({
      status: "declined",
      updated_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending")

  if (error) {
    return { success: false, error: "Failed to decline invitation", code: "update_failed" }
  }

  const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
  await cancelRemindersForEntity("team_invitation", invitation.id).catch((err) =>
    console.error(`Failed to cancel reminders for team_invitation ${invitation.id}:`, err)
  )

  return { success: true }
}

export async function unsubscribeTeamInvitation(
  token: string
): Promise<{ success: boolean; code?: string }> {
  const client = getSupabase()

  const { data: invitation } = await client
    .from("team_invitations")
    .select("id, status")
    .eq("token", token)
    .maybeSingle()

  if (!invitation) {
    return { success: false, code: "not_found" }
  }

  if (invitation.status !== "pending") {
    return { success: true, code: "already_resolved" }
  }

  const { error } = await client
    .from("team_invitations")
    .update({
      status: "declined",
      updated_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending")

  if (error) {
    console.error("Failed to unsubscribe invitation:", error)
    return { success: false, code: "update_failed" }
  }

  const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
  await cancelRemindersForEntity("team_invitation", invitation.id).catch((err) =>
    console.error(`Failed to cancel reminders for team_invitation ${invitation.id}:`, err)
  )

  return { success: true }
}

export async function cancelTeamInvitationAsOrganizer(
  invitationId: string,
  hackathonId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase()

  const { data: invitation } = await client
    .from("team_invitations")
    .select("id, hackathon_id, team_id, status, is_captain_invite, email")
    .eq("id", invitationId)
    .maybeSingle()

  if (!invitation || invitation.hackathon_id !== hackathonId) {
    return { success: false, error: "Invitation not found" }
  }
  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is no longer pending" }
  }

  const { data: cancelledInvitation, error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!cancelledInvitation) {
    return { success: false, error: "Invitation is no longer pending" }
  }

  if (invitation.is_captain_invite && invitation.team_id) {
    const { error: teamErr } = await client
      .from("teams")
      .update({ pending_captain_email: null, updated_at: new Date().toISOString() })
      .eq("id", invitation.team_id)
      .eq("hackathon_id", hackathonId)
      .eq("pending_captain_email", invitation.email)
    if (teamErr) console.error("Failed to clear pending_captain_email:", teamErr)
  }

  return { success: true }
}

export type ReplaceCaptainInvitationResult =
  | { success: true; invitationId: string; queued: boolean; delivery: "sent" | "queued" | "failed"; queueReason?: QueueReasonCode }
  | { success: false; error: string; code: string }

export async function replaceTeamCaptainInvitation(
  teamId: string,
  hackathonId: string,
  newEmail: string,
  invitedByClerkUserId: string,
): Promise<ReplaceCaptainInvitationResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: team, error: teamError } = await client
    .from("teams")
    .select("id, name, status, captain_clerk_user_id, pending_captain_email")
    .eq("id", teamId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (teamError || !team) return { success: false, error: "Team not found", code: "team_not_found" }
  if (team.captain_clerk_user_id) return { success: false, error: "This team already has a captain", code: "captain_set" }

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, status, starts_at, ends_at, registration_opens_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  const disposition = getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
  })
  if (disposition === "reject") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }
  if (TEAM_MUTATION_LOCKED_STATUSES.has(hackathon.status as HackathonStatus)) {
    return { success: false, error: "Teams are locked because judging has started", code: "status_locked" }
  }
  const registrationOpened = hasRegistrationOpened(
    hackathon.registration_opens_at,
    new Date().toISOString(),
  )
  const queuedReason = disposition === "queue"
    ? "event_draft"
    : "registration_not_open"

  const normalized = newEmail.trim().toLowerCase()

  const token = createInvitationToken()
  const registrationOpensAt = hackathon.registration_opens_at
    ? new Date(hackathon.registration_opens_at).getTime()
    : Date.now()
  const expiresAt = new Date(
    Math.max(Date.now(), Number.isFinite(registrationOpensAt) ? registrationOpensAt : Date.now()) +
      INVITATION_EXPIRY_MS,
  ).toISOString()

  const { data, error: insertError } = await client.rpc("replace_captain_invitation_atomic", {
    p_hackathon_id: hackathonId,
    p_team_id: teamId,
    p_email: normalized,
    p_token: token,
    p_invited_by: invitedByClerkUserId,
    p_expires_at: expiresAt,
  })
  const replacement = Array.isArray(data) ? data[0] : data
  if (insertError || !replacement?.invitation_id) {
    console.error("Failed to replace captain invitation:", insertError)
    return { success: false, error: "Failed to send invitation", code: "insert_failed" }
  }

  const cancelledIds = (replacement.cancelled_ids ?? []) as string[]
  if (cancelledIds.length > 0) {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    for (const invitationId of cancelledIds) {
      cancelRemindersForEntity("team_invitation", invitationId).catch((err) =>
        console.error(`Failed to cancel reminders for replaced team_invitation ${invitationId}:`, err)
      )
    }
  }

  let delivery: "sent" | "queued" | "failed" = disposition === "queue" || !registrationOpened
    ? "queued"
    : "sent"

  if (disposition === "send" && registrationOpened) {
    let inviterName = "The organizer"
    let inviterEmail: string | undefined
    if (invitedByClerkUserId !== "system") {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server")
        const clerk = await clerkClient()
        const organizer = await clerk.users.getUser(invitedByClerkUserId)
        if (organizer.firstName) {
          inviterName = organizer.firstName + (organizer.lastName ? ` ${organizer.lastName}` : "")
        }
        inviterEmail = organizer.primaryEmailAddress?.emailAddress
      } catch (err) {
        console.warn(`Failed to resolve inviter ${invitedByClerkUserId} for replaced captain invitation; falling back to "The organizer":`, err)
      }
    }

    const emailInput = {
      to: normalized,
      teamName: team.name,
      hackathonName: hackathon.name,
      inviterName,
      inviterEmail,
      inviteToken: token,
      expiresAt,
      hackathonSlug: hackathon.slug,
      hackathonStartsAt: hackathon.starts_at,
      hackathonEndsAt: hackathon.ends_at,
      deliveryId: replacement.invitation_id,
    }
    const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
    const sendResult = await sendTeamInvitationEmail(emailInput).catch((error) => {
      console.error(`Failed to send replacement captain invitation ${replacement.invitation_id}:`, error)
      return { success: false }
    })

    if (!sendResult.success) {
      delivery = "failed"
    } else {
      try {
        await markTeamInvitationEmailed(replacement.invitation_id)
      } catch (error) {
        console.error(`Failed to save replacement captain invitation delivery ${replacement.invitation_id}:`, error)
        delivery = "failed"
      }
      if (delivery === "sent") {
        const { scheduleReminders } = await import("@/lib/services/smart-reminders")
        await scheduleReminders(
          "team_invitation",
          replacement.invitation_id,
          hackathonId,
          "invitation_reminder",
          new Date(),
          new Date(expiresAt),
          emailInput,
        ).catch((error) => {
          console.error(`Failed to schedule replacement captain reminder ${replacement.invitation_id}:`, error)
        })
      }
    }
  }

  return {
    success: true,
    invitationId: replacement.invitation_id,
    queued: delivery === "queued",
    delivery,
    queueReason: getQueueReason(delivery, queuedReason),
  }
}

export async function cancelTeamInvitation(
  invitationId: string,
  clerkUserId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase()

  const { data: invitation } = await client
    .from("team_invitations")
    .select("team_id, status")
    .eq("id", invitationId)
    .single()

  if (!invitation || invitation.status !== "pending") {
    return { success: false, error: "Invitation not found or not pending" }
  }

  const { data: team } = await client
    .from("teams")
    .select("captain_clerk_user_id")
    .eq("id", invitation.team_id)
    .single()

  if (!team || team.captain_clerk_user_id !== clerkUserId) {
    return { success: false, error: "Only team captain can cancel invitations" }
  }

  const { data: cancelledInvitation, error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!cancelledInvitation) {
    return { success: false, error: "Invitation not found or not pending" }
  }
  return { success: true }
}

type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled"

export type ListInvitationsResult =
  | { success: true; invitations: TeamInvitation[] }
  | { success: false; error: string; code: string }

export async function listTeamInvitations(
  teamId: string,
  clerkUserId: string,
  options?: { status?: InvitationStatus }
): Promise<ListInvitationsResult> {
  const client = getSupabase()

  const { data: team, error: teamError } = await client
    .from("teams")
    .select("captain_clerk_user_id")
    .eq("id", teamId)
    .single()

  if (teamError || !team) {
    return { success: false, error: "Team not found", code: "team_not_found" }
  }

  const isCaptain = team.captain_clerk_user_id === clerkUserId

  if (!isCaptain) {
    const { data: membership } = await client
      .from("hackathon_participants")
      .select("id")
      .eq("team_id", teamId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (!membership) {
      return { success: false, error: "Not authorized to view team invitations", code: "not_team_member" }
    }
  }

  let query = client
    .from("team_invitations")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })

  if (options?.status) {
    query = query.eq("status", options.status)
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to list invitations:", error)
    return { success: false, error: "Failed to list invitations", code: "query_failed" }
  }

  return { success: true, invitations: data as TeamInvitation[] }
}

export type RemindTeamInvitationResult =
  | { success: true; invitation: TeamInvitation }
  | { success: false; error: string; code: string }

type TeamInvitationHackathonState = {
  status: HackathonStatus
  starts_at: string | null
  ends_at: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  allow_late_registration: boolean | null
  max_team_size: number | null
}

function getTeamInvitationReminderLifecycleError(
  hackathon: TeamInvitationHackathonState,
): { error: string; code: string } | null {
  const disposition = getNotificationDisposition({
    status: hackathon.status,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
  })
  if (disposition === "queue") {
    return { error: "Go live before sending reminders", code: "hackathon_draft" }
  }
  if (disposition === "reject") {
    return { error: "Hackathon has ended", code: "hackathon_ended" }
  }
  if (!hasRegistrationOpened(hackathon.registration_opens_at, new Date().toISOString())) {
    return { error: "Registration isn't open", code: "registration_not_open" }
  }
  if (!canInviteTeamMembers({
    isFormingCaptain: true,
    hackathonStatus: hackathon.status,
    startsAt: hackathon.starts_at,
    endsAt: hackathon.ends_at,
    registrationClosesAt: hackathon.registration_closes_at,
    allowLateRegistration: hackathon.allow_late_registration,
    nowIso: new Date().toISOString(),
  })) {
    return { error: "Team invites are closed", code: "registration_closed" }
  }
  return null
}

export async function remindTeamInvitationAsOrganizer(
  invitationId: string,
  teamId: string,
  hackathonId: string,
): Promise<RemindTeamInvitationResult> {
  if (!isValidUuid(invitationId) || !isValidUuid(teamId)) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const client = getSupabase()

  const { data: invitation, error: fetchError } = await client
    .from("team_invitations")
    .select("id, status, expires_at, teams!inner(status, hackathon_id)")
    .eq("id", invitationId)
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()

  if (fetchError || !invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is not pending", code: "not_pending" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: "Invitation has expired", code: "expired" }
  }

  const invitationTeam = invitation.teams as unknown as {
    status: TeamStatus
    hackathon_id: string
  } | null
  if (
    !invitationTeam ||
    invitationTeam.hackathon_id !== hackathonId ||
    !TEAM_STATUSES_OPEN_FOR_INVITES.has(invitationTeam.status)
  ) {
    return { success: false, error: "Team invites are closed", code: "team_not_open" }
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, max_team_size")
    .eq("id", hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  const lifecycleError = getTeamInvitationReminderLifecycleError(
    hackathon as TeamInvitationHackathonState,
  )
  if (lifecycleError) return { success: false, ...lifecycleError }

  if (hackathon.max_team_size !== null && hackathon.max_team_size !== undefined) {
    const { count, error: countError } = await client
      .from("hackathon_participants")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("role", "participant")
    if (countError) {
      return { success: false, error: "Couldn't check the team", code: "check_failed" }
    }
    if ((count ?? 0) >= hackathon.max_team_size) {
      return { success: false, error: "Team is full", code: "team_full" }
    }
  }

  const remindedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from("team_invitations")
    .update({ reminded_at: remindedAt, updated_at: remindedAt })
    .eq("id", invitationId)
    .eq("team_id", teamId)
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

  return { success: true, invitation: updated as TeamInvitation }
}

export async function remindTeamInvitation(
  invitationId: string,
  clerkUserId: string,
  teamId: string
): Promise<RemindTeamInvitationResult> {
  if (!isValidUuid(invitationId) || !isValidUuid(teamId)) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const client = getSupabase()

  const { data: invitation, error: fetchError } = await client
    .from("team_invitations")
    .select("*, teams!inner(captain_clerk_user_id, status, hackathon_id)")
    .eq("id", invitationId)
    .eq("team_id", teamId)
    .single()

  if (fetchError || !invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const team = invitation.teams as unknown as {
    captain_clerk_user_id: string
    status: TeamStatus
    hackathon_id: string
  }
  if (team.captain_clerk_user_id !== clerkUserId) {
    return { success: false, error: "Only team captain can send reminders", code: "not_captain" }
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is not pending", code: "not_pending" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: "Invitation has expired", code: "expired" }
  }

  if (!TEAM_STATUSES_OPEN_FOR_INVITES.has(team.status)) {
    return { success: false, error: "Team invites are closed", code: "team_not_open" }
  }
  if (team.hackathon_id !== invitation.hackathon_id) {
    return { success: false, error: "Invitation doesn't match this event", code: "invalid_invitation" }
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, max_team_size")
    .eq("id", invitation.hackathon_id)
    .maybeSingle()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  const lifecycleError = getTeamInvitationReminderLifecycleError(
    hackathon as TeamInvitationHackathonState,
  )
  if (lifecycleError) return { success: false, ...lifecycleError }

  if (hackathon.max_team_size !== null && hackathon.max_team_size !== undefined) {
    const { count, error: countError } = await client
      .from("hackathon_participants")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("role", "participant")
    if (countError) {
      return { success: false, error: "Couldn't check the team", code: "check_failed" }
    }
    if ((count ?? 0) >= hackathon.max_team_size) {
      return { success: false, error: "Team is full", code: "team_full" }
    }
  }

  const remindedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from("team_invitations")
    .update({ reminded_at: remindedAt, updated_at: remindedAt })
    .eq("id", invitationId)
    .eq("team_id", teamId)
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

  return { success: true, invitation: updated as TeamInvitation }
}

export async function releaseTeamInvitationReminderClaim(
  invitationId: string,
  remindedAt: string,
): Promise<void> {
  const client = getSupabase()
  const { error } = await client
    .from("team_invitations")
    .update({ reminded_at: null, updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .eq("reminded_at", remindedAt)

  if (error) {
    throw new Error(`Failed to release team invitation reminder claim: ${error.message}`)
  }
}

interface TeamWithHackathon {
  id: string
  name: string
  status: TeamStatus
  hackathon: {
    id: string
    name: string
    slug: string
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
    registration_opens_at: string | null
    registration_closes_at: string | null
    allow_late_registration: boolean
    max_team_size: number | null
    max_participants: number | null
  }
  memberCount: number
  memberNames: string[]
}

/**
 * Fetches team info with hackathon details and participant names for invitation emails.
 * Member names are fetched from Clerk with a hard cap of 100 (Clerk API limit).
 * The email template caps the display at 5 names with "and N others" overflow.
 */
export async function getTeamWithHackathon(
  teamId: string
): Promise<TeamWithHackathon | null> {
  const client = getSupabase()

  const { data, error } = await client
    .from("teams")
    .select(`
      id,
      name,
      status,
      hackathons!inner(id, name, slug, status, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, max_team_size, max_participants),
      hackathon_participants!hackathon_participants_team_id_fkey(clerk_user_id, role)
    `)
    .eq("id", teamId)
    .single()

  if (error || !data) {
    return null
  }

  const hackathon = data.hackathons as unknown as {
    id: string
    name: string
    slug: string
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
    registration_opens_at: string | null
    registration_closes_at: string | null
    allow_late_registration: boolean
    max_team_size: number | null
    max_participants: number | null
  }
  const rawParticipants = (data.hackathon_participants ?? []) as unknown as { clerk_user_id: string; role: string }[]
  const participants = rawParticipants.filter((p) => p.role === "participant")

  let memberNames: string[] = []
  if (participants.length > 0) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server")
      const clerk = await clerkClient()
      const userIds = participants.map((p) => p.clerk_user_id)
      const users = await clerk.users.getUserList({
        userId: userIds,
        limit: 100,
      })
      if (users.data.length === 100 && userIds.length > 100) {
        console.warn(`[getTeamWithHackathon] Team ${teamId} has ${userIds.length} members, only first 100 names fetched from Clerk`)
      }
      memberNames = users.data
        .map((u) => [u.firstName, u.lastName].filter(Boolean).join(" "))
        .filter((name) => name.length > 0)
    } catch (err) {
      console.warn("Failed to fetch member names from Clerk:", err)
    }
  }

  return {
    id: data.id,
    name: data.name,
    status: data.status as TeamStatus,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      status: hackathon.status,
      starts_at: hackathon.starts_at,
      ends_at: hackathon.ends_at,
      registration_opens_at: hackathon.registration_opens_at,
      registration_closes_at: hackathon.registration_closes_at,
      allow_late_registration: hackathon.allow_late_registration,
      max_team_size: hackathon.max_team_size,
      max_participants: hackathon.max_participants,
    },
    memberCount: participants.length,
    memberNames,
  }
}

export async function markTeamInvitationEmailed(invitationId: string): Promise<void> {
  const client = getSupabase()
  const { error } = await client
    .from("team_invitations")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .is("emailed_at", null)
  if (error) {
    throw new Error(`Failed to mark team invitation emailed: ${error.message}`)
  }
}

export async function sendPendingTeamInvitationEmails(
  hackathonId: string,
  limit = 100,
  budget?: DeliveryBudget,
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const claimed = await withDeliveryLease(
    `team-invitations:${hackathonId}`,
    () => sendPendingTeamInvitationEmailsUnlocked(hackathonId, limit, budget),
  )
  return claimed.acquired
    ? claimed.value
    : { sent: 0, total: 0, failedEmails: [] }
}

async function sendPendingTeamInvitationEmailsUnlocked(
  hackathonId: string,
  limit: number,
  budget?: DeliveryBudget,
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const client = getSupabase()
  const now = new Date().toISOString()

  const { data: pending, error: pendingError } = await client
    .from("team_invitations")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .is("emailed_at", null)
    .gt("expires_at", now)
    .order("created_at")
    .limit(limit)

  if (pendingError) {
    throw new Error(`Failed to load pending team invitations: ${pendingError.message}`)
  }

  const rows = (pending ?? []) as TeamInvitation[]
  if (rows.length === 0) return { sent: 0, total: 0, failedEmails: [] }

  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  const inviterCache = new Map<string, Promise<{ name: string; email?: string }>>()
  const resolveInviter = (clerkUserId: string): Promise<{ name: string; email?: string }> => {
    if (clerkUserId === "system") {
      return Promise.resolve({ name: "Your team captain" })
    }
    const inflight = inviterCache.get(clerkUserId)
    if (inflight) return inflight
    const promise = (async () => {
      try {
        const user = await clerk.users.getUser(clerkUserId)
        const resolvedName = [user.firstName, user.lastName].filter(Boolean).join(" ")
        return {
          name: resolvedName || "Your team captain",
          email: user.primaryEmailAddress?.emailAddress,
        }
      } catch (err) {
        console.warn(`Failed to resolve inviter for clerk user ${clerkUserId}:`, err)
        return { name: "Your team captain" }
      }
    })()
    inviterCache.set(clerkUserId, promise)
    return promise
  }

  const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
  const { scheduleReminders } = await import("@/lib/services/smart-reminders")

  const failedEmails: string[] = []
  let sent = 0
  let total = 0
  const participantCountCache = new Map<string, number>()

  for (let index = 0; index < rows.length; index += 1) {
    if (!hasDeliveryCapacity(budget)) break
    const listedInvitation = rows[index]
    try {
      const { data: currentInvitation, error: currentInvitationError } = await client
        .from("team_invitations")
        .select("*")
        .eq("id", listedInvitation.id)
        .eq("hackathon_id", hackathonId)
        .eq("status", "pending")
        .is("emailed_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      if (currentInvitationError) {
        throw new Error(`Failed to revalidate team invitation: ${currentInvitationError.message}`)
      }
      const invitation = Array.isArray(currentInvitation)
        ? (currentInvitation as TeamInvitation[]).find(
            (candidate) => candidate.id === listedInvitation.id,
          ) ?? null
        : currentInvitation as TeamInvitation | null
      if (!invitation) continue
      total++

      const teamInfo = await getTeamWithHackathon(invitation.team_id)
      if (!teamInfo) throw new Error("Team information is unavailable")
      const disposition = getNotificationDisposition({
        status: teamInfo.hackathon.status as HackathonStatus,
        starts_at: teamInfo.hackathon.starts_at,
        ends_at: teamInfo.hackathon.ends_at,
      })
      if (disposition === "queue") continue
      if (!hasRegistrationOpened(
        teamInfo.hackathon.registration_opens_at,
        new Date().toISOString(),
      )) continue
      if (
        disposition === "reject" ||
        !TEAM_STATUSES_OPEN_FOR_INVITES.has(teamInfo.status) ||
        !canInviteTeamMembers({
          isFormingCaptain: true,
          hackathonStatus: teamInfo.hackathon.status,
          startsAt: teamInfo.hackathon.starts_at,
          endsAt: teamInfo.hackathon.ends_at,
          registrationClosesAt: teamInfo.hackathon.registration_closes_at,
          allowLateRegistration: teamInfo.hackathon.allow_late_registration,
          nowIso: new Date().toISOString(),
        }) ||
        (teamInfo.hackathon.max_team_size !== null &&
          teamInfo.memberCount >= teamInfo.hackathon.max_team_size)
      ) {
        await cancelPendingTeamInvitation(invitation.id)
        continue
      }

      const recipientUsers = await clerk.users.getUserList({
        emailAddress: [invitation.email.trim().toLowerCase()],
        limit: 1,
      })
      const recipient = recipientUsers.data[0]
      let existingParticipant: { role: string; team_id: string | null } | null = null
      if (recipient) {
        const { data, error } = await client
          .from("hackathon_participants")
          .select("role, team_id")
          .eq("hackathon_id", hackathonId)
          .eq("clerk_user_id", recipient.id)
          .maybeSingle()
        if (error) {
          throw new Error(`Failed to validate invitation recipient: ${error.message}`)
        }
        existingParticipant = data as { role: string; team_id: string | null } | null
      }

      if (
        existingParticipant &&
        (existingParticipant.role !== "participant" || existingParticipant.team_id === invitation.team_id)
      ) {
        await cancelPendingTeamInvitation(invitation.id)
        continue
      }

      if (existingParticipant?.team_id) {
        const { count: existingTeamMemberCount, error: existingTeamError } = await client
          .from("hackathon_participants")
          .select("id", { count: "exact", head: true })
          .eq("team_id", existingParticipant.team_id)
        if (existingTeamError) {
          throw new Error(`Failed to validate the recipient's current team: ${existingTeamError.message}`)
        }
        if ((existingTeamMemberCount ?? 0) > 1) {
          await cancelPendingTeamInvitation(invitation.id)
          continue
        }
      }

      if (!existingParticipant && teamInfo.hackathon.max_participants !== null) {
        let participantCount = participantCountCache.get(hackathonId)
        if (participantCount === undefined) {
          const { count, error } = await client
            .from("hackathon_participants")
            .select("id", { count: "exact", head: true })
            .eq("hackathon_id", hackathonId)
            .eq("role", "participant")
          if (error) {
            throw new Error(`Failed to validate event capacity: ${error.message}`)
          }
          participantCount = count ?? 0
          participantCountCache.set(hackathonId, participantCount)
        }
        if (participantCount >= teamInfo.hackathon.max_participants) {
          await cancelPendingTeamInvitation(invitation.id)
          continue
        }
      }

      const inviter = await resolveInviter(invitation.invited_by_clerk_user_id)

      if (!consumeDeliverySlot(budget)) break
      await paceBulkSend(index)
      const result = await sendTeamInvitationEmail({
        to: invitation.email,
        teamName: teamInfo.name,
        hackathonName: teamInfo.hackathon.name,
        inviterName: inviter.name,
        inviterEmail: inviter.email,
        inviteToken: invitation.token,
        expiresAt: invitation.expires_at,
        hackathonSlug: teamInfo.hackathon.slug,
        hackathonStartsAt: teamInfo.hackathon.starts_at,
        hackathonEndsAt: teamInfo.hackathon.ends_at,
        teamMembers: teamInfo.memberNames,
        deliveryId: invitation.id,
      })

      if (!result.success) throw new Error("Invitation email was not accepted")

      await markTeamInvitationEmailed(invitation.id)
      sent++
      await scheduleReminders(
        "team_invitation",
        invitation.id,
        hackathonId,
        "invitation_reminder",
        new Date(invitation.created_at),
        new Date(invitation.expires_at),
        {
          email: invitation.email,
          teamName: teamInfo.name,
          hackathonName: teamInfo.hackathon.name,
          inviterName: inviter.name,
          inviterEmail: inviter.email,
          inviteToken: invitation.token,
          expiresAt: invitation.expires_at,
        }
      ).catch((error) => {
        console.error(`Failed to schedule team invitation reminder ${invitation.id}:`, error)
      })
    } catch (error) {
      console.error(
        `Failed to deliver pending team invitation ${listedInvitation.id} (hackathon=${hackathonId}):`,
        error,
      )
      failedEmails.push(listedInvitation.email)
    }
  }

  return { sent, total, failedEmails }
}

export async function retryPendingTeamInvitationEmails(
  limit = 50,
  budget?: DeliveryBudget,
): Promise<{ events: number; sent: number; failed: number }> {
  const client = getSupabase()
  const now = new Date().toISOString()
  const { data, error } = await client
    .from("team_invitations")
    .select("hackathon_id, hackathons!inner(status, starts_at, ends_at, registration_opens_at)")
    .eq("status", "pending")
    .is("emailed_at", null)
    .gt("expires_at", now)
    .in("hackathons.status", INVITATION_DELIVERY_STATUSES)
    .or(`registration_opens_at.is.null,registration_opens_at.lte.${now}`, {
      referencedTable: "hackathons",
    })
    .order("created_at")
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load retryable team invitations: ${error.message}`)
  }

  const eventIds: string[] = []
  for (const row of (data ?? []) as unknown as Array<{
    hackathon_id: string
    hackathons: {
      status: HackathonStatus
      starts_at: string | null
      ends_at: string | null
      registration_opens_at: string | null
    }
  }>) {
    const disposition = getNotificationDisposition(row.hackathons)
    if (disposition === "send" && !eventIds.includes(row.hackathon_id)) {
      eventIds.push(row.hackathon_id)
    }
  }

  let sent = 0
  let failed = 0
  let remaining = limit
  let processedEvents = 0
  for (const hackathonId of eventIds) {
    if (!hasDeliveryCapacity(budget)) break
    processedEvents++
    const result = await sendPendingTeamInvitationEmails(hackathonId, remaining, budget)
    sent += result.sent
    failed += result.failedEmails.length
    remaining -= result.total
    if (remaining <= 0) break
  }

  return { events: processedEvents, sent, failed }
}
