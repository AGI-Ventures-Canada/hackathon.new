import { Section, Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { colors, fontSize, spacing } from "./_components/constants"

interface PrizeShippedEmailProps {
  recipientName: string
  prizeName: string
  hackathonName: string
  trackingNumber: string | null
  hackathonSlug?: string
}

export default function PrizeShippedEmail({
  recipientName,
  prizeName,
  hackathonName,
  trackingNumber,
  hackathonSlug,
}: PrizeShippedEmailProps) {
  const eventUrl = hackathonSlug
    ? `${process.env.NEXT_PUBLIC_APP_URL || "https://getoatmeal.com"}/e/${hackathonSlug}`
    : undefined

  return (
    <OatmealLayout
      heading="Your Prize is On Its Way!"
      preview={`${prizeName} from ${hackathonName} has been shipped`}
      footerText={`You\u2019re getting this because you claimed a prize from ${hackathonName}.`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.md,
          lineHeight: "1.6",
        }}
      >
        Hi {recipientName}, great news! Your prize{" "}
        <strong>{prizeName}</strong> from {hackathonName} has been shipped.
      </Text>

      {trackingNumber && (
        <Section
          style={{
            background: colors.infoBoxBg,
            padding: `${spacing.md} ${spacing.lg}`,
            marginBottom: spacing.md,
            borderRadius: "8px",
            borderLeft: `3px solid ${colors.accent}`,
          }}
        >
          <Text style={{ margin: "0", fontSize: fontSize.base }}>
            <strong>Tracking number:</strong> {trackingNumber}
          </Text>
        </Section>
      )}

      <Text
        style={{
          fontSize: fontSize.sm,
          color: colors.textMuted,
          lineHeight: "1.5",
        }}
      >
        If you have any questions about delivery, contact the event organizer.
      </Text>
    </OatmealLayout>
  )
}

PrizeShippedEmail.PreviewProps = {
  recipientName: "Jane",
  prizeName: "Best AI Application",
  hackathonName: "AI Innovation Hackathon 2026",
  trackingNumber: "1Z999AA10123456784",
  hackathonSlug: "ai-innovation-2026",
} satisfies PrizeShippedEmailProps
