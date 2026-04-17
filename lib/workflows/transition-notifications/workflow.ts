"use workflow"

import type { TransitionEvent } from "@/lib/db/hackathon-types"

export type TransitionNotificationInput = {
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  event: TransitionEvent
  recipientRoles: string[]
}

export async function sendTransitionNotificationsWorkflow(
  input: TransitionNotificationInput
): Promise<{ sent: number; failed: number }> {
  const { fetchRecipientEmails, sendTransitionEmail } = await import("./steps")

  const emails = await fetchRecipientEmails(input.hackathonId, input.recipientRoles)

  if (emails.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  for (const email of emails) {
    try {
      await sendTransitionEmail({
        to: email,
        event: input.event,
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
        hackathonStartsAt: input.hackathonStartsAt,
        hackathonEndsAt: input.hackathonEndsAt,
      })
      sent++
    } catch (err) {
      console.error(`Failed to send transition email to ${email}:`, err)
      failed++
    }
  }

  if (failed > 0) {
    throw new Error(
      `${failed}/${emails.length} transition emails failed — workflow will retry`
    )
  }

  return { sent, failed: 0 }
}
