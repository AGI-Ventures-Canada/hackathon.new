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
import type { User } from "@clerk/backend"
import { clerkClient } from "@clerk/nextjs/server"
import WinnerNotificationEmail from "@/emails/winner-notification"
import { createHash } from "node:crypto"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasPendingDeliveryTasks,
  markDeliveryTaskComplete,
  runWithinDeliveryDeadline,
  selectPendingDeliveryTasks,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

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

type WinnerSubmissionInfo = {
  title: string
  rank: number
  submissionId: string
}

type WinnerDeliveryTask = {
  userId: string
  info: WinnerSubmissionInfo
}

type WinnerResult = Record<string, unknown> & {
  rank: number
}

function winnerTaskKey(task: WinnerDeliveryTask): string {
  return `${task.userId}/${task.info.submissionId}`
}

async function getWinnerDeliveryTasks(
  client: SupabaseClient,
  results: WinnerResult[],
): Promise<WinnerDeliveryTask[]> {
  const submissionsByUser: Record<string, WinnerSubmissionInfo[]> = {}
  const teamSubmissionMap: Record<string, WinnerSubmissionInfo> = {}

  for (const result of results) {
    const submission = result.submission as {
      id: string
      title: string
      team_id: string | null
      participant_id: string | null
    }
    if (submission.team_id) {
      teamSubmissionMap[submission.team_id] = {
        title: submission.title,
        rank: result.rank,
        submissionId: submission.id,
      }
    }
  }

  const teamIds = Object.keys(teamSubmissionMap)
  if (teamIds.length > 0) {
    const { data: members, error: membersError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id, team_id")
      .in("team_id", teamIds)

    if (membersError) {
      throw new Error(`Failed to load winning team members: ${membersError.message}`)
    }

    for (const member of members ?? []) {
      if (!member.team_id || !teamSubmissionMap[member.team_id]) continue
      if (!submissionsByUser[member.clerk_user_id]) {
        submissionsByUser[member.clerk_user_id] = []
      }
      submissionsByUser[member.clerk_user_id].push(teamSubmissionMap[member.team_id])
    }
  }

  for (const result of results) {
    const submission = result.submission as {
      id: string
      title: string
      team_id: string | null
      participant_id: string | null
    }
    if (submission.team_id !== null || !submission.participant_id) continue

    const { data: participant, error: participantError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("id", submission.participant_id)
      .single()

    if (participantError) {
      throw new Error(`Failed to load a winning attendee: ${participantError.message}`)
    }
    if (!participant) continue
    if (!submissionsByUser[participant.clerk_user_id]) {
      submissionsByUser[participant.clerk_user_id] = []
    }
    submissionsByUser[participant.clerk_user_id].push({
      title: submission.title,
      rank: result.rank,
      submissionId: submission.id,
    })
  }

  const taskMap = new Map<string, WinnerDeliveryTask>()
  for (const userId of Object.keys(submissionsByUser).sort()) {
    for (const info of submissionsByUser[userId]
      .sort((a, b) => a.submissionId.localeCompare(b.submissionId))) {
      const task = { userId, info }
      taskMap.set(winnerTaskKey(task), task)
    }
  }
  return [...taskMap.values()]
}

export async function sendWinnerEmailsWithResult(
  hackathonId: string,
  budget?: DeliveryBudget,
): Promise<{ attempted: number; sent: number; failed: number; deferred?: true }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for winner emails.")
  }

  const client = getSupabase() as unknown as SupabaseClient
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, starts_at, ends_at, status, results_published_at, winner_emails_sent_at, is_test_event")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) throw new Error("The event was not found for winner emails.")
  if (
    hackathon.is_test_event ||
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
  }).filter((id): id is string => id != null)

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

  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${baseUrl}/e/${hackathon.slug}`
  const workKey = `winner:${hackathonId}:${publicationKey}`
  const typedResults = results as WinnerResult[]
  const allTasks = await getWinnerDeliveryTasks(client, typedResults)
  const selection = await selectPendingDeliveryTasks(
    workKey,
    allTasks,
    winnerTaskKey,
    budget,
  )

  const resolvedUsers: User[] = []
  const discoveredUserIds = new Set<string>()
  const selectedUserIds = [...new Set(selection.tasks.map((task) => task.userId))]
  let deferred = selection.deferred
  if (selectedUserIds.length > 0) {
    const clerk = await clerkClient()
    for (let i = 0; i < selectedUserIds.length; i += 100) {
      const batch = selectedUserIds.slice(i, i + 100)
      const resolved = await runWithinDeliveryDeadline(
        budget,
        () => clerk.users.getUserList({ userId: batch, limit: 100 }),
      )
      if (!resolved.completed) {
        deferred = true
        break
      }
      batch.forEach((userId) => discoveredUserIds.add(userId))
      resolvedUsers.push(...resolved.value.data)
    }
  }

  const resolvedUsersById = new Map(resolvedUsers.map((user) => [user.id, user]))
  const emailTasks = selection.tasks
    .filter((task) => discoveredUserIds.has(task.userId))
    .map((task) => ({
      ...task,
      email: resolvedUsersById.get(task.userId)?.primaryEmailAddress?.emailAddress ?? null,
    }))

  let attempted = 0
  let sent = 0
  let failed = 0
  let unresolved = 0
  let unresolvedDecision: "retry" | "exhausted" | null = null

  for (let index = 0; index < emailTasks.length; index += 1) {
    if (!consumeDeliverySlot(budget)) {
      deferred = true
      break
    }

    const task = emailTasks[index]
    const { email, info } = task
    if (!email) {
      unresolved++
      unresolvedDecision ??= await getUnresolvedEmailDecision(workKey)
      if (unresolvedDecision === "retry") {
        attempted++
        failed++
        if (budget) break
        continue
      }
      await markDeliveryTaskComplete(workKey, winnerTaskKey(task))
      continue
    }
    await paceBulkSend(attempted)
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
        idempotencyKey: `winner/${hackathonId}/${publicationKey}/${info.submissionId}/${recipientFingerprint(task.userId)}`,
      })

      if (result) {
        sent++
        await markDeliveryTaskComplete(workKey, winnerTaskKey(task))
      } else {
        failed++
        if (budget) break
      }
    } catch {
      failed++
      if (budget) break
    }
  }

  if (unresolvedDecision === "exhausted") {
    console.warn(
      `Winner emails: ${unresolved} recipient record(s) remained unavailable after bounded retries for hackathon ${hackathonId}.`,
    )
  }

  if (failed > 0) {
    console.error(`Winner emails: ${sent} sent, ${failed} failed for hackathon ${hackathonId}`)
  }
  if (failed === 0 && !deferred) {
    const refreshedTasks = await getWinnerDeliveryTasks(client, typedResults)
    deferred = await hasPendingDeliveryTasks(
      workKey,
      refreshedTasks,
      winnerTaskKey,
      budget,
    )
  }
  return deferred ? { attempted, sent, failed, deferred: true } : { attempted, sent, failed }
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
    .select("name, slug, starts_at, ends_at, is_test_event")
    .eq("id", hackathonId)
    .single()

  if (!hackathon || hackathon.is_test_event) return 0

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
    const { data: members, error: membersError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("team_id", submission.team_id)
    if (membersError) {
      throw new Error(`Failed to load prize-winning team members: ${membersError.message}`)
    }
    if (members) clerkUserIds.push(...members.map((m) => m.clerk_user_id))
  } else if (submission.participant_id) {
    const { data: participant, error: participantError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("id", submission.participant_id)
      .single()
    if (participantError) {
      throw new Error(`Failed to load a prize-winning attendee: ${participantError.message}`)
    }
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
