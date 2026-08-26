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
        backgroundColor: colors.infoBoxBg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        borderRadius: "12px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <Text
        style={{
          margin: "0 0 4px 0",
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          fontWeight: 600,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </Text>
      {children}
    </Section>
  )
}
