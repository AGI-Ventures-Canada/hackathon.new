import { supabase as getSupabase } from "@/lib/db/client"
import type { TeamInvitation, TeamStatus } from "@/lib/db/hackathon-types"
import { checkRoleConflict } from "@/lib/services/role-conflict"
import { isValidUuid } from "@/lib/utils/uuid"
import { canInviteTeamMembers } from "@/lib/utils/team-invite"

const INVITATION_EXPIRY_DAYS = 7
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
const TEAM_STATUSES_OPEN_FOR_INVITES: ReadonlySet<TeamStatus> = new Set<TeamStatus>([
  "forming",
  "pending_approval",
])

function createInvitationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
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
    .select("id, status, starts_at, ends_at, registration_closes_at, allow_late_registration, max_team_size")
    .eq("id", input.hackathonId)
    .single()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  if (hackathon.status === "completed" || hackathon.status === "archived") {
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

  const { count: memberCount } = await client
    .from("hackathon_participants")
    .select("*", { count: "exact", head: true })
    .eq("team_id", input.teamId)

  const { count: pendingCount } = await client
    .from("team_invitations")
    .select("*", { count: "exact", head: true })
    .eq("team_id", input.teamId)
    .eq("status", "pending")

  const totalPotential = (memberCount ?? 0) + (pendingCount ?? 0) + 1
  if (hackathon.max_team_size && totalPotential > hackathon.max_team_size) {
    return { success: false, error: "Team would exceed maximum size", code: "team_full" }
  }

  const { data: existing } = await client
    .from("team_invitations")
    .select("id")
    .eq("team_id", input.teamId)
    .eq("email", input.email.toLowerCase())
    .eq("status", "pending")
    .maybeSingle()

  if (existing) {
    return { success: false, error: "Invitation already sent to this email", code: "already_invited" }
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    const users = await clerk.users.getUserList({ emailAddress: [input.email.toLowerCase()] })
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

  const { data: invitation, error: insertError } = await client
    .from("team_invitations")
    .insert({
      team_id: input.teamId,
      hackathon_id: input.hackathonId,
      email: input.email.toLowerCase(),
      token,
      invited_by_clerk_user_id: input.invitedByClerkUserId,
      status: "pending",
      expires_at: new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString(),
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
    p_user_email: userEmail.toLowerCase(),
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

export async function declineTeamInvitation(
  token: string,
  userEmail: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  const client = getSupabase()

  const { data: invitation } = await client
    .from("team_invitations")
    .select("email")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (!invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
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

  return { success: !error }
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
  cancelRemindersForEntity("team_invitation", invitation.id).catch((err) =>
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
    .select("id, hackathon_id, team_id, status, is_captain_invite")
    .eq("id", invitationId)
    .maybeSingle()

  if (!invitation || invitation.hackathon_id !== hackathonId) {
    return { success: false, error: "Invitation not found" }
  }
  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is no longer pending" }
  }

  const { error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("hackathon_id", hackathonId)

  if (error) return { success: false, error: error.message }

  if (invitation.is_captain_invite && invitation.team_id) {
    const { error: teamErr } = await client
      .from("teams")
      .update({ pending_captain_email: null, updated_at: new Date().toISOString() })
      .eq("id", invitation.team_id)
      .eq("hackathon_id", hackathonId)
    if (teamErr) console.error("Failed to clear pending_captain_email:", teamErr)
  }

  return { success: true }
}

export type ReplaceCaptainInvitationResult =
  | { success: true; invitationId: string; queued: boolean }
  | { success: false; error: string; code: string }

export async function replaceTeamCaptainInvitation(
  teamId: string,
  hackathonId: string,
  newEmail: string,
  invitedByClerkUserId: string,
): Promise<ReplaceCaptainInvitationResult> {
  const client = getSupabase()

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
    .select("name, slug, status, starts_at, ends_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  if (hackathon.status === "completed" || hackathon.status === "archived") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
  }

  const normalized = newEmail.toLowerCase()

  const { data: cancelledInvites } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .eq("is_captain_invite", true)
    .select("id")

  if (cancelledInvites && cancelledInvites.length > 0) {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    for (const inv of cancelledInvites as Array<{ id: string }>) {
      cancelRemindersForEntity("team_invitation", inv.id).catch((err) =>
        console.error(`Failed to cancel reminders for replaced team_invitation ${inv.id}:`, err)
      )
    }
  }

  const token = createInvitationToken()
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString()

  const { data: invitation, error: insertError } = await client
    .from("team_invitations")
    .insert({
      team_id: teamId,
      hackathon_id: hackathonId,
      email: normalized,
      token,
      invited_by_clerk_user_id: invitedByClerkUserId,
      status: "pending",
      expires_at: expiresAt,
      is_captain_invite: true,
    })
    .select("id")
    .single()

  if (insertError || !invitation) {
    console.error("Failed to insert replacement captain invitation:", insertError)
    return { success: false, error: "Failed to send invitation", code: "insert_failed" }
  }

  await client
    .from("teams")
    .update({ pending_captain_email: normalized, updated_at: new Date().toISOString() })
    .eq("id", teamId)
    .eq("hackathon_id", hackathonId)

  const isDraft = hackathon.status === "draft"

  if (!isDraft) {
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
    }
    const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
    sendTeamInvitationEmail(emailInput)
      .then(async (result) => {
        if (result.success) {
          await markTeamInvitationEmailed(invitation.id).catch(console.error)
        }
      })
      .catch((err) => console.error(`Failed to send replacement captain invitation ${invitation.id}:`, err))

    const { scheduleReminders } = await import("@/lib/services/smart-reminders")
    scheduleReminders(
      "team_invitation",
      invitation.id,
      hackathonId,
      "invitation_reminder",
      new Date(),
      new Date(expiresAt),
      emailInput,
    ).catch((err) =>
      console.error(`Failed to schedule reminders for replacement team_invitation ${invitation.id} (hackathon=${hackathonId}):`, err)
    )
  }

  return { success: true, invitationId: invitation.id, queued: isDraft }
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

  const { error } = await client
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)

  return { success: !error }
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
    .select("id, status, expires_at")
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

  const { data: updated, error: updateError } = await client
    .from("team_invitations")
    .update({ reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("team_id", teamId)
    .select()
    .single()

  if (updateError || !updated) {
    return { success: false, error: "Failed to update reminder status", code: "update_failed" }
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
    .select("*, teams!inner(captain_clerk_user_id)")
    .eq("id", invitationId)
    .eq("team_id", teamId)
    .single()

  if (fetchError || !invitation) {
    return { success: false, error: "Invitation not found", code: "not_found" }
  }

  const team = invitation.teams as unknown as { captain_clerk_user_id: string }
  if (team.captain_clerk_user_id !== clerkUserId) {
    return { success: false, error: "Only team captain can send reminders", code: "not_captain" }
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Invitation is not pending", code: "not_pending" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: "Invitation has expired", code: "expired" }
  }

  const { data: updated, error: updateError } = await client
    .from("team_invitations")
    .update({ reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("team_id", teamId)
    .select()
    .single()

  if (updateError || !updated) {
    return { success: false, error: "Failed to update reminder status", code: "update_failed" }
  }

  return { success: true, invitation: updated as TeamInvitation }
}

interface TeamWithHackathon {
  name: string
  hackathon: { id: string; name: string; slug: string; status: string; starts_at: string | null; ends_at: string | null }
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
      name,
      hackathons!inner(id, name, slug, status, starts_at, ends_at),
      hackathon_participants!hackathon_participants_team_id_fkey(clerk_user_id, role)
    `)
    .eq("id", teamId)
    .single()

  if (error || !data) {
    return null
  }

  const hackathon = data.hackathons as unknown as { id: string; name: string; slug: string; status: string; starts_at: string | null; ends_at: string | null }
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
    name: data.name,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      status: hackathon.status,
      starts_at: hackathon.starts_at,
      ends_at: hackathon.ends_at,
    },
    memberNames,
  }
}

export async function markTeamInvitationEmailed(invitationId: string): Promise<void> {
  const client = getSupabase()
  const { error } = await client
    .from("team_invitations")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", invitationId)
  if (error) {
    throw new Error(`Failed to mark team invitation emailed: ${error.message}`)
  }
}

export async function sendPendingTeamInvitationEmails(
  hackathonId: string
): Promise<{ sent: number; total: number; failedEmails: string[] }> {
  const client = getSupabase()

  // Atomic claim: a process crash between this UPDATE and the send loop
  // below leaves rows claimed without ever sending. We accept that trade-off
  // — duplicate sends from concurrent go-lives are worse than a rare lost
  // send, and there is no recovery path short of organizer re-invite.
  const { data: claimed, error: claimError } = await client
    .from("team_invitations")
    .update({ emailed_at: new Date().toISOString() })
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .is("emailed_at", null)
    .select()

  if (claimError) {
    throw new Error(`Failed to claim pending team invitations: ${claimError.message}`)
  }

  const rows = (claimed ?? []) as TeamInvitation[]
  if (rows.length === 0) return { sent: 0, total: 0, failedEmails: [] }

  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  const teamCache = new Map<string, TeamWithHackathon | null>()
  const getTeam = async (teamId: string) => {
    if (!teamCache.has(teamId)) {
      teamCache.set(teamId, await getTeamWithHackathon(teamId))
    }
    return teamCache.get(teamId) ?? null
  }

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

  const results = await Promise.allSettled(
    rows.map(async (invitation) => {
      const teamInfo = await getTeam(invitation.team_id)
      if (!teamInfo) return { success: false }

      const inviter = await resolveInviter(invitation.invited_by_clerk_user_id)

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
      })

      if (!result.success) return { success: false }

      await scheduleReminders(
        "team_invitation",
        invitation.id,
        hackathonId,
        "invitation_reminder",
        new Date(),
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
      ).catch((err) => console.error(`Failed to schedule reminders for team_invitation ${invitation.id} (hackathon=${hackathonId}):`, err))

      return { success: true }
    })
  )

  const failedIds: string[] = []
  const failedEmails: string[] = []
  rows.forEach((invitation, i) => {
    const r = results[i]
    if (r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)) {
      failedIds.push(invitation.id)
      failedEmails.push(invitation.email)
    }
  })

  if (failedIds.length > 0) {
    const { error: revertError } = await client
      .from("team_invitations")
      .update({ emailed_at: null })
      .in("id", failedIds)
    if (revertError) {
      console.error(
        `Failed to revert emailed_at for failed team_invitations [${failedIds.join(", ")}] (hackathon=${hackathonId}):`,
        revertError
      )
    }
  }

  return { sent: rows.length - failedEmails.length, total: rows.length, failedEmails }
}
