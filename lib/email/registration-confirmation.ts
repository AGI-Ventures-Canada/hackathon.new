import RegistrationConfirmationEmail from "@/emails/registration-confirmation"
import { sendEmail } from "./resend"
import {
  buildEventUrl,
  buildMailtoUnsubscribeHeaders,
  getReplyToAddress,
  renderEmail,
  sanitizeTag,
  shortHackathonName,
} from "./utils"

export type SendRegistrationConfirmationInput = {
  notificationId: string
  to: string
  hackathonName: string
  hackathonSlug: string
}

export async function sendRegistrationConfirmationEmail(
  input: SendRegistrationConfirmationInput,
): Promise<{ success: boolean }> {
  const eventUrl = buildEventUrl(input.hackathonSlug)
  const { html, text } = await renderEmail(
    RegistrationConfirmationEmail({
      hackathonName: input.hackathonName,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `You're registered for ${shortHackathonName(input.hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "registration_confirmation" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `registration-confirmation/${input.notificationId}`,
  })

  return { success: result !== null }
}
