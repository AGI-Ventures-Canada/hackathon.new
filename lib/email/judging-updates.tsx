import { Text } from "@react-email/components"
import { OatmealLayout } from "@/emails/_components/oatmeal-layout"
import { CTAButton } from "@/emails/_components/cta-button"
import { renderEmail, getReplyToAddress, buildMailtoUnsubscribeHeaders, sanitizeTag } from "./utils"
import { sendEmailWithResult } from "./resend"
import { formatEmailDeadline } from "./deadline"
import type { JudgingNotification } from "@/lib/services/judging-notifications"

export async function sendJudgingUpdateEmail(input: { to: string; notification: JudgingNotification; eventName: string; timezone: string; beforeAttempt?: () => Promise<void> }): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return false
  const { notification } = input
  const actionUrl = `${base}${notification.action_path}`
  const preferencesUrl = `${base}${notification.action_path.split("?")[0]}#judging-updates`
  const { html, text } = await renderEmail(
    <OatmealLayout heading={notification.title} preview={notification.body} footerText="You got this because you're helping judge this event. Reply to stop reminders.">
      <Text>{input.eventName}</Text>
      <Text>{notification.body}</Text>
      {notification.metadata.deadline && <Text>Scores are due {formatEmailDeadline(notification.metadata.deadline, input.timezone)}.</Text>}
      <CTAButton href={actionUrl}>{notification.kind.startsWith("organizer_") ? "Check judging" : "Open my judging"}</CTAButton>
      <Text><a href={preferencesUrl}>Change my reminders</a></Text>
    </OatmealLayout>,
  )
  const accepted = await sendEmailWithResult({ to: input.to, subject: `${notification.title} — ${input.eventName}`, html, text, replyTo: getReplyToAddress(), headers: buildMailtoUnsubscribeHeaders(), tags: [{ name: "type", value: `judging_${notification.kind}` }, { name: "hackathon", value: sanitizeTag(input.eventName) }], idempotencyKey: `judging-update/${notification.id}` }, { beforeAttempt: input.beforeAttempt })
  return accepted.ok
}
