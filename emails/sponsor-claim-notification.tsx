import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"
import { formatPrizeValue } from "./_components/format-utils"

interface SponsorClaimNotificationEmailProps {
  winnerName: string
  prizeName: string
  hackathonName: string
  eventUrl?: string | null
  prizeValue?: string | null
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
      footerText={`You\u2019re getting this because your organization sponsors a prize in ${hackathonName}.`}
      eventUrl={eventUrl ?? undefined}
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
        The organizer will reach out to sort out delivery.
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
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
  prizeValue: "5000",
} satisfies SponsorClaimNotificationEmailProps
