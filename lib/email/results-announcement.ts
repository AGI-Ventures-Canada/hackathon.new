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
import ResultsAnnouncementEmail from "@/emails/results-announcement"
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

export type ResultsAnnouncementDelivery = {
  attempted: number
  sent: number
  failed: number
  deferred?: true
}

async function getNonWinnerRecipientIds(
  client: SupabaseClient,
  hackathonId: string,
): Promise<string[]> {
  const { data: winnerResults, error: winnerResultsError } = await client
    .from("hackathon_results")
    .select("submission:submissions!submission_id(team_id, participant_id)")
    .eq("hackathon_id", hackathonId)
    .lte("rank", 3)

  if (winnerResultsError) {
    throw new Error(`Failed to load event winners: ${winnerResultsError.message}`)
  }

  const winnerClerkIds = new Set<string>()
  if (winnerResults) {
    const teamIds: string[] = []
    const soloParticipantIds: string[] = []
    for (const result of winnerResults) {
      const submission = (result as Record<string, unknown>).submission as {
        team_id: string | null
        participant_id: string | null
      } | null
      if (submission?.team_id) teamIds.push(submission.team_id)
      else if (submission?.participant_id) soloParticipantIds.push(submission.participant_id)
    }
    if (teamIds.length > 0) {
      const { data: members, error: membersError } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("team_id", [...new Set(teamIds)])
      if (membersError) {
        throw new Error(`Failed to load winning team members: ${membersError.message}`)
      }
      members?.forEach((member) => winnerClerkIds.add(member.clerk_user_id))
    }
    if (soloParticipantIds.length > 0) {
      const { data: solos, error: solosError } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("id", [...new Set(soloParticipantIds)])
      if (solosError) {
        throw new Error(`Failed to load winning attendees: ${solosError.message}`)
      }
      solos?.forEach((solo) => winnerClerkIds.add(solo.clerk_user_id))
    }
  }

  const { data: participants, error: participantsError } = await client
    .from("hackathon_participants")
    .select("clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "participant")

  if (participantsError) {
    throw new Error(`Failed to load event attendees: ${participantsError.message}`)
  }

  return [...new Set((participants ?? [])
    .map((participant) => participant.clerk_user_id)
    .filter((id) => !winnerClerkIds.has(id)))].sort()
}

async function checkpointResultsAnnouncement(
  client: SupabaseClient,
  hackathonId: string,
  publicationVersion: string,
): Promise<void> {
  const { data, error } = await client
    .from("hackathons")
    .update({ results_announcement_sent_at: new Date().toISOString() })
    .eq("id", hackathonId)
    .eq("results_published_at", publicationVersion)
    .is("results_announcement_sent_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to save results email delivery: ${error.message}`)
  }
  if (!data) throw new Error("The results publication changed during email delivery.")
}

export async function sendResultsAnnouncementEmailsWithResult(
  hackathonId: string,
  budget?: DeliveryBudget,
): Promise<ResultsAnnouncementDelivery> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for results emails.")
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug, status, results_published_at, results_announcement_sent_at, is_test_event")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event: ${hackathonError.message}`)
  }
  if (
    !hackathon ||
    hackathon.is_test_event ||
    hackathon.status !== "completed" ||
    !hackathon.results_published_at ||
    hackathon.results_announcement_sent_at
  ) return { attempted: 0, sent: 0, failed: 0 }

  const publicationKey = publicationFingerprint(hackathon.results_published_at)

  const nonWinnerIds = await getNonWinnerRecipientIds(client, hackathonId)

  if (nonWinnerIds.length === 0) {
    const refreshedIds = await getNonWinnerRecipientIds(client, hackathonId)
    const workKey = `results:${hackathonId}:${publicationKey}`
    const deferred = await hasPendingDeliveryTasks(
      workKey,
      refreshedIds,
      (clerkUserId) => clerkUserId,
      budget,
    )
    if (!deferred) {
      await checkpointResultsAnnouncement(client, hackathonId, hackathon.results_published_at)
    }
    return deferred
      ? { attempted: 0, sent: 0, failed: 0, deferred: true }
      : { attempted: 0, sent: 0, failed: 0 }
  }

  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathon.slug}`

  let sent = 0
  let attempted = 0
  let failed = 0
  let unresolved = 0
  let unresolvedDecision: "retry" | "exhausted" | null = null
  const usersById = new Map<string, User>()
  const workKey = `results:${hackathonId}:${publicationKey}`
  const selection = await selectPendingDeliveryTasks(
    workKey,
    nonWinnerIds,
    (clerkUserId) => clerkUserId,
    budget,
  )
  let deferred = selection.deferred
  const discoveredIds: string[] = []

  if (selection.tasks.length > 0) {
    const clerk = await clerkClient()
    for (let i = 0; i < selection.tasks.length; i += 100) {
      const batch = selection.tasks.slice(i, i + 100)
      const resolved = await runWithinDeliveryDeadline(
        budget,
        () => clerk.users.getUserList({ userId: batch, limit: 100 }),
      )
      if (!resolved.completed) {
        deferred = true
        break
      }
      discoveredIds.push(...batch)
      for (const user of resolved.value.data) usersById.set(user.id, user)
    }
  }

  for (let index = 0; index < discoveredIds.length; index++) {
    if (!consumeDeliverySlot(budget)) {
      deferred = true
      break
    }

    const clerkUserId = discoveredIds[index]
    const user = usersById.get(clerkUserId)
    const email = user?.primaryEmailAddress?.emailAddress
    if (!user || !email) {
      unresolved++
      unresolvedDecision ??= await getUnresolvedEmailDecision(workKey)
      if (unresolvedDecision === "retry") {
        attempted++
        failed++
        if (budget) break
        continue
      }
      await markDeliveryTaskComplete(workKey, clerkUserId)
      continue
    }

    await paceBulkSend(attempted)
    attempted++

    try {
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

        const result = await sendEmail({
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
          idempotencyKey: `results-announcement/${hackathonId}/${publicationKey}/${recipientFingerprint(clerkUserId)}`,
        })

      if (result) {
        sent++
        await markDeliveryTaskComplete(workKey, clerkUserId)
      } else {
        failed++
        console.error(`Results email delivery was not accepted for hackathon ${hackathonId}.`)
        if (budget) break
      }
    } catch (error) {
      failed++
      console.error(`Failed to prepare a results email for hackathon ${hackathonId}:`, error)
      if (budget) break
    }
  }

  if (unresolvedDecision === "exhausted") {
    console.warn(
      `Results emails: ${unresolved} recipient record(s) remained unavailable after bounded retries for hackathon ${hackathonId}.`,
    )
  }

  if (failed === 0 && !deferred) {
    const refreshedIds = await getNonWinnerRecipientIds(client, hackathonId)
    deferred = await hasPendingDeliveryTasks(
      workKey,
      refreshedIds,
      (clerkUserId) => clerkUserId,
      budget,
    )
    if (!deferred) {
      await checkpointResultsAnnouncement(client, hackathonId, hackathon.results_published_at)
    }
  }

  return deferred ? { attempted, sent, failed, deferred: true } : { attempted, sent, failed }
}

export async function sendResultsAnnouncementEmails(hackathonId: string): Promise<number> {
  return (await sendResultsAnnouncementEmailsWithResult(hackathonId)).sent
}
