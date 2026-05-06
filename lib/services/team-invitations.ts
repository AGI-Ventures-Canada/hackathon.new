import { supabase as getSupabase } from "@/lib/db/client"
import type { TeamInvitation } from "@/lib/db/hackathon-types"
import { randomBytes } from "crypto"
import { checkRoleConflict } from "@/lib/services/role-conflict"
import { isValidUuid } from "@/lib/utils/uuid"

const INVITATION_EXPIRY_DAYS = 7
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000

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
  hackathon: { name: string; slug: string; status: string }
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

  if (team.status === "disbanded") {
    return { success: false, error: "Team has been disbanded", code: "team_disbanded" }
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, status, ends_at, max_team_size")
    .eq("id", input.hackathonId)
    .single()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Hackathon not found", code: "hackathon_not_found" }
  }

  if (hackathon.status === "completed" || hackathon.status === "archived") {
    return { success: false, error: "Hackathon has ended", code: "hackathon_ended" }
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

  const token = randomBytes(32).toString("base64url")

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
      hackathons!inner(name, slug, status)
    `)
    .eq("token", token)
    .single()

  if (error || !data) {
    return null
  }

  const team = data.teams as unknown as { name: string }
  const hackathon = data.hackathons as unknown as { name: string; slug: string; status: string }

  return {
    ...data,
    team: { name: team.name },
    hackathon: {
      name: hackathon.name,
      slug: hackathon.slug,
      status: hackathon.status,
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
  hackathon: { name: string; slug: string; status: string; starts_at: string | null; ends_at: string | null }
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
      hackathons!inner(name, slug, status, starts_at, ends_at),
      hackathon_participants!hackathon_participants_team_id_fkey(clerk_user_id, role)
    `)
    .eq("id", teamId)
    .single()

  if (error || !data) {
    return null
  }

  const hackathon = data.hackathons as unknown as { name: string; slug: string; status: string; starts_at: string | null; ends_at: string | null }
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

  const inviterCache = new Map<string, Promise<string>>()
  const resolveInviterName = (clerkUserId: string): Promise<string> => {
    const inflight = inviterCache.get(clerkUserId)
    if (inflight) return inflight
    const promise = (async () => {
      try {
        const user = await clerk.users.getUser(clerkUserId)
        const resolved = [user.firstName, user.lastName].filter(Boolean).join(" ")
        if (resolved) return resolved
      } catch (err) {
        console.warn(`Failed to resolve inviter name for clerk user ${clerkUserId}:`, err)
      }
      return "Your team captain"
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

      const inviterName = await resolveInviterName(invitation.invited_by_clerk_user_id)

      const result = await sendTeamInvitationEmail({
        to: invitation.email,
        teamName: teamInfo.name,
        hackathonName: teamInfo.hackathon.name,
        inviterName,
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
          inviterName,
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
