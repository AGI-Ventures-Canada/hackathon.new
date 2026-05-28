import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface TeamApprovedEmailProps {
  teamName: string
  hackathonName: string
  eventUrl: string
}

export default function TeamApprovedEmail({
  teamName,
  hackathonName,
  eventUrl,
}: TeamApprovedEmailProps) {
  return (
    <OatmealLayout
      heading="Your Team Was Approved"
      preview={`Team "${teamName}" was approved for ${hackathonName}`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
      footerText="You're all set."
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        The organizer approved team <strong>&ldquo;{teamName}&rdquo;</strong> for{" "}
        <strong>{hackathonName}</strong>.
      </Text>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        You&apos;re ready to keep working with your team.
      </Text>

      <CTAButton href={eventUrl}>View Event</CTAButton>
    </OatmealLayout>
  )
}

TeamApprovedEmail.PreviewProps = {
  teamName: "Neural Navigators",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
} satisfies TeamApprovedEmailProps
