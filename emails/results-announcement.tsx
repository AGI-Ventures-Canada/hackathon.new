import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface ResultsAnnouncementEmailProps {
  participantName: string
  hackathonName: string
  resultsUrl: string
}

export default function ResultsAnnouncementEmail({
  participantName,
  hackathonName,
  resultsUrl,
}: ResultsAnnouncementEmailProps) {
  return (
    <OatmealLayout
      heading="Results Are In!"
      preview={`Results for ${hackathonName} have been published`}
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
        Hi {participantName}, the results for{" "}
        <strong>{hackathonName}</strong> are out! Winners have been picked and
        you can see all the projects.
      </Text>

      <CTAButton href={resultsUrl}>View Results</CTAButton>
    </OatmealLayout>
  )
}

ResultsAnnouncementEmail.PreviewProps = {
  participantName: "Jordan",
  hackathonName: "AI Innovation Hackathon 2026",
  resultsUrl: "https://hackathon.new/e/ai-innovation-2026",
} satisfies ResultsAnnouncementEmailProps
