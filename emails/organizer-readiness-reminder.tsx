import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"
import { InfoBox } from "./_components/info-box"
import { fontSize, spacing } from "./_components/constants"

type OrganizerReadinessReminderEmailProps = {
  hackathonName: string
  heading: string
  body: string
  deadlineLabel: string
  deadlineDate: string
  taskLabels: string[]
  ctaUrl: string
}

export default function OrganizerReadinessReminderEmail({
  hackathonName,
  heading,
  body,
  deadlineLabel,
  deadlineDate,
  taskLabels,
  ctaUrl,
}: OrganizerReadinessReminderEmailProps) {
  return (
    <OatmealLayout
      heading={heading}
      preview={`${heading} — ${hackathonName}`}
      footerText={`You're receiving this because you help organize ${hackathonName}. Reply to stop these reminders.`}
    >
      <Text style={{ fontSize: fontSize.base, lineHeight: "1.6", marginBottom: spacing.lg }}>
        {body}
      </Text>
      <InfoBox label={deadlineLabel}>
        <Text style={{ margin: "0", fontSize: fontSize.base, fontWeight: 600 }}>
          {deadlineDate}
        </Text>
      </InfoBox>
      {taskLabels.length > 0 ? (
        <>
          <Text style={{ fontSize: fontSize.base, fontWeight: 600, marginBottom: spacing.sm }}>
            Check these next:
          </Text>
          {taskLabels.map((label) => (
            <Text key={label} style={{ fontSize: fontSize.base, margin: `0 0 ${spacing.sm}` }}>
              • {label}
            </Text>
          ))}
        </>
      ) : (
        <Text style={{ fontSize: fontSize.base, marginBottom: spacing.lg }}>
          Your task list is clear. Give the event one last look.
        </Text>
      )}
      <CTAButton href={ctaUrl}>Open task list</CTAButton>
    </OatmealLayout>
  )
}

OrganizerReadinessReminderEmail.PreviewProps = {
  hackathonName: "AI Builders Day",
  heading: "Your event starts soon",
  body: "A few things still need your attention before people arrive.",
  deadlineLabel: "Event starts",
  deadlineDate: "Friday, September 11, 2026 at 9:00 AM",
  taskLabels: ["Invite judges", "Assign every project", "Check the event schedule"],
  ctaUrl: "https://hackathon.new/e/ai-builders-day/manage?tab=action-items",
} satisfies OrganizerReadinessReminderEmailProps
