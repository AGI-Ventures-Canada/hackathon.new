import { sanitizeTag, renderEmail, buildEventUrl } from "./utils"
import ChallengesReleasedEmail, {
  type ChallengeSummary,
} from "@/emails/challenges-released"

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
    subject: `Challenges for ${hackathonName} are live`,
    html,
    text,
    tag,
  }
}
