import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  paceBulkSend,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import FeedbackSurveyEmail from "@/emails/feedback-survey"
import { createHash } from "node:crypto"
import { isSafeExternalUrl, normalizeUrl } from "@/lib/utils/url"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"

function fingerprint(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export async function sendFeedbackSurveyEmails(
  hackathonId: string,
  surveyUrl: string
): Promise<{ sent: number; failed: number }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, skipping feedback survey")
    return { sent: 0, failed: 0 }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const normalizedSurveyUrl = normalizeUrl(surveyUrl)
  if (!isSafeExternalUrl(normalizedSurveyUrl)) {
    throw new Error("Use a public HTTPS survey link.")
  }

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug, status, results_published_at, feedback_survey_sent_at")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event: ${hackathonError.message}`)
  }
  if (
    !hackathon ||
    hackathon.status !== "completed" ||
    !hackathon.results_published_at ||
    hackathon.feedback_survey_sent_at
  ) {
    return { sent: 0, failed: 0 }
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
    return { sent: 0, failed: 0 }
  }

  const clerkUserIds = [...new Set(participants.map((p) => p.clerk_user_id))]
  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)
  const surveyKey = fingerprint(normalizedSurveyUrl)

  let sent = 0
  let failed = 0
  let unresolved = 0

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
    const usersById = new Map(users.data.map((user) => [user.id, user]))

    for (const userId of batch) {
      const user = usersById.get(userId)
      if (!user?.primaryEmailAddress?.emailAddress) unresolved++
    }

    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) continue

      await paceBulkSend(sent + failed)

      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || email.split("@")[0]

      const { html, text } = await renderEmail(
        FeedbackSurveyEmail({
          participantName: displayName,
          hackathonName: hackathon.name,
          surveyUrl: normalizedSurveyUrl,
          eventUrl: buildEventUrl(hackathon.slug),
        })
      )

      const result = await sendEmail({
        to: email,
        subject: `Share Your Feedback — ${shortHackathonName(hackathon.name)}`,
        html,
        text,
        replyTo: getReplyToAddress(),
        headers: buildMailtoUnsubscribeHeaders(),
        tags: [
          { name: "type", value: "feedback_survey" },
          { name: "hackathon", value: tag },
        ],
        idempotencyKey: `feedback-survey/${hackathonId}/${surveyKey}/${fingerprint(email)}`,
      })

      if (result) sent++
      else failed++
    }
  }

  if (unresolved > 0) {
    const decision = await getUnresolvedEmailDecision(
      `feedback:${hackathonId}:${surveyKey}:${fingerprint(hackathon.results_published_at)}`,
    )
    if (decision === "retry") {
      failed += unresolved
    } else {
      console.warn(
        `Feedback survey: ${unresolved} recipient record(s) remained unavailable after bounded retries for hackathon ${hackathonId}.`,
      )
    }
  }

  const update = failed === 0
    ? {
        feedback_survey_sent_at: new Date().toISOString(),
        feedback_survey_url: normalizedSurveyUrl,
      }
    : { feedback_survey_url: normalizedSurveyUrl }
  const { data: updated, error: updateError } = await client
    .from("hackathons")
    .update(update)
    .eq("id", hackathonId)
    .eq("status", "completed")
    .eq("results_published_at", hackathon.results_published_at)
    .is("feedback_survey_sent_at", null)
    .select("id")
    .maybeSingle()
  if (updateError) {
    throw new Error(`Failed to save feedback survey delivery: ${updateError.message}`)
  }
  if (!updated) {
    throw new Error("The event changed while feedback emails were being sent.")
  }

  return { sent, failed }
}
