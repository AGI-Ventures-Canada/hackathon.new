import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { InfoBox } from "./_components/info-box"
import { CTAButton } from "./_components/cta-button"
import { colors } from "./_components/constants"

interface TeamInvitationReminderEmailProps {
  inviterName: string
  teamName: string
  hackathonName: string
  acceptUrl: string
  expiresDate: string
  timeLeft: string
}

export default function TeamInvitationReminderEmail({
  inviterName,
  teamName,
  hackathonName,
  acceptUrl,
  expiresDate,
  timeLeft,
}: TeamInvitationReminderEmailProps) {
  return (
    <OatmealLayout
      heading="Friendly Reminder — You're Invited!"
      preview={`Reminder: ${inviterName} invited you to join "${teamName}" for ${hackathonName}`}
    >
      <Text style={{ fontSize: "14px", marginBottom: "24px", lineHeight: "1.6" }}>
        Just a heads-up — <strong>{inviterName}</strong> invited you to join
        team <strong>&ldquo;{teamName}&rdquo;</strong> for the{" "}
        <strong>{hackathonName}</strong> hackathon. Your spot is still open!
      </Text>

      <InfoBox label="Team">
        <Text style={{ margin: "0", fontSize: "16px", fontWeight: 600 }}>
          {teamName}
        </Text>
      </InfoBox>

      <CTAButton href={acceptUrl}>Accept Invitation</CTAButton>

      <Text
        style={{
          fontSize: "12px",
          color: colors.textMuted,
          marginTop: "24px",
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

TeamInvitationReminderEmail.PreviewProps = {
  inviterName: "Sarah Chen",
  teamName: "Neural Navigators",
  hackathonName: "AI Innovation Hackathon 2026",
  acceptUrl: "https://hackathon.new/invite/abc123",
  expiresDate: "Friday, April 17, 2026",
  timeLeft: "3 days",
} satisfies TeamInvitationReminderEmailProps
