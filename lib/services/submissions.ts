import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Submission } from "@/lib/db/hackathon-types"
import { trackEvent } from "@/lib/analytics/posthog"

export type ParticipantInfo = {
  participantId: string
  teamId: string | null
}

export async function getParticipantWithTeam(
  hackathonId: string,
  clerkUserId: string
): Promise<ParticipantInfo | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (error) {
    console.error("Failed to get participant:", error)
    return null
  }

  if (!data) {
    return null
  }

  return {
    participantId: data.id,
    teamId: data.team_id,
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
  title: string
  description: string
  githubUrl: string
  liveAppUrl?: string | null
  screenshotUrl?: string | null
  metadata?: Record<string, unknown>
}

export async function createSubmission(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
  input: CreateSubmissionInput
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("submissions")
    .insert({
      hackathon_id: hackathonId,
      participant_id: teamId ? null : participantId,
      team_id: teamId,
      title: input.title,
      description: input.description,
      github_url: input.githubUrl,
      live_app_url: input.liveAppUrl ?? null,
      screenshot_url: input.screenshotUrl ?? null,
      status: "submitted",
      metadata: input.metadata ?? {},
    })
    .select()
    .single()

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

  return data as unknown as Submission
}

export type UpdateSubmissionInput = {
  title?: string
  description?: string
  githubUrl?: string
  liveAppUrl?: string | null
  screenshotUrl?: string | null
}

export async function updateSubmission(
  submissionId: string,
  participantId: string,
  teamId: string | null,
  input: UpdateSubmissionInput
): Promise<Submission | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = {}
  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.githubUrl !== undefined) updates.github_url = input.githubUrl
  if (input.liveAppUrl !== undefined) updates.live_app_url = input.liveAppUrl
  if (input.screenshotUrl !== undefined) updates.screenshot_url = input.screenshotUrl

  let query = client
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)

  if (teamId) {
    query = query.eq("team_id", teamId)
  } else {
    query = query.eq("participant_id", participantId)
  }

  const { data, error } = await query.select().single()

  if (error) {
    console.error("Failed to update submission:", error)
    return null
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
  status: string
  created_at: string
  participant_id: string | null
  team_id: string | null
}

export async function getHackathonSubmissions(
  hackathonId: string
): Promise<(PublicSubmission & { submitter_name: string })[]> {
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
      ? client.from("teams").select("id, name").in("id", teamIds)
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
  }))
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
