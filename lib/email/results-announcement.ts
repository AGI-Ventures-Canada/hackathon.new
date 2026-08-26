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
import ResultsAnnouncementEmail from "@/emails/results-announcement"
import { createHash } from "node:crypto"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"

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
}

async function checkpointResultsAnnouncement(
  client: SupabaseClient,
  hackathonId: string,
  publicationVersion: string,
): Promise<void> {
  const { error } = await client
    .from("hackathons")
    .update({ results_announcement_sent_at: new Date().toISOString() })
    .eq("id", hackathonId)
    .eq("results_published_at", publicationVersion)
    .is("results_announcement_sent_at", null)

  if (error) {
    throw new Error(`Failed to save results email delivery: ${error.message}`)
  }
}

export async function sendResultsAnnouncementEmailsWithResult(
  hackathonId: string,
): Promise<ResultsAnnouncementDelivery> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for results emails.")
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug, status, results_published_at, results_announcement_sent_at")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event: ${hackathonError.message}`)
  }
  if (
    !hackathon ||
    hackathon.status !== "completed" ||
    !hackathon.results_published_at ||
    hackathon.results_announcement_sent_at
  ) return { attempted: 0, sent: 0, failed: 0 }

  const publicationKey = publicationFingerprint(hackathon.results_published_at)

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
    for (const r of winnerResults) {
      const sub = (r as Record<string, unknown>).submission as { team_id: string | null; participant_id: string | null } | null
      if (sub?.team_id) teamIds.push(sub.team_id)
      else if (sub?.participant_id) soloParticipantIds.push(sub.participant_id)
    }
    if (teamIds.length > 0) {
      const { data: members, error: membersError } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("team_id", [...new Set(teamIds)])
      if (membersError) {
        throw new Error(`Failed to load winning team members: ${membersError.message}`)
      }
      members?.forEach((m) => winnerClerkIds.add(m.clerk_user_id))
    }
    if (soloParticipantIds.length > 0) {
      const { data: solos, error: solosError } = await client
        .from("hackathon_participants")
        .select("clerk_user_id")
        .in("id", [...new Set(soloParticipantIds)])
      if (solosError) {
        throw new Error(`Failed to load winning attendees: ${solosError.message}`)
      }
      solos?.forEach((s) => winnerClerkIds.add(s.clerk_user_id))
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
  if (!participants || participants.length === 0) {
    await checkpointResultsAnnouncement(client, hackathonId, hackathon.results_published_at)
    return { attempted: 0, sent: 0, failed: 0 }
  }

  const nonWinnerIds = [...new Set(participants
    .map((p) => p.clerk_user_id)
    .filter((id) => !winnerClerkIds.has(id)))]

  if (nonWinnerIds.length === 0) {
    await checkpointResultsAnnouncement(client, hackathonId, hackathon.results_published_at)
    return { attempted: 0, sent: 0, failed: 0 }
  }

  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)
  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathon.slug}`

  let sent = 0
  let attempted = 0
  let failed = 0
  let unresolved = 0

  for (let i = 0; i < nonWinnerIds.length; i += 100) {
    const batch = nonWinnerIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })

    const usersById = new Map(users.data.map((user) => [user.id, user]))
    const emailableUsers = batch.flatMap((userId) => {
      const user = usersById.get(userId)
      if (!user?.primaryEmailAddress?.emailAddress) {
        unresolved++
        return []
      }
      return [user]
    })
    let batchSent = 0
    let batchFailed = 0

    for (const user of emailableUsers) {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) continue

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
          idempotencyKey: `results-announcement/${hackathonId}/${publicationKey}/${recipientFingerprint(email)}`,
        })

        if (result) {
          sent++
          batchSent++
        } else {
          failed++
          batchFailed++
        }
      } catch (error) {
        failed++
        batchFailed++
        console.error(`Failed to prepare a results email for hackathon ${hackathonId}:`, error)
      }
    }

    if (batchFailed > 0) {
      console.error(
        `Results emails: ${batchSent} sent, ${batchFailed} failed for hackathon ${hackathonId}`,
      )
    }
  }

  if (unresolved > 0) {
    const decision = await getUnresolvedEmailDecision(
      `results:${hackathonId}:${publicationKey}`,
    )
    if (decision === "retry") {
      attempted += unresolved
      failed += unresolved
    } else {
      console.warn(
        `Results emails: ${unresolved} recipient record(s) remained unavailable after bounded retries for hackathon ${hackathonId}.`,
      )
    }
  }

  if (failed === 0) {
    await checkpointResultsAnnouncement(client, hackathonId, hackathon.results_published_at)
  }

  return { attempted, sent, failed }
}

export async function sendResultsAnnouncementEmails(hackathonId: string): Promise<number> {
  return (await sendResultsAnnouncementEmailsWithResult(hackathonId)).sent
}
