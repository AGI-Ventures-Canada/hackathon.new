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
  eventSchedule?: string | null
}

export default function JudgeAddedEmail({
  addedByName,
  hackathonName,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  eventSchedule,
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

      {eventSchedule ? (
        <Text
          style={{
            fontSize: fontSize.base,
            marginBottom: spacing.lg,
            lineHeight: "1.6",
          }}
        >
          <strong>Schedule:</strong> {eventSchedule}
        </Text>
      ) : (
        <EventDetailBox
          hackathonName={hackathonName}
          startsAt={hackathonStartsAt}
          endsAt={hackathonEndsAt}
        />
      )}

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Open your judging page to see your projects and scoring steps. If no
        projects are listed yet, you don&rsquo;t need to do anything.
      </Text>

      <CTAButton href={eventUrl}>Open Judging</CTAButton>
    </OatmealLayout>
  )
}

JudgeAddedEmail.PreviewProps = {
  addedByName: "Jordan Lee",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026/judge",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
  eventSchedule: "Monday, April 20, 2026 at 8:30 AM UTC to Wednesday, April 22, 2026 at 5:00 PM UTC",
} satisfies JudgeAddedEmailProps
