import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface RegistrationConfirmationEmailProps {
  hackathonName: string
  eventUrl: string
}

export default function RegistrationConfirmationEmail({
  hackathonName,
  eventUrl,
}: RegistrationConfirmationEmailProps) {
  return (
    <OatmealLayout
      heading="You're registered"
      preview={`You're registered for ${hackathonName}`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
      footerText="We'll email you when something important changes."
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        You&apos;re registered for <strong>{hackathonName}</strong>.
      </Text>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Open the event page to check your team, schedule, and project.
      </Text>

      <CTAButton href={eventUrl}>View Event</CTAButton>
    </OatmealLayout>
  )
}

RegistrationConfirmationEmail.PreviewProps = {
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
} satisfies RegistrationConfirmationEmailProps
