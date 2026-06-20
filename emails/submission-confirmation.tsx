import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { InfoBox } from "./_components/info-box"
import { CTAButton } from "./_components/cta-button"
import { colors, fontSize, spacing } from "./_components/constants"

interface SubmissionConfirmationEmailProps {
  hackathonName: string
  projectTitle: string
  teamName?: string | null
  eventUrl: string
}

export default function SubmissionConfirmationEmail({
  hackathonName,
  projectTitle,
  teamName,
  eventUrl,
}: SubmissionConfirmationEmailProps) {
  return (
    <OatmealLayout
      heading="We got your project"
      preview={`"${projectTitle}" is submitted for ${hackathonName}`}
      eventUrl={eventUrl}
      hackathonName={hackathonName}
      footerText="You don't need to do anything else."
    >
      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        Your project is in for <strong>{hackathonName}</strong>.{" "}
        {teamName
          ? `Everyone on team "${teamName}" got this email.`
          : "You're all set."}
      </Text>

      <InfoBox label="Project">
        <Text
          style={{
            margin: "0",
            fontSize: fontSize.base,
            color: colors.textPrimary,
            fontWeight: 600,
          }}
        >
          {projectTitle}
        </Text>
      </InfoBox>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        You can update your submission from the event page until submissions
        close.
      </Text>

      <CTAButton href={eventUrl}>View Event</CTAButton>
    </OatmealLayout>
  )
}

SubmissionConfirmationEmail.PreviewProps = {
  hackathonName: "AI Innovation Hackathon 2026",
  projectTitle: "Neural Recipe Generator",
  teamName: "Neural Navigators",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
} satisfies SubmissionConfirmationEmailProps
