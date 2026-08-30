import Link from "next/link"
import { AlertTriangle, MailWarning } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { EventLifecycleAlert } from "@/lib/utils/event-lifecycle-alerts"
import type { UnsentInvitationEmailCounts } from "@/lib/services/invitation-email-health"

export function EventHealthAlerts({
  slug,
  alerts,
  invitationEmailCounts,
  failedReminderCount,
  queuedUntilPublish,
}: {
  slug: string
  alerts: EventLifecycleAlert[]
  invitationEmailCounts: UnsentInvitationEmailCounts
  failedReminderCount: number
  queuedUntilPublish: boolean
}) {
  if (
    alerts.length === 0 &&
    invitationEmailCounts.total === 0 &&
    failedReminderCount === 0
  ) return null

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

      {([
        {
          key: "teams",
          count: invitationEmailCounts.teams,
          name: "team invite",
          href: `/e/${slug}/manage?tab=teams`,
        },
        {
          key: "judges",
          count: invitationEmailCounts.judges,
          name: "judge invite",
          href: `/e/${slug}/manage?tab=judging&jtab=judges`,
        },
      ] as const).map((invite) => invite.count > 0 && (
        <Alert key={invite.key}>
          <MailWarning className="size-4" />
          <AlertTitle>
            {queuedUntilPublish
              ? `${invite.count} ${invite.name} email${invite.count === 1 ? " is" : "s are"} saved`
              : `${invite.count} ${invite.name} email${invite.count === 1 ? "" : "s"} still need to send`}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {queuedUntilPublish
                ? "It’ll send when you publish. Draft events don’t send invite emails."
                : "We’ll keep trying. Open the invite list to send it again now."}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={invite.href}>Review emails</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ))}

      {failedReminderCount > 0 && (
        <Alert variant="destructive">
          <MailWarning className="size-4" />
          <AlertTitle>
            {failedReminderCount} delivery issue{failedReminderCount === 1 ? " needs" : "s need"} help
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Some emails or event updates stopped retrying. Review the email setup.</span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/e/${slug}/manage?tab=event&etab=email`}>Review email</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
