import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

interface JudgeInvitationEmailProps {
  inviterName: string
  hackathonName: string
  acceptUrl: string
  expiresDate: string
  hackathonSlug?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
}

export default function JudgeInvitationEmail({
  inviterName,
  hackathonName,
  acceptUrl,
  expiresDate,
  hackathonSlug,
  hackathonStartsAt,
  hackathonEndsAt,
}: JudgeInvitationEmailProps) {
  const eventUrl = hackathonSlug
    ? `${process.env.NEXT_PUBLIC_APP_URL || "https://getoatmeal.com"}/e/${hackathonSlug}`
    : undefined

  return (
    <OatmealLayout
      heading="You're Invited to Judge!"
      preview={`${inviterName} invited you to judge ${hackathonName}`}
      footerText="If you didn&#x2019;t expect this invitation, you can safely ignore this email."
      eventUrl={eventUrl}
      hackathonName={hackathonName}
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        <strong>{inviterName}</strong> wants you to be a judge for{" "}
        <strong>{hackathonName}</strong>.
      </Text>

      <EventDetailBox
        hackathonName={hackathonName}
        startsAt={hackathonStartsAt}
        endsAt={hackathonEndsAt}
      />

      <CTAButton href={acceptUrl}>Accept Invitation</CTAButton>

      <Text
        style={{
          fontSize: fontSize.sm,
          color: colors.textMuted,
          marginTop: spacing.lg,
          lineHeight: "1.5",
        }}
      >
        This invite is good until {expiresDate}. Don&rsquo;t have an account?
        You can make one when you accept.
      </Text>
    </OatmealLayout>
  )
}

JudgeInvitationEmail.PreviewProps = {
  inviterName: "Alex Ivany",
  hackathonName: "AI Innovation Hackathon 2026",
  acceptUrl: "https://getoatmeal.com/judge-invite/xyz789",
  expiresDate: "Friday, April 17, 2026",
  hackathonSlug: "ai-innovation-2026",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
} satisfies JudgeInvitationEmailProps
