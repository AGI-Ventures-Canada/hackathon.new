"use step"

import type { ChallengeSummary } from "@/lib/db/hackathon-types"

export type SendChallengesReleasedEmailInput = {
  to: string
  hackathonName: string
  hackathonSlug: string
  challenges: ChallengeSummary[]
}

export async function sendChallengesReleasedEmail(
  input: SendChallengesReleasedEmailInput
): Promise<void> {
  const { buildChallengesReleasedEmail } = await import(
    "@/lib/email/challenges-released"
  )
  const { sendEmail } = await import("@/lib/email/resend")

  const { subject, html, text, tag } = await buildChallengesReleasedEmail(
    input.hackathonName,
    input.hackathonSlug,
    input.challenges
  )

  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    tags: [
      { name: "type", value: "challenges_released" },
      { name: "hackathon", value: tag },
    ],
  })

  if (!result) {
    throw new Error(
      `Failed to send challenges-released email to ${input.to}`
    )
  }
}
