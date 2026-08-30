"use workflow"

import type {
  ChallengeSummary,
  TransitionEvent,
} from "@/lib/db/hackathon-types"

export type TransitionNotificationInput = {
  notificationId: string
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  event: TransitionEvent
  recipientRoles: string[]
  challenges?: ChallengeSummary[]
}

export async function sendTransitionNotificationsWorkflow(
  input: TransitionNotificationInput
): Promise<{ sent: number; failed: number }> {
  const { fetchTransitionRecipients, sendTransitionEmail } = await import("./steps")

  const recipients = await fetchTransitionRecipients(
    input.hackathonId,
    input.recipientRoles,
  )

  if (recipients.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  for (const recipient of recipients) {
    try {
      await sendTransitionEmail({
        notificationId: input.notificationId,
        to: recipient.email,
        recipientRole: recipient.role,
        event: input.event,
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
        hackathonStartsAt: input.hackathonStartsAt,
        hackathonEndsAt: input.hackathonEndsAt,
        challenges: input.challenges,
      })
      sent++
    } catch (err) {
      console.error(`Failed to send transition email to ${recipient.email}:`, err)
      failed++
    }
  }

  if (failed > 0) {
    throw new Error(
      `${failed}/${recipients.length} transition emails failed — workflow will retry`
    )
  }

  return { sent, failed: 0 }
}
