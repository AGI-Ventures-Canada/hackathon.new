import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface JudgeAddedEmailProps {
  addedByName: string
  hackathonName: string
  eventUrl: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
}

export default function JudgeAddedEmail({
  addedByName,
  hackathonName,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
}: JudgeAddedEmailProps) {
  return (
    <OatmealLayout
      heading="You've Been Added as a Judge"
      preview={`${addedByName} added you as a judge for ${hackathonName}`}
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
        <strong>{addedByName}</strong> added you as a judge for{" "}
        <strong>{hackathonName}</strong>.
      </Text>

      <EventDetailBox
        hackathonName={hackathonName}
        startsAt={hackathonStartsAt}
        endsAt={hackathonEndsAt}
      />

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Head to the event page to see the projects you&rsquo;ll be scoring.
      </Text>

      <CTAButton href={eventUrl}>View Event</CTAButton>
    </OatmealLayout>
  )
}

JudgeAddedEmail.PreviewProps = {
  addedByName: "Alex Ivany",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
} satisfies JudgeAddedEmailProps
