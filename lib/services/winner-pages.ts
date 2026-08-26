import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type WinnerEntry = {
  prizeId: string
  prizeName: string
  prizeDescription: string | null
  prizeValue: string | null
  submissionId: string
  submissionTitle: string
  teamName: string | null
  rank: number | null
}

export type SponsorReportData = {
  hackathonName: string
  participantCount: number
  teamCount: number
  submissionCount: number
  sponsors: { name: string; tier: string; logoUrl: string | null }[]
  winners: WinnerEntry[]
}

async function loadWinnerPageData(
  client: SupabaseClient,
  hackathonId: string,
  includeTeamNames = true,
): Promise<WinnerEntry[]> {
  const { data: assignments, error } = await client
    .from("prize_assignments")
    .select("prize_id, submission_id, prizes(id, name, description, value, display_order), submissions(id, title, team_id)")
    .eq("prizes.hackathon_id", hackathonId)
    .order("prizes(display_order)")

  if (error || !assignments) {
    console.error("Failed to get winner data:", error)
    return []
  }

  const teamIds = [...new Set(
    assignments
      .map((a: Record<string, unknown>) => (a.submissions as { team_id: string | null } | null)?.team_id)
      .filter(Boolean) as string[]
  )]

  let teamNames: Record<string, string> = {}
  if (includeTeamNames && teamIds.length > 0) {
    const { data: teams } = await client.from("teams").select("id, name").in("id", teamIds)
    if (teams) {
      teamNames = Object.fromEntries(teams.map((t: { id: string; name: string }) => [t.id, t.name]))
    }
  }

  return assignments.map((a: Record<string, unknown>) => {
    const prize = a.prizes as { id: string; name: string; description: string | null; value: string | null } | null
    const submission = a.submissions as { id: string; title: string; team_id: string | null } | null
    return {
      prizeId: prize?.id ?? "",
      prizeName: prize?.name ?? "Unknown Prize",
      prizeDescription: prize?.description ?? null,
      prizeValue: prize?.value ?? null,
      submissionId: submission?.id ?? "",
      submissionTitle: submission?.title ?? "Unknown Submission",
      teamName: submission?.team_id ? (teamNames[submission.team_id] ?? null) : null,
      rank: null,
    }
  })
}

export async function getWinnerPageData(hackathonId: string): Promise<WinnerEntry[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: hackathon } = await client
    .from("hackathons")
    .select("results_published_at, anonymous_judging")
    .eq("id", hackathonId)
    .single()

  if (!hackathon?.results_published_at) return []
  return loadWinnerPageData(client, hackathonId, !hackathon.anonymous_judging)
}

export async function generateSponsorReport(hackathonId: string): Promise<SponsorReportData | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hErr } = await client
    .from("hackathons")
    .select("name")
    .eq("id", hackathonId)
    .single()

  if (hErr || !hackathon) return null

  const [partResult, teamResult, subResult, sponsorResult] = await Promise.all([
    client.from("hackathon_participants").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId),
    client.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).neq("status", "disbanded"),
    client.from("submissions").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "submitted"),
    client.from("hackathon_sponsors").select("name, tier, logo_url").eq("hackathon_id", hackathonId).order("display_order"),
  ])

  const winners = await loadWinnerPageData(client, hackathonId)

  return {
    hackathonName: hackathon.name,
    participantCount: partResult.count ?? 0,
    teamCount: teamResult.count ?? 0,
    submissionCount: subResult.count ?? 0,
    sponsors: (sponsorResult.data ?? []).map((s: { name: string; tier: string; logo_url: string | null }) => ({
      name: s.name,
      tier: s.tier,
      logoUrl: s.logo_url,
    })),
    winners,
  }
}
