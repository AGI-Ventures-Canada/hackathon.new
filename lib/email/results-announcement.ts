import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import ResultsAnnouncementEmail from "@/emails/results-announcement"

export async function sendResultsAnnouncementEmails(hackathonId: string): Promise<number> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, skipping results announcement")
    return 0
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, results_announcement_sent_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon || hackathon.results_announcement_sent_at) return 0

  const { data: winnerResults } = await client
    .from("hackathon_results")
    .select("submission:submissions!submission_id(team_id, participant_id)")
    .eq("hackathon_id", hackathonId)
    .lte("rank", 3)

  const winnerClerkIds = new Set<string>()
  if (winnerResults) {
    const teamIds: string[] = []
    const soloParticipantIds: string[] = []
    for (const r of winnerResults) {
      const sub = (r as Record<string, unknown>).submission as { team_id: string | null; participant_id: string | null } | null
      if (sub?.team_id) teamIds.push(sub.team_id)
      else if (sub?.participant_id) soloParticipantIds.push(sub.participant_id)
    }
    if (teamIds.length > 0) {
      const { data: members } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("team_id", teamIds)
      members?.forEach((m) => winnerClerkIds.add(m.clerk_user_id))
    }
    if (soloParticipantIds.length > 0) {
      const { data: solos } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("id", soloParticipantIds)
      solos?.forEach((s) => winnerClerkIds.add(s.clerk_user_id))
    }
  }

  const { data: participants } = await client
    .from("hackathon_participants")
    .select("clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "participant")

  if (!participants || participants.length === 0) return 0

  const nonWinnerIds = participants
    .map((p) => p.clerk_user_id)
    .filter((id) => !winnerClerkIds.has(id))

  if (nonWinnerIds.length === 0) return 0

  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathon.slug}`

  let sent = 0

  for (let i = 0; i < nonWinnerIds.length; i += 100) {
    const batch = nonWinnerIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })

    const emailPromises = users.data.map(async (user) => {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) return null

      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || email.split("@")[0]

      const { html, text } = await renderEmail(
        ResultsAnnouncementEmail({
          participantName: displayName,
          hackathonName: hackathon.name,
          resultsUrl,
        })
      )

      return sendEmail({
        to: email,
        subject: `Results Published — ${shortHackathonName(hackathon.name)}`,
        html,
        text,
        replyTo: getReplyToAddress(),
        headers: buildMailtoUnsubscribeHeaders(),
        tags: [
          { name: "type", value: "results_announcement" },
          { name: "hackathon", value: tag },
        ],
      })
    }).filter(Boolean)

    const settled = await Promise.allSettled(emailPromises)
    sent += settled.filter((r) => r.status === "fulfilled" && r.value !== null).length
  }

  if (sent > 0) {
    await client
      .from("hackathons")
      .update({ results_announcement_sent_at: new Date().toISOString() })
      .eq("id", hackathonId)
  }

  return sent
}
