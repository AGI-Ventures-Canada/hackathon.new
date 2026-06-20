import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import FeedbackSurveyEmail from "@/emails/feedback-survey"

export async function sendFeedbackSurveyEmails(
  hackathonId: string,
  surveyUrl: string
): Promise<{ sent: number; failed: number }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, skipping feedback survey")
    return { sent: 0, failed: 0 }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug, feedback_survey_sent_at")
    .eq("id", hackathonId)
    .single()

  if (!hackathon || hackathon.feedback_survey_sent_at) {
    return { sent: 0, failed: 0 }
  }

  const { data: participants } = await client
    .from("hackathon_participants")
    .select("clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "participant")

  if (!participants || participants.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const clerkUserIds = participants.map((p) => p.clerk_user_id)
  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)

  let sent = 0
  let failed = 0

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch })

    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) continue

      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || email.split("@")[0]

      const { html, text } = await renderEmail(
        FeedbackSurveyEmail({
          participantName: displayName,
          hackathonName: hackathon.name,
          surveyUrl,
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
      })

      if (result) sent++
      else failed++
    }
  }

  if (sent > 0) {
    await client
      .from("hackathons")
      .update({
        feedback_survey_sent_at: new Date().toISOString(),
        feedback_survey_url: surveyUrl,
      })
      .eq("id", hackathonId)
  }

  return { sent, failed }
}
