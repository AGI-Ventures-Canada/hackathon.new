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
import { brandUrl, colors, fontFamily, fontSize, spacing, supportEmail } from "./constants"

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
          lineHeight: "1.6",
          color: colors.textPrimary,
          width: "100%",
          margin: "0",
          padding: "32px 12px",
          backgroundColor: colors.pageBg,
        }}
      >
        <Container style={{ width: "100%", maxWidth: "600px", margin: "0 auto" }}>
          <Section
            style={{
              backgroundColor: colors.headerBg,
              padding: `${spacing.lg} ${spacing.xl}`,
              borderRadius: "14px 14px 0 0",
            }}
          >
            <Link
              href={brandUrl}
              style={{
                color: colors.headerText,
                display: "inline-block",
                fontSize: fontSize.lg,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: "1.2",
                textDecoration: "none",
              }}
            >
              hackathon.new
            </Link>
          </Section>

          <Section
            style={{
              backgroundColor: colors.bodyBg,
              padding: `${spacing.xxl} ${spacing.xl}`,
              border: `1px solid ${colors.border}`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
            }}
          >
            <Heading
              style={{
                color: colors.textPrimary,
                margin: `0 0 ${spacing.lg} 0`,
                fontSize: fontSize.xl,
                fontWeight: 700,
                lineHeight: "1.12",
                letterSpacing: "-0.04em",
              }}
            >
              {heading}
            </Heading>

            {children}

            <Hr
              style={{
                border: "none",
                borderTop: `1px solid ${colors.divider}`,
                margin: `${spacing.xl} 0 ${spacing.lg} 0`,
              }}
            />

            {eventUrl && (
              <Text
                style={{
                  fontSize: fontSize.sm,
                  margin: `0 0 ${spacing.md} 0`,
                  lineHeight: "1.5",
                }}
              >
                <Link
                  href={eventUrl}
                  style={{
                    color: colors.textPrimary,
                    fontWeight: 600,
                    textDecoration: "underline",
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
                margin: "0",
                lineHeight: "1.5",
              }}
            >
              {footerText}
            </Text>
          </Section>

          <Section
            style={{
              textAlign: "left" as const,
              padding: `${spacing.md} ${spacing.sm}`,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.xs,
                color: colors.textFooter,
                margin: "0",
                lineHeight: "1.5",
              }}
            >
              Sent by{" "}
              <Link
                href={brandUrl}
                style={{
                  color: colors.textFooter,
                }}
              >
                hackathon.new
              </Link>
              . Questions?{" "}
              <Link
                href={`mailto:${supportEmail}`}
                style={{
                  color: colors.textFooter,
                  textDecoration: "none",
                }}
              >
                {supportEmail}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
