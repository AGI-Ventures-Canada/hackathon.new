import { Text, Link, Section } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

interface WinnerPrize {
  name: string
  value: string | null
  claimUrl: string | null
}

interface WinnerNotificationEmailProps {
  submissionTitle: string
  rank: string
  hackathonName: string
  resultsUrl: string
  prizes: WinnerPrize[]
  primaryClaimUrl: string | null
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
}

export default function WinnerNotificationEmail({
  submissionTitle,
  rank,
  hackathonName,
  resultsUrl,
  prizes,
  primaryClaimUrl,
  hackathonStartsAt,
  hackathonEndsAt,
}: WinnerNotificationEmailProps) {
  return (
    <OatmealLayout
      heading="Congratulations!"
      preview={`${rank} Place in ${hackathonName}!`}
      footerText={`You\u2019re getting this because you took part in ${hackathonName}.`}
      eventUrl={resultsUrl}
      hackathonName={hackathonName}
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Your project <strong>&ldquo;{submissionTitle}&rdquo;</strong> placed{" "}
        <strong>{rank}</strong> in <strong>{hackathonName}</strong>!
      </Text>

      <EventDetailBox
        hackathonName={hackathonName}
        startsAt={hackathonStartsAt}
        endsAt={hackathonEndsAt}
      />

      {prizes.length > 0 && (
        <Section
          style={{
            background: colors.infoBoxBg,
            padding: `${spacing.md} ${spacing.lg}`,
            marginBottom: spacing.lg,
            borderRadius: "8px",
            borderLeft: `3px solid ${colors.accent}`,
          }}
        >
          <Text
            style={{
              margin: "0 0 12px 0",
              fontSize: fontSize.xs,
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            Prizes won
          </Text>
          {prizes.map((prize) => (
            <Text
              key={prize.name}
              style={{
                margin: "0 0 8px 0",
                fontSize: fontSize.base,
                fontWeight: 600,
              }}
            >
              {prize.name}
              {prize.value ? ` \u2014 ${prize.value}` : ""}
              {prize.claimUrl && (
                <>
                  {" "}
                  <Link
                    href={prize.claimUrl}
                    style={{
                      color: colors.accent,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                  >
                    Claim
                  </Link>
                </>
              )}
            </Text>
          ))}
        </Section>
      )}

      {primaryClaimUrl && (
        <>
          <CTAButton href={primaryClaimUrl}>Claim Your Prize</CTAButton>
          <Text
            style={{
              fontSize: fontSize.sm,
              color: colors.textMuted,
              marginTop: spacing.lg,
              lineHeight: "1.5",
            }}
          >
            We just need your name and where to send it.
          </Text>
        </>
      )}

      <CTAButton
        href={resultsUrl}
        variant={primaryClaimUrl ? "secondary" : "primary"}
      >
        View Results
      </CTAButton>
    </OatmealLayout>
  )
}

WinnerNotificationEmail.PreviewProps = {
  submissionTitle: "SmartRoute AI",
  rank: "1st",
  hackathonName: "AI Innovation Hackathon 2026",
  resultsUrl: "https://getoatmeal.com/e/ai-innovation-2026",
  prizes: [
    {
      name: "Best AI Application",
      value: "$2,000",
      claimUrl: "https://getoatmeal.com/prizes/claim/tk1",
    },
    {
      name: "Most Innovative",
      value: "$500",
      claimUrl: null,
    },
  ],
  primaryClaimUrl: "https://getoatmeal.com/prizes/claim/tk1",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
} satisfies WinnerNotificationEmailProps
