import { listFulfillments, getFulfillmentSummary } from "@/lib/services/prize-fulfillment"
import { listReminders } from "@/lib/services/post-event-reminders"
import { listExportsForHackathon } from "@/lib/services/submission-exports"
import { PrizeFulfillmentTracker } from "@/components/hackathon/prizes/prize-fulfillment-tracker"
import { PostEventPanel } from "@/components/hackathon/post-event-panel"
import { PostEventExports } from "@/components/hackathon/post-event-exports"
import { PostEventSubTabs } from "./_post-event-sub-tabs"

export type PostEventTabContentProps = {
  hackathonId: string
  resultsPublishedAt: string | null
  feedbackSurveySentAt: string | null
  feedbackSurveyUrl: string | null
  hackathonStatus: string
  activePtab: string
}

export async function PostEventTabContent({
  hackathonId,
  resultsPublishedAt,
  feedbackSurveySentAt,
  feedbackSurveyUrl,
  hackathonStatus,
  activePtab,
}: PostEventTabContentProps) {
  const [fulfillments, fulfillmentSummary, reminders, exports] = await Promise.all([
    listFulfillments(hackathonId),
    getFulfillmentSummary(hackathonId),
    listReminders(hackathonId),
    listExportsForHackathon(hackathonId),
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
      {hackathonStatus === "completed" ? (
        <PostEventExports
          hackathonId={hackathonId}
          initialExports={exports.map((e) => ({
            id: e.id,
            status: e.status as "pending" | "processing" | "ready" | "failed",
            submissionCount: e.submission_count,
            fileSizeBytes: e.file_size_bytes,
            createdAt: e.created_at,
            readyAt: e.ready_at,
            expiresAt: e.expires_at,
            errorMessage: e.error_message,
          }))}
        />
      ) : (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Exports unlock once the hackathon is marked complete.
        </div>
      )}
    </PostEventSubTabs>
  )
}
