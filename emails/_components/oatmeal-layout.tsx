import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Hr,
  Text,
  Link,
} from "@react-email/components"
import { colors, fontFamily, fontSize, spacing } from "./constants"

interface OatmealLayoutProps {
  heading: string
  preview?: string
  children: React.ReactNode
  footerText?: string
  eventUrl?: string
  hackathonName?: string
}

export function OatmealLayout({
  heading,
  preview,
  children,
  footerText = "If you didn\u2019t expect this, you can safely ignore this email.",
  eventUrl,
  hackathonName,
}: OatmealLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body
        style={{
          fontFamily,
          lineHeight: "1.7",
          color: colors.textPrimary,
          maxWidth: "560px",
          margin: "0 auto",
          padding: "20px",
          backgroundColor: colors.pageBg,
        }}
      >
        <Container>
          <Section style={{ borderTop: `3px solid ${colors.accent}` }}>
            <Section
              style={{
                background: colors.headerBg,
                padding: `${spacing.xl} ${spacing.xxl} ${spacing.lg}`,
              }}
            >
              <Heading
                style={{
                  color: colors.textPrimary,
                  margin: "0",
                  fontSize: fontSize.xl,
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                }}
              >
                {heading}
              </Heading>
            </Section>

            <Hr
              style={{
                border: "none",
                borderTop: `1px solid ${colors.divider}`,
                margin: "0",
              }}
            />

            <Section
              style={{
                background: colors.bodyBg,
                padding: `${spacing.xl} ${spacing.xxl}`,
                border: `1px solid ${colors.border}`,
                borderTop: "none",
              }}
            >
              {children}

              <Hr
                style={{
                  border: "none",
                  borderTop: `1px solid ${colors.divider}`,
                  margin: `${spacing.lg} 0`,
                }}
              />

              {eventUrl && (
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textMuted,
                    margin: `0 0 ${spacing.md} 0`,
                    lineHeight: "1.5",
                  }}
                >
                  <Link
                    href={eventUrl}
                    style={{
                      color: colors.accent,
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    {hackathonName
                      ? `View ${hackathonName} \u2192`
                      : "View event page \u2192"}
                  </Link>
                </Text>
              )}

              <Text
                style={{
                  fontSize: fontSize.xs,
                  color: colors.textFooter,
                  margin: `0 0 ${spacing.sm} 0`,
                  lineHeight: "1.5",
                }}
              >
                {footerText}
              </Text>
            </Section>
          </Section>

          <Section
            style={{
              textAlign: "center" as const,
              padding: `${spacing.md} 0`,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.sm,
                color: colors.textSecondary,
                fontWeight: 600,
                margin: `0 0 ${spacing.sm} 0`,
              }}
            >
              <Link
                href="https://getoatmeal.com"
                style={{
                  color: colors.textSecondary,
                  textDecoration: "none",
                }}
              >
                Oatmeal
              </Link>
            </Text>
            <Text
              style={{
                fontSize: fontSize.xs,
                color: colors.textFooter,
                margin: "0",
              }}
            >
              Questions?{" "}
              <Link
                href="mailto:support@getoatmeal.com"
                style={{
                  color: colors.textFooter,
                  textDecoration: "underline",
                }}
              >
                support@getoatmeal.com
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
