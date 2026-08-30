import { Section, Text } from "@react-email/components"
import type { ChallengeSummary, TransitionEvent } from "@/lib/db/hackathon-types"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { ChallengeList } from "./_components/challenge-list"
import { colors, fontSize, spacing } from "./_components/constants"

interface TransitionNotificationEmailProps {
  event: TransitionEvent
  hackathonName: string
  eventUrl: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  challenges?: ChallengeSummary[]
  recipientRole?: string
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

export default function TransitionNotificationEmail({
  event,
  hackathonName,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  challenges,
  recipientRole,
}: TransitionNotificationEmailProps) {
  const config = eventConfig[event]
  const hasChallenges = !!challenges && challenges.length > 0
  const isJudgeScoringStart =
    event === "judging_started" && recipientRole === "judge"
  const heading = isJudgeScoringStart
    ? "Your Scores Are Ready"
    : hasChallenges
    ? `${hackathonName} Is Live — Here Are the Challenges`
    : config.heading(hackathonName)
  const bodyText = isJudgeScoringStart
    ? ". Your judging tasks are ready. Review each project and send your scores."
    : hasChallenges
    ? ` is live and the challenges are out. Take a look and start building.`
    : config.bodySuffix

  return (
    <OatmealLayout
      heading={heading}
      preview={heading}
      footerText={isJudgeScoringStart
        ? `You got this because you’re judging ${hackathonName}.`
        : `You got this because you’re registered for ${hackathonName}.`}
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
        {hasChallenges || isJudgeScoringStart ? "" : config.bodyPrefix}
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
            Pick one and start building
          </Text>
          <ChallengeList challenges={challenges ?? []} />
        </Section>
      )}

      <CTAButton href={eventUrl}>
        {isJudgeScoringStart
          ? "Start Judging"
          : hasChallenges
            ? "View Challenges"
            : config.ctaLabel}
      </CTAButton>
    </OatmealLayout>
  )
}

TransitionNotificationEmail.PreviewProps = {
  event: "hackathon_started",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
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
