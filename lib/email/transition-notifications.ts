import { sanitizeTag, renderEmail, buildEventUrl } from "./utils"
import type { TransitionEvent } from "@/lib/db/hackathon-types"
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
  }
): Promise<EmailContent> {
  const eventUrl = buildEventUrl(hackathonSlug)
  const tag = sanitizeTag(hackathonName)

  const { html, text } = await renderEmail(
    TransitionNotificationEmail({
      event,
      hackathonName,
      eventUrl,
      hackathonStartsAt: options?.hackathonStartsAt,
      hackathonEndsAt: options?.hackathonEndsAt,
    })
  )

  return { subject: subjectMap[event](hackathonName), html, text, tag }
}
