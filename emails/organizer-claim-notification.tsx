import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"
import { formatPrizeValue } from "./_components/format-utils"

interface OrganizerClaimNotificationEmailProps {
  winnerName: string
  prizeName: string
  hackathonName: string
  fulfillmentUrl: string | null
  eventUrl?: string
  prizeValue?: string | null
}

export default function OrganizerClaimNotificationEmail({
  winnerName,
  prizeName,
  hackathonName,
  fulfillmentUrl,
  eventUrl,
  prizeValue,
}: OrganizerClaimNotificationEmailProps) {
  return (
    <OatmealLayout
      heading="Prize Claimed"
      preview={`${winnerName} claimed ${prizeName}`}
      footerText={`You\u2019re getting this because you organize ${hackathonName}.`}
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
        <strong>{winnerName}</strong> has claimed the{" "}
        <strong>{prizeName}</strong>
        {prizeValue ? ` (${formatPrizeValue(prizeValue)})` : ""} prize from {hackathonName}.
      </Text>

      <Text
        style={{
          fontSize: fontSize.sm,
          color: colors.textMuted,
          marginBottom: spacing.lg,
          lineHeight: "1.5",
        }}
      >
        Their contact and delivery details are now in the fulfillment tracker.
      </Text>

      {fulfillmentUrl && (
        <CTAButton href={fulfillmentUrl}>View Fulfillment Tracker</CTAButton>
      )}
    </OatmealLayout>
  )
}

OrganizerClaimNotificationEmail.PreviewProps = {
  winnerName: "Jane Smith",
  prizeName: "Best AI Application",
  hackathonName: "AI Innovation Hackathon 2026",
  fulfillmentUrl:
    "https://hackathon.new/e/ai-innovation-2026/manage?tab=post-event",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
  prizeValue: "5000",
} satisfies OrganizerClaimNotificationEmailProps
