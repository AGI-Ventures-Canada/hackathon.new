import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { colors } from "./_components/constants"

interface OrganizerClaimNotificationEmailProps {
  winnerName: string
  prizeName: string
  hackathonName: string
  fulfillmentUrl: string | null
  prizeValue?: string | null
}

export default function OrganizerClaimNotificationEmail({
  winnerName,
  prizeName,
  hackathonName,
  fulfillmentUrl,
  prizeValue,
}: OrganizerClaimNotificationEmailProps) {
  return (
    <OatmealLayout
      heading="Prize Claimed"
      preview={`${winnerName} claimed ${prizeName}`}
      footerText={`You\u2019re receiving this because you organize ${hackathonName}.`}
    >
      <Text style={{ fontSize: "14px", marginBottom: "16px", lineHeight: "1.6" }}>
        <strong>{winnerName}</strong> has claimed the{" "}
        <strong>{prizeName}</strong>{prizeValue ? ` ($${prizeValue})` : ""} prize from {hackathonName}.
      </Text>

      <Text
        style={{
          fontSize: "13px",
          color: colors.textMuted,
          marginBottom: "24px",
          lineHeight: "1.5",
        }}
      >
        Their contact and delivery details are now available in the fulfillment
        tracker.
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
  fulfillmentUrl: "https://getoatmeal.com/e/ai-innovation-2026/manage?tab=post-event",
  prizeValue: "500",
} satisfies OrganizerClaimNotificationEmailProps
