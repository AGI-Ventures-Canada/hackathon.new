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
  eventUrl?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  eventSchedule?: string | null
}

export default function JudgeInvitationEmail({
  inviterName,
  hackathonName,
  acceptUrl,
  expiresDate,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  eventSchedule,
}: JudgeInvitationEmailProps) {
  return (
    <OatmealLayout
      heading="You're Invited to Judge!"
      preview={`${inviterName} invited you to judge ${hackathonName}`}
      footerText="If you didn’t expect this invitation, you can safely ignore this email."
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

      {eventSchedule ? (
        <Text
          style={{
            fontSize: fontSize.base,
            marginBottom: spacing.lg,
            lineHeight: "1.6",
          }}
        >
          <strong>Event time:</strong> {eventSchedule}
        </Text>
      ) : (
        <EventDetailBox
          hackathonName={hackathonName}
          startsAt={hackathonStartsAt}
          endsAt={hackathonEndsAt}
        />
      )}

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Accept the invite first. You can sign in or make an account, then
        we&rsquo;ll take you straight to your judging page.
      </Text>

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
  inviterName: "Jordan Lee",
  hackathonName: "AI Innovation Hackathon 2026",
  acceptUrl: "https://hackathon.new/judge-invite/xyz789",
  expiresDate: "Friday, April 17, 2026",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026/judge",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
  eventSchedule: "Monday, April 20, 2026 at 8:30 AM UTC to Wednesday, April 22, 2026 at 5:00 PM UTC",
} satisfies JudgeInvitationEmailProps
