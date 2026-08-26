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
    <Section style={{ textAlign: "left" as const }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: isPrimary ? colors.accentDark : colors.accentLight,
          color: isPrimary ? colors.white : colors.accentDark,
          padding: "14px 22px",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "14px",
          lineHeight: "1.2",
          borderRadius: "10px",
          border: `1px solid ${isPrimary ? colors.accentDark : colors.border}`,
        }}
      >
        {children}
      </Button>
    </Section>
  )
}
