import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface TeamDeniedEmailProps {
  teamName: string
  hackathonName: string
  eventUrl: string
}

export default function TeamDeniedEmail({
  teamName,
  hackathonName,
  eventUrl,
}: TeamDeniedEmailProps) {
  return (
    <OatmealLayout
      heading="Your Team Wasn't Approved"
      preview={`Team "${teamName}" wasn't approved for ${hackathonName}`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
      footerText="You're still signed up for the event."
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        The organizer didn&apos;t approve team <strong>&ldquo;{teamName}&rdquo;</strong> for{" "}
        <strong>{hackathonName}</strong>.
      </Text>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        You&apos;re still signed up. You can join another team or make a new one.
      </Text>

      <CTAButton href={eventUrl}>View Event</CTAButton>
    </OatmealLayout>
  )
}

TeamDeniedEmail.PreviewProps = {
  teamName: "Neural Navigators",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
} satisfies TeamDeniedEmailProps
