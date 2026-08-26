"use step"

import type { ChallengeSummary } from "@/lib/db/hackathon-types"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export type SendChallengesReleasedEmailInput = {
  notificationId: string
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
  const { getReplyToAddress, buildMailtoUnsubscribeHeaders } = await import(
    "@/lib/email/utils"
  )

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
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "challenges_released" },
      { name: "hackathon", value: tag },
    ],
    idempotencyKey: `challenges/${input.notificationId}/${recipientFingerprint(input.to)}`,
  })

  if (!result) {
    throw new Error(
      `Failed to send challenges-released email to ${input.to}`
    )
  }
}
