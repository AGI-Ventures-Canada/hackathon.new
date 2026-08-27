import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { InfoBox } from "./_components/info-box"
import { fontSize, spacing, monoFontFamily } from "./_components/constants"

interface AgentNotificationEmailProps {
  agentName: string
  runId: string
  type: "started" | "completed" | "failed"
  output?: string
  error?: string
}

const typeLabels: Record<string, string> = {
  started: "Started",
  completed: "Completed",
  failed: "Failed",
}

export default function AgentNotificationEmail({
  agentName,
  runId,
  type,
  output,
  error,
}: AgentNotificationEmailProps) {
  return (
    <OatmealLayout
      heading="Agent Run Notification"
      preview={`Agent "${agentName}" ${typeLabels[type].toLowerCase()}`}
      footerText="This is an automated notification from your hackathon.new agent."
    >
      <InfoBox label="Agent">
        <Text style={{ margin: "0", fontSize: fontSize.lg, fontWeight: 600 }}>
          {agentName}
        </Text>
      </InfoBox>

      <Text
        style={{
          fontSize: fontSize.base,
          marginBottom: spacing.lg,
          lineHeight: "1.6",
        }}
      >
        <strong>Run ID:</strong> {runId}
        <br />
        <strong>Status:</strong> {typeLabels[type]}
      </Text>

      {type === "completed" && output && (
        <InfoBox label="Output">
          <pre
            style={{
              margin: "0",
              fontSize: "12px",
              fontFamily: monoFontFamily,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word" as const,
            }}
          >
            {output}
          </pre>
        </InfoBox>
      )}

      {type === "failed" && error && (
        <InfoBox label="Error">
          <pre
            style={{
              margin: "0",
              fontSize: "12px",
              fontFamily: monoFontFamily,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word" as const,
            }}
          >
            {error}
          </pre>
        </InfoBox>
      )}
    </OatmealLayout>
  )
}

AgentNotificationEmail.PreviewProps = {
  agentName: "Receipt Parser",
  runId: "run_abc123def456",
  type: "completed",
  output:
    "Successfully parsed 3 receipts from inbox.\nTotal: $247.83\nCategories: Office Supplies, Software, Travel",
} satisfies AgentNotificationEmailProps
