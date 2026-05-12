import { Section, Text } from "@react-email/components"
import type { ChallengeSummary } from "@/lib/db/hackathon-types"
import { colors, fontSize, spacing } from "./constants"
import { truncate } from "./format-utils"

interface ChallengeListProps {
  challenges: ChallengeSummary[]
}

export function ChallengeList({ challenges }: ChallengeListProps) {
  return (
    <>
      {challenges.map((c, idx) => (
        <Section
          key={idx}
          style={{
            borderLeft: `3px solid ${colors.accent}`,
            paddingLeft: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: fontSize.base,
              fontWeight: 600,
              margin: 0,
              marginBottom: "4px",
              color: colors.textPrimary,
            }}
          >
            {c.title}
          </Text>
          {c.description && (
            <Text
              style={{
                fontSize: fontSize.sm,
                color: colors.textSecondary,
                margin: 0,
                lineHeight: "1.5",
              }}
            >
              {truncate(c.description)}
            </Text>
          )}
        </Section>
      ))}
    </>
  )
}
