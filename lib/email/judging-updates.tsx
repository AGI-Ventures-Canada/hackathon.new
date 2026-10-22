import { reminderReplyAddress } from "@/lib/services/reminder-delivery"
import { Text } from "@react-email/components"
import { OatmealLayout } from "@/emails/_components/oatmeal-layout"
import { CTAButton } from "@/emails/_components/cta-button"
import { renderEmail, getReplyToAddress, buildMailtoUnsubscribeHeaders, sanitizeTag } from "./utils"
import { sendEmailWithResult } from "./resend"
import { formatEmailDeadline } from "./deadline"
import type { JudgingNotification } from "@/lib/services/judging-notifications"

export async function sendJudgingUpdateEmail(input: { to: string; notification: JudgingNotification; eventName: string; timezone: string; beforeAttempt?: () => Promise<void> }): Promise<boolean | "suppressed"> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return false
  const { notification } = input
  let stopped = false
  const actionUrl = `${base}${notification.action_path}`
  const preferencesUrl = `${base}${notification.action_path.split("?")[0]}#judging-updates`
  const { html, text } = await renderEmail(
    <OatmealLayout heading={notification.title} preview={notification.body} footerText={reminderReplyAddress("0".repeat(24)) ? "You got this because you help with judging. Reply STOP to stop these reminders for this event." : "You got this because you help with judging. Use your reminder settings to stop these emails."}>
      <Text>{input.eventName}</Text>
      <Text>{notification.body}</Text>
      {notification.metadata.deadline && <Text>Scores are due {formatEmailDeadline(notification.metadata.deadline, input.timezone)}.</Text>}
      <CTAButton href={actionUrl}>{notification.kind.startsWith("organizer_") ? "Check judging" : "Open my judging"}</CTAButton>
      <Text><a href={preferencesUrl}>Change my reminders</a></Text>
    </OatmealLayout>,
  )
  const accepted = await sendEmailWithResult({ to: input.to, subject: `${notification.title} — ${input.eventName}`, html, text, replyTo: getReplyToAddress(), headers: buildMailtoUnsubscribeHeaders(), tags: [{ name: "type", value: `judging_${notification.kind}` }, { name: "hackathon", value: sanitizeTag(input.eventName) }], idempotencyKey: `judging-update/${notification.id}`, reminder: { hackathonId: notification.hackathon_id, category: notification.kind.startsWith("organizer_") ? "organizer_judging" : "judge_judging", recipientUserId: notification.clerk_user_id, roundId: notification.round_id, onStopped: () => { stopped = true } } }, { beforeAttempt: input.beforeAttempt })
  return stopped ? "suppressed" : accepted.ok
}
