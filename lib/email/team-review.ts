import { sendEmail } from "./resend"
import { buildEventUrl, getReplyToAddress, renderEmail, sanitizeTag } from "./utils"
import TeamDeniedEmail from "@/emails/team-denied"

export type SendTeamDeniedInput = {
  to: string
  teamName: string
  hackathonName: string
  hackathonSlug: string
}

export async function sendTeamDeniedEmail(
  input: SendTeamDeniedInput
): Promise<{ success: boolean }> {
  const eventUrl = buildEventUrl(input.hackathonSlug)
  const { html, text } = await renderEmail(
    TeamDeniedEmail({
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `Your team wasn't approved for ${input.hackathonName}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "team_denied" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}

export async function sendTeamDeniedEmails(
  input: Omit<SendTeamDeniedInput, "to"> & { recipients: string[] }
): Promise<number> {
  const uniqueRecipients = [...new Set(input.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))]
  let sent = 0

  for (const to of uniqueRecipients) {
    const result = await sendTeamDeniedEmail({
      to,
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      hackathonSlug: input.hackathonSlug,
    })
    if (result.success) sent++
  }

  return sent
}
