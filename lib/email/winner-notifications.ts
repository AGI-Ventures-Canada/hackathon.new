import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  paceBulkSend,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import WinnerNotificationEmail from "@/emails/winner-notification"
import { createHash } from "node:crypto"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

function publicationFingerprint(publicationVersion: string): string {
  return createHash("sha256").update(publicationVersion).digest("hex").slice(0, 24)
}

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

export async function sendWinnerEmailsWithResult(
  hackathonId: string,
): Promise<{ attempted: number; sent: number; failed: number }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for winner emails.")
  }

  const client = getSupabase() as unknown as SupabaseClient
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, starts_at, ends_at, status, results_published_at, winner_emails_sent_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) throw new Error("The event was not found for winner emails.")
  if (
    hackathon.status !== "completed" ||
    !hackathon.results_published_at ||
    hackathon.winner_emails_sent_at
  ) return { attempted: 0, sent: 0, failed: 0 }

  const publicationKey = publicationFingerprint(hackathon.results_published_at)

  const { data: results } = await client
    .from("hackathon_results")
    .select(`
      rank,
      submission:submissions!submission_id(id, title, team_id, participant_id)
    `)
    .eq("hackathon_id", hackathonId)
    .lte("rank", 3)
    .order("rank")

  if (!results || results.length === 0) {
    throw new Error("Published results were not found for winner emails.")
  }

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
  if (memberUserIds.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${baseUrl}/e/${hackathon.slug}`

  const resolvedUsers: Awaited<ReturnType<typeof clerk.users.getUserList>>["data"] = []
  for (let i = 0; i < memberUserIds.length; i += 100) {
    const batch = memberUserIds.slice(i, i + 100)
    const page = await clerk.users.getUserList({ userId: batch, limit: 100 })
    resolvedUsers.push(...page.data)
  }

  const resolvedUsersById = new Map(resolvedUsers.map((user) => [user.id, user]))
  const emailTasks: Array<{
    email: string
    info: { title: string; rank: number; submissionId: string }
  }> = []
  let unresolved = 0
  for (const userId of memberUserIds) {
    const submissions = submissionsByUser[userId] ?? []
    const email = resolvedUsersById.get(userId)?.primaryEmailAddress?.emailAddress
    if (!email) {
      unresolved += submissions.length
      continue
    }
    emailTasks.push(...submissions.map((info) => ({ email, info })))
  }

  let attempted = 0
  let sent = 0
  let failed = 0

  for (let index = 0; index < emailTasks.length; index += 1) {
    await paceBulkSend(index)
    const { email, info } = emailTasks[index]
    attempted++

    try {
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

      const result = await sendEmail({
        to: email,
        subject: `${ordinal(info.rank)} Place — ${shortHackathonName(hackathon.name)} Results`,
        html,
        text,
        replyTo: getReplyToAddress(),
        headers: buildMailtoUnsubscribeHeaders(),
        tags: [
          { name: "type", value: "winner_notification" },
          { name: "hackathon", value: tag },
        ],
        idempotencyKey: `winner/${hackathonId}/${publicationKey}/${info.submissionId}/${recipientFingerprint(email)}`,
      })

      if (result) sent++
      else failed++
    } catch {
      failed++
    }
  }

  if (unresolved > 0) {
    const decision = await getUnresolvedEmailDecision(
      `winner:${hackathonId}:${publicationKey}`,
    )
    if (decision === "retry") {
      attempted += unresolved
      failed += unresolved
    } else {
      console.warn(
        `Winner emails: ${unresolved} recipient record(s) remained unavailable after bounded retries for hackathon ${hackathonId}.`,
      )
    }
  }

  if (failed > 0) {
    console.error(`Winner emails: ${sent} sent, ${failed} failed for hackathon ${hackathonId}`)
  }
  return { attempted, sent, failed }
}

export async function sendWinnerEmails(hackathonId: string): Promise<number> {
  return (await sendWinnerEmailsWithResult(hackathonId)).sent
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
  const users = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 })
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
      subject: `You Won a Prize — ${shortHackathonName(hackathon.name)}`,
      html,
      text,
      replyTo: getReplyToAddress(),
      headers: buildMailtoUnsubscribeHeaders(),
      tags: [
        { name: "type", value: "prize_claim_notification" },
        { name: "hackathon", value: tag },
      ],
      idempotencyKey: `prize-claim/${prizeAssignmentId}/${recipientFingerprint(email)}`,
    })

    if (result) sent++
  }

  return sent
}
