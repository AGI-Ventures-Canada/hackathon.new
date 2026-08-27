import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { InfoBox } from "./_components/info-box"
import { colors, fontSize, spacing } from "./_components/constants"

interface PrizeShippedEmailProps {
  recipientName: string
  prizeName: string
  hackathonName: string
  trackingNumber: string | null
  eventUrl?: string
}

export default function PrizeShippedEmail({
  recipientName,
  prizeName,
  hackathonName,
  trackingNumber,
  eventUrl,
}: PrizeShippedEmailProps) {
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
        <InfoBox label="Tracking number">
          <Text style={{ margin: "0", fontSize: fontSize.base }}>
            {trackingNumber}
          </Text>
        </InfoBox>
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
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
} satisfies PrizeShippedEmailProps
