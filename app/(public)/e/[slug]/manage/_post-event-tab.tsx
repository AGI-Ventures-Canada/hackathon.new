import { listFulfillments, getFulfillmentSummary } from "@/lib/services/prize-fulfillment"
import { listReminders } from "@/lib/services/post-event-reminders"
import { PrizeFulfillmentTracker } from "@/components/hackathon/prizes/prize-fulfillment-tracker"
import { PostEventPanel } from "@/components/hackathon/post-event-panel"
import { PostEventSubTabs } from "./_post-event-sub-tabs"

export type PostEventTabContentProps = {
  hackathonId: string
  resultsPublishedAt: string | null
  feedbackSurveySentAt: string | null
  feedbackSurveyUrl: string | null
  activePtab: string
}

export async function PostEventTabContent({
  hackathonId,
  resultsPublishedAt,
  feedbackSurveySentAt,
  feedbackSurveyUrl,
  activePtab,
}: PostEventTabContentProps) {
  const [fulfillments, fulfillmentSummary, reminders] = await Promise.all([
    listFulfillments(hackathonId),
    getFulfillmentSummary(hackathonId),
    listReminders(hackathonId),
  ])

  return (
    <PostEventSubTabs activePtab={activePtab}>
      <PrizeFulfillmentTracker
        hackathonId={hackathonId}
        resultsPublishedAt={resultsPublishedAt}
        initialFulfillments={fulfillments.map((f) => ({
          id: f.id,
          prizeAssignmentId: f.prize_assignment_id,
          prizeName: f.prizeName,
          prizeValue: f.prizeValue,
          prizeKind: f.prizeKind,
          submissionTitle: f.submissionTitle,
          teamName: f.teamName,
          status: f.status,
          recipientEmail: f.recipient_email,
          recipientName: f.recipient_name,
          shippingAddress: f.shipping_address,
          trackingNumber: f.tracking_number,
          paymentMethod: f.payment_method,
          paymentDetail: f.payment_detail,
          notes: f.notes,
          contactedAt: f.contacted_at,
          shippedAt: f.shipped_at,
          claimedAt: f.claimed_at,
          createdAt: f.created_at,
        }))}
        initialSummary={fulfillmentSummary}
      />
      <PostEventPanel
        hackathonId={hackathonId}
        feedbackSurveySentAt={feedbackSurveySentAt}
        feedbackSurveyUrl={feedbackSurveyUrl}
        initialReminders={reminders.map((r) => ({
          id: r.id,
          type: r.type,
          scheduledFor: r.scheduled_for,
          sentAt: r.sent_at,
          cancelledAt: r.cancelled_at,
          recipientFilter: r.recipient_filter,
          createdAt: r.created_at,
        }))}
      />
    </PostEventSubTabs>
  )
}
