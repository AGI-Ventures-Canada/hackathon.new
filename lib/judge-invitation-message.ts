export function getJudgeInvitationMessage(
  email: string,
  queued: boolean,
  deliveryFailed = false,
): string {
  if (deliveryFailed) {
    return `Invite saved for ${email}, but we couldn't confirm the email was sent. Use Send again in the invite list.`
  }

  return queued
    ? `Invite saved for ${email}. It'll send when the event goes live.`
    : `Invitation sent to ${email}`
}

export function getJudgeAddedMessage(
  name: string,
  queued: boolean,
  deliveryFailed = false,
): string {
  if (deliveryFailed) {
    return `${name} was added as a judge, but we couldn't confirm the email was sent.`
  }
  return queued
    ? `${name} was added as a judge. Their email will send when the event goes live.`
    : `${name} was added as a judge and emailed.`
}
