import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { InfoBox } from "./_components/info-box"
import { colors, fontSize, spacing } from "./_components/constants"

interface PreEventReminderEmailProps {
  hackathonName: string
  participantName: string
  deadlineLabel: string
  timeLeft: string
  deadlineDate: string
  ctaUrl: string
  ctaLabel: string
  heading: string
  body: string
}

export default function PreEventReminderEmail({
  hackathonName,
  participantName,
  deadlineLabel,
  timeLeft,
  deadlineDate,
  ctaUrl,
  ctaLabel,
  heading,
  body,
}: PreEventReminderEmailProps) {
  return (
    <OatmealLayout
      heading={heading}
      preview={`${deadlineLabel} in ${timeLeft} \u2014 ${hackathonName}`}
      footerText={`You\u2019re receiving this because you\u2019re registered for ${hackathonName}.`}
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Hi {participantName}, {body}
      </Text>

      <InfoBox label={deadlineLabel}>
        <Text style={{ margin: "0", fontSize: fontSize.base, fontWeight: 600 }}>
          {deadlineDate}
        </Text>
        <Text
          style={{
            margin: "4px 0 0 0",
            fontSize: fontSize.sm,
            color: colors.textMuted,
          }}
        >
          {timeLeft} left
        </Text>
      </InfoBox>

      <CTAButton href={ctaUrl}>{ctaLabel}</CTAButton>
    </OatmealLayout>
  )
}

PreEventReminderEmail.PreviewProps = {
  hackathonName: "AI Innovation Hackathon 2026",
  participantName: "Sarah",
  deadlineLabel: "Registration closes",
  timeLeft: "2 days",
  deadlineDate: "Friday, May 1, 2026",
  ctaUrl: "https://hackathon.new/e/ai-innovation-2026",
  ctaLabel: "Register Now",
  heading: "Registration closes soon",
  body: "registration for AI Innovation Hackathon 2026 is closing soon. Make sure to sign up before the deadline.",
} satisfies PreEventReminderEmailProps
