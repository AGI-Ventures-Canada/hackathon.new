import { Section, Text } from "@react-email/components"
import type { ChallengeSummary } from "@/lib/db/hackathon-types"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { ChallengeList } from "./_components/challenge-list"
import { fontSize, spacing } from "./_components/constants"

interface ChallengesReleasedEmailProps {
  hackathonName: string
  eventUrl: string
  challenges: ChallengeSummary[]
}

export default function ChallengesReleasedEmail({
  hackathonName,
  eventUrl,
  challenges,
}: ChallengesReleasedEmailProps) {
  return (
    <OatmealLayout
      heading="Challenges Are Out"
      preview={`The challenges for ${hackathonName} are live.`}
      footerText={`You got this because you’re registered for ${hackathonName}.`}
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
        The challenges for <strong>{hackathonName}</strong> are now out. Pick one and start building.
      </Text>

      <Section style={{ marginBottom: spacing.lg }}>
        <ChallengeList challenges={challenges} />
      </Section>

      <CTAButton href={eventUrl}>View Challenges</CTAButton>
    </OatmealLayout>
  )
}

ChallengesReleasedEmail.PreviewProps = {
  hackathonName: "AI Innovation Hackathon 2026",
  eventUrl: "https://getoatmeal.com/e/ai-innovation-2026",
  challenges: [
    {
      title: "Build a Smarter Inbox",
      description: "Cut through email noise with an AI assistant that prioritizes what matters.",
    },
    {
      title: "Real-time Translation",
      description: "Live captions and translation for any video call participant.",
    },
  ],
} satisfies ChallengesReleasedEmailProps
