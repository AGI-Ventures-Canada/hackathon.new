import { AlertCircle, Bell, Clock, MailCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  getInvitationDeliveryState,
  getQueueReasonText,
  type NotificationDeliveryState,
  type QueueReasonCode,
} from "@/lib/utils/notification-delivery"

export function QueuedEmailNotice({ count }: { count: number }) {
  if (count <= 0) return null
  const copy = getQueueReasonText("event_draft")
  return (
    <Alert>
      <Clock className="size-4" />
      <AlertTitle>
        {count} email{count === 1 ? " is" : "s are"} queued
      </AlertTitle>
      <AlertDescription>
        {copy.reason} {copy.release}
      </AlertDescription>
    </Alert>
  )
}

export function InvitationDeliveryBadge({
  emailedAt,
  remindedAt,
  hackathonStatus,
  notificationDisposition,
  state: explicitState,
}: {
  emailedAt: string | null
  remindedAt: string | null
  hackathonStatus: string | null
  notificationDisposition?: "queue" | "send" | "reject"
  state?: NotificationDeliveryState
}) {
  const state = explicitState ?? getInvitationDeliveryState({
    emailedAt,
    hackathonStatus,
    notificationDisposition,
  })

  if (state === "queued") {
    const copy = getQueueReasonText("event_draft")
    return (
      <Badge variant="outline" title={`${copy.reason} ${copy.release}`}>
        <Clock className="mr-1 size-3" />
        Queued
      </Badge>
    )
  }

  if (state === "not_sent") {
    const title = notificationDisposition === "reject"
      ? "The email wasn't sent because this event has ended."
      : "The email wasn't sent. Send it again."
    return (
      <Badge variant="destructive" title={title}>
        <AlertCircle className="mr-1 size-3" />
        Not sent
      </Badge>
    )
  }

  if (remindedAt) {
    return (
      <Badge variant="secondary">
        <Bell className="mr-1 size-3" />
        Reminded
      </Badge>
    )
  }

  return (
    <Badge variant="secondary">
      <MailCheck className="mr-1 size-3" />
      Sent
    </Badge>
  )
}

export function QueuedDeliveryMessage({ reason }: { reason: QueueReasonCode }) {
  const copy = getQueueReasonText(reason)
  return <>{copy.reason} {copy.release}</>
}
