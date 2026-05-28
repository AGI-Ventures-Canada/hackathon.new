import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { InfoBox } from "./_components/info-box"
import { colors, fontSize, spacing } from "./_components/constants"

interface SubmissionExportReadyEmailProps {
  recipientName: string | null
  hackathonName: string
  submissionCount: number
  fileSizeLabel: string
  expiresLabel: string
  downloadUrl: string
  eventUrl: string
}

export default function SubmissionExportReadyEmail({
  recipientName,
  hackathonName,
  submissionCount,
  fileSizeLabel,
  expiresLabel,
  downloadUrl,
  eventUrl,
}: SubmissionExportReadyEmailProps) {
  return (
    <OatmealLayout
      heading="Your export is ready"
      preview={`Submissions export for ${hackathonName} is ready to download`}
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
        {recipientName ? `Hi ${recipientName}, ` : "Hi, "}your export for{" "}
        <strong>{hackathonName}</strong> finished packaging.
      </Text>

      <InfoBox label="What's inside">
        <Text
          style={{
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            margin: `0 0 ${spacing.sm} 0`,
          }}
        >
          {submissionCount} {submissionCount === 1 ? "submission" : "submissions"}
          {" · "}
          {fileSizeLabel}
        </Text>
        <Text
          style={{
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            margin: 0,
          }}
        >
          A ZIP with a spreadsheet, a printable PDF, the full data, and every
          submission&rsquo;s screenshots.
        </Text>
      </InfoBox>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        The link below will ask you to sign in, then start the download.
      </Text>

      <CTAButton href={downloadUrl}>Download the export</CTAButton>

      <Text
        style={{
          fontSize: fontSize.sm,
          color: colors.textMuted,
          marginTop: spacing.lg,
          marginBottom: 0,
          lineHeight: "1.6",
        }}
      >
        Heads up: this download link will stop working on {expiresLabel}. You can
        always make a new export from the hackathon&rsquo;s post-event page.
      </Text>
    </OatmealLayout>
  )
}

SubmissionExportReadyEmail.PreviewProps = {
  recipientName: "Alex",
  hackathonName: "AI Innovation Hackathon 2026",
  submissionCount: 42,
  fileSizeLabel: "18.4 MB",
  expiresLabel: "June 26, 2026",
  downloadUrl: "https://getoatmeal.com/api/hackathons/abc/exports/xyz/download",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
} satisfies SubmissionExportReadyEmailProps
