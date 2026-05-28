import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { InfoBox } from "./_components/info-box"
import { colors, fontSize, spacing } from "./_components/constants"

interface SubmissionExportFailedEmailProps {
  recipientName: string | null
  hackathonName: string
  errorMessage: string
  retryUrl: string
  eventUrl: string
}

export default function SubmissionExportFailedEmail({
  recipientName,
  hackathonName,
  errorMessage,
  retryUrl,
  eventUrl,
}: SubmissionExportFailedEmailProps) {
  return (
    <OatmealLayout
      heading="Your export didn't finish"
      preview={`We hit a snag preparing the submissions export for ${hackathonName}`}
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
        {recipientName ? `Hi ${recipientName}, ` : "Hi, "}we ran into a problem
        packaging your export for <strong>{hackathonName}</strong>.
      </Text>

      <InfoBox label="What went wrong">
        <Text
          style={{
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            margin: 0,
            fontFamily:
              "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace",
          }}
        >
          {errorMessage}
        </Text>
      </InfoBox>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        You can try again from the hackathon&rsquo;s post-event page. If it
        keeps failing, reply to this email and we&rsquo;ll take a look.
      </Text>

      <CTAButton href={retryUrl}>Try again</CTAButton>
    </OatmealLayout>
  )
}

SubmissionExportFailedEmail.PreviewProps = {
  recipientName: "Alex",
  hackathonName: "AI Innovation Hackathon 2026",
  errorMessage: "Failed to upload export ZIP: storage quota exceeded",
  retryUrl: "https://getoatmeal.com/hackathons/abc?tab=post-event",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
} satisfies SubmissionExportFailedEmailProps
