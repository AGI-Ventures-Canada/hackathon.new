import { Section, Text } from "@react-email/components"
import { colors, fontSize, spacing } from "./constants"

interface InfoBoxProps {
  label: string
  children: React.ReactNode
}

export function InfoBox({ label, children }: InfoBoxProps) {
  return (
    <Section
      style={{
        background: colors.infoBoxBg,
        padding: `${spacing.md} ${spacing.lg}`,
        marginBottom: spacing.lg,
        borderRadius: "8px",
        borderLeft: `3px solid ${colors.accent}`,
      }}
    >
      <Text
        style={{
          margin: "0 0 4px 0",
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          fontWeight: 600,
        }}
      >
        {label}
      </Text>
      {children}
    </Section>
  )
}
