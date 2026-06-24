import { sanitizeTag, renderEmail, buildEventUrl, shortHackathonName } from "./utils"
import type { ChallengeSummary } from "@/lib/db/hackathon-types"
import ChallengesReleasedEmail from "@/emails/challenges-released"

type EmailContent = {
  subject: string
  html: string
  text: string
  tag: string
}

export async function buildChallengesReleasedEmail(
  hackathonName: string,
  hackathonSlug: string,
  challenges: ChallengeSummary[]
): Promise<EmailContent> {
  const eventUrl = buildEventUrl(hackathonSlug)
  const tag = sanitizeTag(hackathonName)

  const { html, text } = await renderEmail(
    ChallengesReleasedEmail({ hackathonName, eventUrl, challenges })
  )

  return {
    subject: `Challenges for ${shortHackathonName(hackathonName)} are live`,
    html,
    text,
    tag,
  }
}
