import { describe, expect, it } from "bun:test"
import {
  getInvitationDeliveryState,
  getQueueReason,
  getQueueReasonText,
} from "@/lib/utils/notification-delivery"

describe("invitation delivery status", () => {
  it("returns a machine-readable reason whenever delivery is queued", () => {
    expect(getQueueReason("queued")).toBe("event_draft")
    expect(getQueueReason("sent")).toBeUndefined()
    expect(getQueueReason("failed")).toBeUndefined()
  })

  it("derives queued, sent, and not-sent states from stored delivery facts", () => {
    expect(getInvitationDeliveryState({ emailedAt: null, hackathonStatus: "draft" })).toBe("queued")
    expect(getInvitationDeliveryState({ emailedAt: "2026-08-27T12:00:00.000Z", hackathonStatus: "draft" })).toBe("sent")
    expect(getInvitationDeliveryState({ emailedAt: null, hackathonStatus: "registration_open" })).toBe("not_sent")
    expect(getInvitationDeliveryState({
      emailedAt: null,
      hackathonStatus: "draft",
      notificationDisposition: "reject",
    })).toBe("not_sent")
  })

  it("keeps the queued reason and release condition in one shared copy source", () => {
    expect(getQueueReasonText("event_draft")).toEqual({
      reason: "This event is still a draft.",
      release: "We'll send it when you go live.",
    })
  })
})
