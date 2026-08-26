"use workflow"

import type { ChallengeSummary } from "@/lib/db/hackathon-types"

export type ChallengesReleasedNotificationInput = {
  notificationId: string
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
  recipientRoles: string[]
  challenges: ChallengeSummary[]
}

export async function sendChallengesReleasedNotificationsWorkflow(
  input: ChallengesReleasedNotificationInput
): Promise<{ sent: number; failed: number }> {
  const { fetchRecipientEmails } = await import(
    "@/lib/workflows/transition-notifications/steps"
  )
  const { sendChallengesReleasedEmail } = await import("./steps")

  const emails = await fetchRecipientEmails(input.hackathonId, input.recipientRoles)

  if (emails.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  for (const email of emails) {
    try {
      await sendChallengesReleasedEmail({
        notificationId: input.notificationId,
        to: email,
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
        challenges: input.challenges,
      })
      sent++
    } catch (err) {
      console.error(
        `Failed to send challenges-released email to ${email}:`,
        err
      )
      failed++
    }
  }

  if (failed > 0) {
    throw new Error(
      `${failed}/${emails.length} challenges-released emails failed — workflow will retry`
    )
  }

  return { sent, failed: 0 }
}
