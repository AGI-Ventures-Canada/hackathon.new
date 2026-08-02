import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { fontSize, spacing } from "./_components/constants"

interface FeedbackSurveyEmailProps {
  participantName: string
  hackathonName: string
  surveyUrl: string
  eventUrl?: string
}

export default function FeedbackSurveyEmail({
  participantName,
  hackathonName,
  surveyUrl,
  eventUrl,
}: FeedbackSurveyEmailProps) {
  return (
    <OatmealLayout
      heading="Share Your Feedback"
      preview={`Share your thoughts on ${hackathonName}`}
      footerText={`You\u2019re getting this because you took part in ${hackathonName}.`}
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
        Hi {participantName}, thanks for being part of{" "}
        <strong>{hackathonName}</strong>! We&rsquo;d love to hear what you
        thought so we can make future events even better. It only takes a
        couple of minutes.
      </Text>

      <CTAButton href={surveyUrl}>Share Your Feedback</CTAButton>
    </OatmealLayout>
  )
}

FeedbackSurveyEmail.PreviewProps = {
  participantName: "Jordan",
  hackathonName: "AI Innovation Hackathon 2026",
  surveyUrl: "https://forms.example.com/feedback",
  eventUrl: "https://hackathon.new/e/ai-innovation-2026",
} satisfies FeedbackSurveyEmailProps
