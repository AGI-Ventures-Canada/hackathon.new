import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Submission, TeamStatus } from "@/lib/db/hackathon-types"
import type { Json } from "@/lib/db/types"
import { trackEvent } from "@/lib/analytics/posthog"
import { syncSubmissionChallenges } from "@/lib/services/challenges"
import { autoAssignSubmissionToRoomJudges, ROOM_ROUTING_STATUSES } from "@/lib/services/judging"

export type ParticipantInfo = {
  participantId: string
  teamId: string | null
  teamStatus: TeamStatus | null
}

type ParticipantWithTeamRow = {
  id: string
  team_id: string | null
  teams: { status: TeamStatus | null } | Array<{ status: TeamStatus | null }> | null
}

export async function getParticipantWithTeam(
  hackathonId: string,
  clerkUserId: string
): Promise<ParticipantInfo | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("id, team_id, teams(status)")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "participant")
    .maybeSingle()

  if (error) {
    console.error("Failed to get participant:", error)
    return null
  }

  if (!data) {
    return null
  }

  const participant: ParticipantWithTeamRow = data
  const team = Array.isArray(participant.teams) ? participant.teams[0] : participant.teams

  return {
    participantId: participant.id,
    teamId: participant.team_id,
    teamStatus: team?.status ?? null,
  }
}

export async function getTeamMemberCount(teamId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const { count, error } = await client
    .from("hackathon_participants")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("role", "participant")

  if (error) {
    console.error("Failed to get team member count:", error)
    return 0
  }

  return count ?? 0
}

