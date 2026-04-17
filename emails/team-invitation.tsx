import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { EventDetailBox } from "./_components/event-detail-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

interface TeamInvitationEmailProps {
  inviterName: string
  teamName: string
  hackathonName: string
  acceptUrl: string
  expiresDate: string
  eventUrl?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  teamMembers?: string[]
}

export default function TeamInvitationEmail({
  inviterName,
  teamName,
  hackathonName,
  acceptUrl,
  expiresDate,
  eventUrl,
  hackathonStartsAt,
  hackathonEndsAt,
  teamMembers,
}: TeamInvitationEmailProps) {
  return (
    <OatmealLayout
      heading="You're Invited to Join a Team!"
      preview={`${inviterName} invited you to join "${teamName}" for ${hackathonName}`}
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
        <strong>{inviterName}</strong> wants you on team{" "}
        <strong>&ldquo;{teamName}&rdquo;</strong> for{" "}
        <strong>{hackathonName}</strong>.
      </Text>

      <EventDetailBox
        hackathonName={hackathonName}
        startsAt={hackathonStartsAt}
        endsAt={hackathonEndsAt}
      />

      {teamMembers && teamMembers.length > 0 && (
        <Text
          style={{
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            margin: `-${spacing.md} 0 ${spacing.lg} 0`,
          }}
        >
          Already on the team:{" "}
          {teamMembers.length <= 5
            ? teamMembers.join(", ")
            : `${teamMembers.slice(0, 5).join(", ")}, and ${teamMembers.length - 5} others`}
        </Text>
      )}

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

TeamInvitationEmail.PreviewProps = {
  inviterName: "Sarah Chen",
  teamName: "Neural Navigators",
  hackathonName: "AI Innovation Hackathon 2026",
  acceptUrl: "https://getoatmeal.com/invite/abc123",
  expiresDate: "Friday, April 17, 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
  hackathonStartsAt: "2026-04-20T08:30:00Z",
  hackathonEndsAt: "2026-04-22T17:00:00Z",
  teamMembers: ["Sarah Chen", "Marcus Rivera"],
} satisfies TeamInvitationEmailProps
