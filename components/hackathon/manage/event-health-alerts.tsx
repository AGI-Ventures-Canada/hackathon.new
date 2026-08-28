import Link from "next/link"
import { AlertTriangle, MailWarning } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { EventLifecycleAlert } from "@/lib/utils/event-lifecycle-alerts"

export function EventHealthAlerts({
  slug,
  alerts,
  unsentInvitationEmailCount,
  queuedUntilPublish,
}: {
  slug: string
  alerts: EventLifecycleAlert[]
  unsentInvitationEmailCount: number
  queuedUntilPublish: boolean
}) {
  if (alerts.length === 0 && unsentInvitationEmailCount === 0) return null

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Alert key={alert.code} variant={alert.severity === "error" ? "destructive" : "default"}>
          <AlertTriangle className="size-4" />
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{alert.message}</span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/e/${slug}/manage?tab=${alert.action === "update_dates" || alert.action === "update_location" ? "edit" : "action-items"}`}>
                {alert.action === "update_dates" ? "Review dates" : alert.action === "update_location" ? "Review signup" : "Take action"}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ))}

      {unsentInvitationEmailCount > 0 && (
        <Alert>
          <MailWarning className="size-4" />
          <AlertTitle>
            {queuedUntilPublish
              ? `${unsentInvitationEmailCount} invite email${unsentInvitationEmailCount === 1 ? " is" : "s are"} saved`
              : `${unsentInvitationEmailCount} invite email${unsentInvitationEmailCount === 1 ? "" : "s"} still need to send`}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {queuedUntilPublish
                ? "They’ll send when you publish. Draft events don’t send invite emails."
                : "We’ll keep retrying. Open Teams or Judging to send them again now."}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/e/${slug}/manage?tab=teams`}>Review emails</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
