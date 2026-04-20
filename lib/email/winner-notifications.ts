import { sendEmail } from "./resend"
import { sanitizeTag, renderEmail } from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import WinnerNotificationEmail from "@/emails/winner-notification"

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

type WinnerPrize = {
  name: string
  value: string | null
  claimToken: string | null
}

export async function sendWinnerEmails(hackathonId: string): Promise<number> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, skipping winner emails")
    return 0
  }

  const client = getSupabase() as unknown as SupabaseClient
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, starts_at, ends_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) return 0

  const { data: results } = await client
    .from("hackathon_results")
    .select(`
      rank,
      submission:submissions!submission_id(id, title, team_id, participant_id)
    `)
    .eq("hackathon_id", hackathonId)
    .lte("rank", 3)
    .order("rank")

  if (!results || results.length === 0) return 0

  const submissionIds = results.map((r: Record<string, unknown>) => {
    const sub = r.submission as unknown as { id: string } | null
    return sub?.id
  }).filter((id): id is string => id !== null)

  const { data: prizeAssignments } = await client
    .from("prize_assignments")
    .select(`
      id,
      submission_id,
      prize:prizes!prize_id(name, value)
    `)
    .in("submission_id", submissionIds)

  let claimTokenMap: Record<string, string> = {}
  try {
    const { getClaimTokensForHackathon } = await import("@/lib/services/prize-fulfillment")
    claimTokenMap = await getClaimTokensForHackathon(hackathonId)
  } catch {
    // Claim tokens unavailable - send emails without claim links
  }

  const prizeMap: Record<string, WinnerPrize[]> = {}
  for (const pa of prizeAssignments ?? []) {
    const prize = (pa as Record<string, unknown>).prize as unknown as { name: string; value: string | null } | null
    if (!prize) continue
    if (!prizeMap[pa.submission_id]) prizeMap[pa.submission_id] = []
    const assignmentId = (pa as Record<string, unknown>).id as string
    prizeMap[pa.submission_id].push({
      ...prize,
      claimToken: claimTokenMap[assignmentId] ?? null,
    })
  }

  const teamIds = results
    .map((r: Record<string, unknown>) => {
      const sub = r.submission as unknown as { team_id: string | null } | null
      return sub?.team_id
    })
    .filter((id): id is string => id !== null)

  const submissionsByUser: Record<string, { title: string; rank: number; submissionId: string }[]> = {}

  if (teamIds.length > 0) {
    const { data: members } = await client
      .from("hackathon_participants")
      .select("clerk_user_id, team_id")
      .in("team_id", teamIds)

    if (members) {
      const teamSubmissionMap: Record<string, { title: string; rank: number; submissionId: string }> = {}
      for (const r of results) {
        const sub = (r as Record<string, unknown>).submission as unknown as { id: string; title: string; team_id: string | null }
        if (sub.team_id) {
          teamSubmissionMap[sub.team_id] = { title: sub.title, rank: r.rank, submissionId: sub.id }
        }
      }

      for (const m of members) {
        if (m.team_id && teamSubmissionMap[m.team_id]) {
          if (!submissionsByUser[m.clerk_user_id]) submissionsByUser[m.clerk_user_id] = []
          submissionsByUser[m.clerk_user_id].push(teamSubmissionMap[m.team_id])
        }
      }
    }
  }

  for (const r of results) {
    const sub = (r as Record<string, unknown>).submission as unknown as {
      id: string; title: string; team_id: string | null; participant_id: string | null
    }
    if (sub.team_id === null && sub.participant_id) {
      const { data: participant } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .eq("id", sub.participant_id)
        .single()

      if (participant) {
        if (!submissionsByUser[participant.clerk_user_id]) submissionsByUser[participant.clerk_user_id] = []
        submissionsByUser[participant.clerk_user_id].push({
          title: sub.title,
          rank: r.rank,
          submissionId: sub.id,
        })
      }
    }
  }

  const memberUserIds = Object.keys(submissionsByUser)
  if (memberUserIds.length === 0) return 0

  const clerk = await clerkClient()
  const users = await clerk.users.getUserList({ userId: memberUserIds })
  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${baseUrl}/e/${hackathon.slug}`

  const emailPromises = users.data
    .flatMap((user) => {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) return []

      const submissions = submissionsByUser[user.id]
      if (!submissions || submissions.length === 0) return []

      return submissions.map(async (info) => {
        const prizes = (prizeMap[info.submissionId] ?? []).map((p) => ({
          name: p.name,
          value: p.value,
          claimUrl: p.claimToken ? `${baseUrl}/prizes/claim/${p.claimToken}` : null,
        }))

        const firstClaimToken = (prizeMap[info.submissionId] ?? []).find((p) => p.claimToken)?.claimToken
        const primaryClaimUrl = firstClaimToken ? `${baseUrl}/prizes/claim/${firstClaimToken}` : null

        const { html, text } = await renderEmail(
          WinnerNotificationEmail({
            submissionTitle: info.title,
            rank: ordinal(info.rank),
            hackathonName: hackathon.name,
            resultsUrl,
            prizes,
            primaryClaimUrl,
            hackathonStartsAt: hackathon.starts_at,
            hackathonEndsAt: hackathon.ends_at,
          })
        )

        return sendEmail({
          to: email,
          subject: `${ordinal(info.rank)} Place — ${hackathon.name} Results`,
          html,
          text,
          tags: [
            { name: "type", value: "winner_notification" },
            { name: "hackathon", value: tag },
          ],
        })
      })
    })

  const settled = await Promise.allSettled(emailPromises)
  const succeeded = settled.filter((r) => r.status === "fulfilled" && r.value !== null).length
  const failed = settled.length - succeeded
  if (failed > 0) {
    console.error(`Winner emails: ${succeeded} sent, ${failed} failed for hackathon ${hackathonId}`)
  }
  return succeeded
}

export async function sendPrizeClaimEmail(
  hackathonId: string,
  prizeAssignmentId: string
): Promise<number> {
  if (!process.env.NEXT_PUBLIC_APP_URL) return 0

  const client = getSupabase() as unknown as SupabaseClient
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, starts_at, ends_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) return 0

  const { data: assignment } = await client
    .from("prize_assignments")
    .select(`
      id,
      submission_id,
      prize:prizes!prize_id(name, value),
      submission:submissions!submission_id(title, team_id, participant_id)
    `)
    .eq("id", prizeAssignmentId)
    .single()

  if (!assignment) return 0

  const prize = (assignment as Record<string, unknown>).prize as { name: string; value: string | null } | null
  const submission = (assignment as Record<string, unknown>).submission as {
    title: string; team_id: string | null; participant_id: string | null
  } | null

  if (!prize || !submission) return 0

  let claimToken: string | null = null
  try {
    const { getClaimTokensForHackathon } = await import("@/lib/services/prize-fulfillment")
    const tokenMap = await getClaimTokensForHackathon(hackathonId)
    claimToken = tokenMap[prizeAssignmentId] ?? null
  } catch {
    // Claim token unavailable
  }

  const clerkUserIds: string[] = []

  if (submission.team_id) {
    const { data: members } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("team_id", submission.team_id)
    if (members) clerkUserIds.push(...members.map((m) => m.clerk_user_id))
  } else if (submission.participant_id) {
    const { data: participant } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("id", submission.participant_id)
      .single()
    if (participant) clerkUserIds.push(participant.clerk_user_id)
  }

  if (clerkUserIds.length === 0) return 0

  const clerk = await clerkClient()
  const users = await clerk.users.getUserList({ userId: clerkUserIds })
  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${baseUrl}/e/${hackathon.slug}`
  const claimUrl = claimToken ? `${baseUrl}/prizes/claim/${claimToken}` : null

  let sent = 0

  for (const user of users.data) {
    const email = user.primaryEmailAddress?.emailAddress
    if (!email) continue

    const { html, text } = await renderEmail(
      WinnerNotificationEmail({
        submissionTitle: submission.title,
        rank: "Prize Winner",
        hackathonName: hackathon.name,
        resultsUrl,
        prizes: [{
          name: prize.name,
          value: prize.value,
          claimUrl,
        }],
        primaryClaimUrl: claimUrl,
        hackathonStartsAt: hackathon.starts_at,
        hackathonEndsAt: hackathon.ends_at,
      })
    )

    const result = await sendEmail({
      to: email,
      subject: `You Won a Prize — ${hackathon.name}`,
      html,
      text,
      tags: [
        { name: "type", value: "prize_claim_notification" },
        { name: "hackathon", value: tag },
      ],
    })

    if (result) sent++
  }

  return sent
}
