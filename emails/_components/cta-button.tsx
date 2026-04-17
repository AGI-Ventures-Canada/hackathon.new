import { Button, Section } from "@react-email/components"
import { colors } from "./constants"

interface CTAButtonProps {
  href: string
  children: React.ReactNode
  variant?: "primary" | "secondary"
}

export function CTAButton({
  href,
  children,
  variant = "primary",
}: CTAButtonProps) {
  const isPrimary = variant === "primary"

  return (
    <Section style={{ textAlign: "center" as const }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          background: isPrimary ? colors.accent : colors.accentLight,
          color: isPrimary ? colors.white : colors.accent,
          padding: "14px 28px",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "14px",
          borderRadius: "6px",
          ...(isPrimary ? {} : { border: `1px solid ${colors.border}` }),
        }}
      >
        {children}
      </Button>
    </Section>
  )
}
