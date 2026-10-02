import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { InfoBox } from "./_components/info-box"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

interface JudgeInvitationReminderEmailProps {
  inviterName: string
  hackathonName: string
  acceptUrl: string
  expiresDate: string
  timeLeft: string
  eventUrl?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  eventSchedule?: string | null
}

export default function JudgeInvitationReminderEmail({
  inviterName,
  hackathonName,
  acceptUrl,
  expiresDate,
  timeLeft,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  eventSchedule,
}: JudgeInvitationReminderEmailProps) {
  return (
    <OatmealLayout
      heading="Friendly Reminder — You're Invited to Judge!"
      preview={`Reminder: ${inviterName} invited you to judge ${hackathonName}`}
      footerText="Reply if you no longer want reminders about this invitation."
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
        Just a heads-up — <strong>{inviterName}</strong> invited you to be a
        judge for the <strong>{hackathonName}</strong> hackathon. Your invite is
        still waiting!
      </Text>

      {eventSchedule ? (
        <Text
          style={{
            fontSize: fontSize.base,
            marginBottom: spacing.lg,
            lineHeight: "1.6",
          }}
        >
          <strong>Schedule:</strong> {eventSchedule}
        </Text>
      ) : hackathonStartsAt ? (
        <EventDetailBox
          hackathonName={hackathonName}
          startsAt={hackathonStartsAt}
          endsAt={hackathonEndsAt}
        />
      ) : (
        <InfoBox label="Hackathon">
          <Text style={{ margin: "0", fontSize: fontSize.base, fontWeight: 600 }}>
            {hackathonName}
          </Text>
        </InfoBox>
      )}

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Accept now to finish setting up access. After that, your judging page
        will show each project and what to do next.
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
        This invite expires on {expiresDate} ({timeLeft} left). If you
        don&rsquo;t have an account, you&rsquo;ll be able to create one when
        accepting.
      </Text>
    </OatmealLayout>
  )
}

JudgeInvitationReminderEmail.PreviewProps = {
  inviterName: "Jordan Lee",
  hackathonName: "AI Innovation Hackathon 2026",
  acceptUrl: "https://hackathon.new/judge-invite/xyz789",
  expiresDate: "Friday, April 17, 2026",
  timeLeft: "3 days",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026/judge",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
  eventSchedule: "Monday, April 20, 2026 at 8:30 AM UTC to Wednesday, April 22, 2026 at 5:00 PM UTC",
} satisfies JudgeInvitationReminderEmailProps
