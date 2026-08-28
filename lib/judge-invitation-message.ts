import { getQueueReasonText, type QueueReasonCode } from "@/lib/utils/notification-delivery"

export function getJudgeInvitationMessage(
  email: string,
  queued: boolean,
  deliveryFailed = false,
  queueReason: QueueReasonCode = "event_draft",
): string {
  if (deliveryFailed) {
    return `Invite saved for ${email}, but we couldn't confirm the email was sent. Use Send again in the invite list.`
  }

  const queueCopy = getQueueReasonText(queueReason)
  return queued
    ? `Invite saved for ${email}. ${queueCopy.reason} ${queueCopy.release}`
    : `Invitation sent to ${email}`
}

export function getJudgeAddedMessage(
  name: string,
  queued: boolean,
  deliveryFailed = false,
  queueReason: QueueReasonCode = "event_draft",
): string {
  if (deliveryFailed) {
    return `${name} was added as a judge, but we couldn't confirm the email was sent.`
  }
  const queueCopy = getQueueReasonText(queueReason)
  return queued
    ? `${name} was added as a judge. ${queueCopy.reason} ${queueCopy.release}`
    : `${name} was added as a judge and emailed.`
}