export async function isSubmissionWindowOpen(
  hackathonId: string,
  fallbackEndsAt: string | null,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_schedule_items")
    .select("starts_at")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", "submission_deadline")
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to check the project deadline: ${error.message}`)
  }

  const deadline = data?.starts_at ?? fallbackEndsAt
  if (!deadline) return false
  const deadlineMs = new Date(deadline).getTime()
  return Number.isFinite(deadlineMs) && deadlineMs > Date.now()
}

export async function getSubmissionForParticipant(
  hackathonId: string,
  clerkUserId: string
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const participant = await getParticipantWithTeam(hackathonId, clerkUserId)
  if (!participant) {
    return null
  }

  let query = client
    .from("submissions")
    .select("*")
    .eq("hackathon_id", hackathonId)

  if (participant.teamId) {
    query = query.eq("team_id", participant.teamId)
  } else {
    query = query.eq("participant_id", participant.participantId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error("Failed to get submission:", error)
    return null
  }

  return data as unknown as Submission | null
}

export type CreateSubmissionInput = {
  submissionId?: string
  title: string
  description: string
  githubUrl: string
  liveAppUrl?: string | null
  demoVideoUrl?: string | null
  screenshotUrl?: string | null
  metadata?: Record<string, unknown>
  challengeIds?: string[]
}

export class SubmissionChallengeSyncError extends Error {
  constructor(public readonly submissionId: string) {
    super("Project saved, but its challenges could not be saved")
    this.name = "SubmissionChallengeSyncError"
  }
}

export async function createSubmission(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
  input: CreateSubmissionInput
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const [insertResult, hackathonResult] = await Promise.all([
    client
      .from("submissions")
      .insert({
        ...(input.submissionId ? { id: input.submissionId } : {}),
        hackathon_id: hackathonId,
        participant_id: teamId ? null : participantId,
        team_id: teamId,
        title: input.title,
        description: input.description,
        github_url: input.githubUrl,
        live_app_url: input.liveAppUrl ?? null,
        demo_video_url: input.demoVideoUrl ?? null,
        screenshot_url: input.screenshotUrl ?? null,
        status: "submitted",
        metadata: input.metadata ?? {},
      })
      .select()
      .single(),
    client
      .from("hackathons")
      .select("auto_assign_by_room, status")
      .eq("id", hackathonId)
      .maybeSingle(),
  ])

  const { data, error } = insertResult

  if (error) {
    console.error("Failed to create submission:", error)
    return null
  }

  const distinctId = teamId || participantId
  trackEvent(distinctId, "submission.created", {
    hackathonId,
    submissionId: data.id,
    title: input.title,
  })

  if (input.challengeIds && input.challengeIds.length > 0) {
    const tagged = await syncSubmissionChallenges(data.id, input.challengeIds)
    if (!tagged) {
      throw new SubmissionChallengeSyncError(data.id)
    }
  }

  await routeSubmissionToRoomJudgesIfEnabled(
    hackathonResult.data as { auto_assign_by_room: boolean; status: string } | null,
    hackathonId,
    data.id,
    teamId
  )

  return data as unknown as Submission
}

async function routeSubmissionToRoomJudgesIfEnabled(
  hackathon: { auto_assign_by_room: boolean; status: string } | null,
  hackathonId: string,
  submissionId: string,
  teamId: string | null
): Promise<void> {
  try {
    if (!hackathon) return
    if (!hackathon.auto_assign_by_room) return
    if (!ROOM_ROUTING_STATUSES.has(hackathon.status)) return

    await autoAssignSubmissionToRoomJudges({ hackathonId, submissionId, teamId })
  } catch (err) {
    console.error("Room-judge routing failed (non-fatal):", err)
  }
}

export type UpdateSubmissionInput = {
  title?: string
  description?: string
  githubUrl?: string
  liveAppUrl?: string | null
  demoVideoUrl?: string | null
  screenshotUrl?: string | null
  metadata?: Record<string, Json | undefined>
  challengeIds?: string[]
  expectedUpdatedAt?: string
}

export async function updateSubmission(
  submissionId: string,
  participantId: string,
  teamId: string | null,
  input: UpdateSubmissionInput
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.githubUrl !== undefined) updates.github_url = input.githubUrl
  if (input.liveAppUrl !== undefined) updates.live_app_url = input.liveAppUrl
  if (input.demoVideoUrl !== undefined) updates.demo_video_url = input.demoVideoUrl
  if (input.screenshotUrl !== undefined) updates.screenshot_url = input.screenshotUrl
  if (input.metadata !== undefined) updates.metadata = input.metadata

  let query = client
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)

  if (teamId) {
    query = query.eq("team_id", teamId)
  } else {
    query = query.eq("participant_id", participantId)
  }
  if (input.expectedUpdatedAt) {
    query = query.eq("updated_at", input.expectedUpdatedAt)
  }

  const { data, error } = await query.select().maybeSingle()

  if (error) {
    console.error("Failed to update submission:", error)
    return null
  }
  if (!data) return null

  if (input.challengeIds !== undefined) {
    const tagged = await syncSubmissionChallenges(submissionId, input.challengeIds)
    if (!tagged) {
      throw new SubmissionChallengeSyncError(submissionId)
    }
  }

  return data as unknown as Submission
}

export async function getExistingSubmission(
  hackathonId: string,
  participantId: string,
  teamId: string | null
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("submissions")
    .select("*")
    .eq("hackathon_id", hackathonId)

  if (teamId) {
    query = query.eq("team_id", teamId)
  } else {
    query = query.eq("participant_id", participantId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error("Failed to get existing submission:", error)
    return null
  }

  return data as unknown as Submission | null
}

export type PublicSubmission = {
  id: string
  title: string
  description: string | null
  github_url: string | null
  live_app_url: string | null
  demo_video_url: string | null
  screenshot_url: string | null
  metadata: Json
  status: string
  created_at: string
  participant_id: string | null
  team_id: string | null
}

export async function getHackathonSubmissions(
  hackathonId: string
): Promise<(PublicSubmission & { submitter_name: string; team_mode: "in_person" | "virtual" | null })[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: submissions, error: submissionsError } = await client
    .from("submissions")
    .select(
      `
      id,
      title,
      description,
      github_url,
      live_app_url,
      demo_video_url,
      screenshot_url,
      metadata,
      status,
      created_at,
      participant_id,
      team_id
    `
    )
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")
    .order("created_at", { ascending: false })

  if (submissionsError) {
    console.error("Failed to get hackathon submissions:", submissionsError)
    return []
  }

  if (!submissions || submissions.length === 0) {
    return []
  }

  const teamIds = submissions
    .map((s) => s.team_id)
    .filter((id): id is string => id !== null)
  const participantIds = submissions
    .map((s) => s.participant_id)
    .filter((id): id is string => id !== null)

  const [teamsResult, participantsResult] = await Promise.all([
    teamIds.length > 0
      ? client.from("teams").select("id, name, mode").in("id", teamIds)
      : Promise.resolve({ data: null }),
    participantIds.length > 0
      ? client
          .from("hackathon_participants")
          .select("id, display_name")
          .in("id", participantIds)
      : Promise.resolve({ data: null }),
  ])

  const teamsMap: Record<string, string> = teamsResult.data
    ? Object.fromEntries(teamsResult.data.map((t) => [t.id, t.name]))
    : {}
  const teamModesMap: Record<string, "in_person" | "virtual" | null> = teamsResult.data
    ? Object.fromEntries(teamsResult.data.map((team) => [team.id, team.mode]))
    : {}
  const participantsMap: Record<string, string> = participantsResult.data
    ? Object.fromEntries(
        participantsResult.data.map((p) => [p.id, p.display_name || "Anonymous"])
      )
    : {}

  return (submissions as unknown as PublicSubmission[]).map((s) => ({
    ...s,
    submitter_name:
      (s.team_id && teamsMap[s.team_id]) ||
      (s.participant_id && participantsMap[s.participant_id]) ||
      "Anonymous",
    team_mode: s.team_id ? teamModesMap[s.team_id] ?? null : null,
  }))
}

export async function notifySubmissionMembers(input: {
  hackathonId: string
  submissionId?: string
  participantId: string
  teamId: string | null
  projectTitle: string
}): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug, status, is_test_event")
    .eq("id", input.hackathonId)
    .maybeSingle()

  if (hackathonError || !hackathon?.name || !hackathon?.slug) {
    console.error("Failed to load hackathon for submission confirmation:", hackathonError)
    return 0
  }

  if (hackathon.status === "draft" || hackathon.is_test_event) return 0

  let teamName: string | null = null
  let clerkUserIds: string[] = []

  if (input.teamId) {
    const [teamResult, membersResult] = await Promise.all([
      client.from("teams").select("name").eq("id", input.teamId).maybeSingle(),
      client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .eq("team_id", input.teamId)
        .eq("role", "participant"),
    ])

    if (teamResult.data?.name) teamName = teamResult.data.name

    clerkUserIds = (membersResult.data ?? [])
      .map((m) => m.clerk_user_id)
      .filter((id): id is string => !!id)
  } else {
    const { data: participant } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("id", input.participantId)
      .maybeSingle()
    if (participant?.clerk_user_id) {
      clerkUserIds = [participant.clerk_user_id]
    }
  }

  if (clerkUserIds.length === 0) return 0

  const recipients: string[] = []
  try {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    const uniqueUserIds = [...new Set(clerkUserIds)]
    const seen = new Set<string>()

    for (let i = 0; i < uniqueUserIds.length; i += 100) {
      const batch = uniqueUserIds.slice(i, i + 100)
      const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
      for (const user of users.data) {
        const email =
          user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
        const normalized = email?.trim().toLowerCase()
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized)
          recipients.push(normalized)
        }
      }
    }
  } catch (err) {
    console.error("Failed to resolve submission confirmation recipients:", err)
    return 0
  }

  if (recipients.length === 0) return 0

  const { sendSubmissionConfirmationEmail } = await import(
    "@/lib/email/submission-confirmation"
  )
  const { paceBulkSend } = await import("@/lib/email/utils")

  const hackathonName = hackathon.name
  const hackathonSlug = hackathon.slug

  let sent = 0
  for (let index = 0; index < recipients.length; index += 1) {
    await paceBulkSend(index)
    try {
      const result = await sendSubmissionConfirmationEmail({
        to: recipients[index],
        hackathonName,
        hackathonSlug,
        projectTitle: input.projectTitle,
        teamName,
        submissionId: input.submissionId,
      })
      if (result.success) sent++
    } catch (error) {
      console.error("Failed to send submission confirmation:", error)
    }
  }

  return sent
}

export async function submissionBelongsToHackathon(
  hackathonId: string,
  submissionId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return !!data
}

export async function getSubmittedHackathonIds(
  clerkUserId: string
): Promise<Set<string>> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: participants, error: participantsError } = await client
    .from("hackathon_participants")
    .select("id, hackathon_id, team_id")
    .eq("clerk_user_id", clerkUserId)

  if (participantsError || !participants) {
    console.error("Failed to get participants:", participantsError)
    return new Set()
  }

  if (participants.length === 0) {
    return new Set()
  }

  const participantIds = participants.map((p) => p.id)
  const teamIds = participants
    .filter((p) => p.team_id)
    .map((p) => p.team_id as string)

  let query = client.from("submissions").select("hackathon_id")

  if (teamIds.length > 0) {
    query = query.or(
      `participant_id.in.(${participantIds.join(",")}),team_id.in.(${teamIds.join(",")})`
    )
  } else {
    query = query.in("participant_id", participantIds)
  }

  const { data: submissions, error: submissionsError } = await query

  if (submissionsError) {
    console.error("Failed to get submissions:", submissionsError)
    return new Set()
  }

  return new Set(submissions?.map((s) => s.hackathon_id) ?? [])
}
