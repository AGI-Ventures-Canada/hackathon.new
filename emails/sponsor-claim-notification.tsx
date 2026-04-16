import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { colors } from "./_components/constants"
import { CTAButton } from "./_components/cta-button"

interface SponsorClaimNotificationEmailProps {
  winnerName: string
  prizeName: string
  hackathonName: string
  eventUrl?: string | null
  prizeValue?: string | null
}

function formatPrizeValue(value: string): string {
  const stripped = value.replace(/^\$/, "")
  const num = Number(stripped.replace(/,/g, ""))
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    return `$${num.toLocaleString("en-US")}`
  }
  return stripped.startsWith("$") ? stripped : `$${stripped}`
}

export default function SponsorClaimNotificationEmail({
  winnerName,
  prizeName,
  hackathonName,
  eventUrl,
  prizeValue,
}: SponsorClaimNotificationEmailProps) {
  return (
    <OatmealLayout
      heading="Winner Info Ready"
      preview={`${winnerName} claimed ${prizeName}`}
      footerText={`You\u2019re receiving this because your organization sponsors a prize in ${hackathonName}.`}
    >
      <Text style={{ fontSize: "14px", marginBottom: "16px", lineHeight: "1.6" }}>
        <strong>{winnerName}</strong> has claimed the{" "}
        <strong>{prizeName}</strong>{prizeValue ? ` (${formatPrizeValue(prizeValue)})` : ""} prize from {hackathonName}.
      </Text>

      <Text
        style={{
          fontSize: "13px",
          color: colors.textMuted,
          marginBottom: "24px",
          lineHeight: "1.5",
        }}
      >
        Their contact and delivery details are now available. The event organizer
        will coordinate fulfillment.
      </Text>

      {eventUrl && (
        <CTAButton href={eventUrl}>View Event</CTAButton>
      )}
    </OatmealLayout>
  )
}

SponsorClaimNotificationEmail.PreviewProps = {
  winnerName: "Jane Smith",
  prizeName: "Best AI Application",
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
  prizeValue: "5000",
} satisfies SponsorClaimNotificationEmailProps
