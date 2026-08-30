import { sanitizeTag, renderEmail, buildEventUrl, shortHackathonName } from "./utils"
import type {
  ChallengeSummary,
  TransitionEvent,
} from "@/lib/db/hackathon-types"
import TransitionNotificationEmail from "@/emails/transition-notification"

type EmailContent = {
  subject: string
  html: string
  text: string
  tag: string
}

const subjectMap: Record<TransitionEvent, (name: string) => string> = {
  hackathon_started: (name) => `${name} is now live`,
  judging_started: (name) => `Judging has started for ${name}`,
  results_published: (name) => `Results for ${name}`,
  registration_opened: (name) => `Registration open for ${name}`,
}

export async function buildTransitionEmail(
  event: TransitionEvent,
  hackathonName: string,
  hackathonSlug: string,
  options?: {
    hackathonStartsAt?: string | null
    hackathonEndsAt?: string | null
    challenges?: ChallengeSummary[]
    recipientRole?: string
  }
): Promise<EmailContent> {
  const isJudgeScoringStart =
    event === "judging_started" && options?.recipientRole === "judge"
  const eventUrl = buildEventUrl(
    hackathonSlug,
    isJudgeScoringStart ? "/judge" : undefined,
  )
  const tag = sanitizeTag(hackathonName)
  const hasChallenges = !!options?.challenges && options.challenges.length > 0

  const { html, text } = await renderEmail(
    TransitionNotificationEmail({
      event,
      hackathonName,
      eventUrl,
      hackathonStartsAt: options?.hackathonStartsAt,
      hackathonEndsAt: options?.hackathonEndsAt,
      challenges: options?.challenges,
      recipientRole: options?.recipientRole,
    })
  )

  const shortName = shortHackathonName(hackathonName)
  const subject = isJudgeScoringStart
    ? `Your judging is ready for ${shortName}`
    : hasChallenges
    ? `${shortName} is live — see the challenges`
    : subjectMap[event](shortName)

  return { subject, html, text, tag }
}
