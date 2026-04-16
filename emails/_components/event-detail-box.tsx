import { Section, Text } from "@react-email/components"
import { colors, fontSize, spacing } from "./constants"

interface EventDetailBoxProps {
  hackathonName: string
  startsAt?: string | null
  endsAt?: string | null
  location?: string | null
}

export function formatDateRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined
): string | null {
  if (!startsAt) return null

  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })

  if (!end) return formatDate(start)

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth()

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} \u2013 ${end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}, ${end.getUTCFullYear()}`
  }

  if (sameYear) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} \u2013 ${formatDate(end)}`
  }

  return `${formatDate(start)} \u2013 ${formatDate(end)}`
}

export function EventDetailBox({
  hackathonName,
  startsAt,
  endsAt,
  location,
}: EventDetailBoxProps) {
  const dateRange = formatDateRange(startsAt, endsAt)

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
          margin: "0",
          fontSize: "16px",
          fontWeight: 600,
          color: colors.textPrimary,
        }}
      >
        {hackathonName}
      </Text>
      {dateRange && (
        <Text
          style={{
            margin: "4px 0 0 0",
            fontSize: fontSize.sm,
            color: colors.textSecondary,
          }}
        >
          {dateRange}
        </Text>
      )}
      {location && (
        <Text
          style={{
            margin: "2px 0 0 0",
            fontSize: fontSize.sm,
            color: colors.textMuted,
          }}
        >
          {location}
        </Text>
      )}
    </Section>
  )
}
