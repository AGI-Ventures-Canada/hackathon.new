import { Section, Text } from "@react-email/components"
import type { TransitionEvent } from "@/lib/db/hackathon-types"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

export interface ChallengeSummary {
  title: string
  description: string | null
}

interface TransitionNotificationEmailProps {
  event: TransitionEvent
  hackathonName: string
  eventUrl: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  challenges?: ChallengeSummary[]
}

const eventConfig: Record<
  TransitionEvent,
  {
    heading: (name: string) => string
    bodyPrefix: string
    bodySuffix: string
    ctaLabel: string
  }
> = {
  hackathon_started: {
    heading: (name) => `${name} Is Live!`,
    bodyPrefix: "",
    bodySuffix: " has started. Head to the event page to get hacking!",
    ctaLabel: "Go to Event",
  },
  judging_started: {
    heading: () => "Judging Has Begun",
    bodyPrefix: "Judging is now underway for ",
    bodySuffix: ". Check the event page for updates.",
    ctaLabel: "View Event",
  },
  results_published: {
    heading: () => "Results Are In!",
    bodyPrefix: "Results have been published for ",
    bodySuffix: ". See how you did!",
    ctaLabel: "View Results",
  },
  registration_opened: {
    heading: () => "Registration Is Open",
    bodyPrefix: "Registration is now open for ",
    bodySuffix: ". Sign up before spots fill up!",
    ctaLabel: "Register Now",
  },
}

const SUMMARY_LIMIT = 160

function truncate(text: string, limit: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`
}

export default function TransitionNotificationEmail({
  event,
  hackathonName,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  challenges,
}: TransitionNotificationEmailProps) {
  const config = eventConfig[event]
  const hasChallenges = !!challenges && challenges.length > 0
  const heading = hasChallenges
    ? `${hackathonName} Is Live — Here Are the Challenges`
    : config.heading(hackathonName)
  const bodyText = hasChallenges
    ? ` is live and the challenges are out. Take a look and start building.`
    : config.bodySuffix

  return (
    <OatmealLayout
      heading={heading}
      preview={heading}
      footerText={`You got this because you’re registered for ${hackathonName}.`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        {hasChallenges ? "" : config.bodyPrefix}
        <strong>{hackathonName}</strong>
        {bodyText}
      </Text>

      <EventDetailBox
        hackathonName={hackathonName}
        startsAt={hackathonStartsAt}
        endsAt={hackathonEndsAt}
      />

      {hasChallenges && (
        <Section style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
          <Text
            style={{
              fontSize: fontSize.lg,
              fontWeight: 700,
              marginBottom: spacing.md,
              color: colors.textPrimary,
            }}
          >
            Challenges
          </Text>
          {challenges!.map((c, idx) => (
            <Section
              key={idx}
              style={{
                borderLeft: `3px solid ${colors.accent}`,
                paddingLeft: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.base,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: "4px",
                  color: colors.textPrimary,
                }}
              >
                {c.title}
              </Text>
              {c.description && (
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textSecondary,
                    margin: 0,
                    lineHeight: "1.5",
                  }}
                >
                  {truncate(c.description, SUMMARY_LIMIT)}
                </Text>
              )}
            </Section>
          ))}
        </Section>
      )}

      <CTAButton href={eventUrl}>
        {hasChallenges ? "View Challenges" : config.ctaLabel}
      </CTAButton>
    </OatmealLayout>
  )
}

TransitionNotificationEmail.PreviewProps = {
  event: "hackathon_started",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
  challenges: [
    {
      title: "Build a Smarter Inbox",
      description: "Cut through email noise with an AI assistant that prioritizes what matters.",
    },
    {
      title: "Real-time Translation",
      description: "Live captions and translation for any video call participant.",
    },
  ],
} satisfies TransitionNotificationEmailProps
