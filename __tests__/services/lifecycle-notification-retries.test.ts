import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"
import {
  queueFailedLifecycleNotificationDispatch,
  retryPendingLifecycleNotificationDispatches,
} from "@/lib/services/lifecycle-notification-retries"

const id = "11111111-1111-1111-1111-111111111111"
const hackathonId = "22222222-2222-2222-2222-222222222222"
const payload = {
  notificationId: id,
  hackathonId,
  hackathonName: "Build Day",
  hackathonSlug: "build-day",
  event: "hackathon_started" as const,
  recipientRoles: ["participant"],
}

describe("lifecycle notification workflow retries", () => {
  beforeEach(() => resetSupabaseMocks())

  it("stores the same workflow identity after start fails", async () => {
    const queue = createChainableMock({ data: null, error: null })
    setMockFromImplementation((table) =>
      table === "lifecycle_notification_dispatches"
        ? queue
        : createChainableMock({ data: null, error: null }),
    )

    await queueFailedLifecycleNotificationDispatch({
      id,
      hackathonId,
      kind: "transition",
      payload,
      error: new Error("workflow unavailable"),
    })

    expect(queue.insert).toHaveBeenCalledTimes(1)
    expect(queue.insert.mock.calls[0][0]).toMatchObject({
      id,
      hackathon_id: hackathonId,
      dispatch_kind: "transition",
      payload,
      fail_count: 1,
      last_error: "workflow unavailable",
    })
  })

  it("starts a due workflow once and marks it resolved", async () => {
    let queueCall = 0
    const query = createChainableMock({
      data: [{
        id,
        hackathon_id: hackathonId,
        dispatch_kind: "transition",
        payload,
        fail_count: 1,
      }],
      error: null,
    })
    const resolve = createChainableMock({ data: { id }, error: null })
    setMockFromImplementation((table) => {
      if (table === "lifecycle_notification_dispatches") {
        queueCall++
        return queueCall === 1 ? query : resolve
      }
      return createChainableMock({ data: null, error: null })
    })
    const starter = mock(() => Promise.resolve())

    const result = await retryPendingLifecycleNotificationDispatches(10, starter)

    expect(result).toEqual({
      attempted: 1,
      started: 1,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: false,
    })
    expect(starter).toHaveBeenCalledWith("transition", payload)
    expect(resolve.update).toHaveBeenCalledWith(expect.objectContaining({
      resolved_at: expect.any(String),
      last_error: null,
    }))
  })

  it("backs off a failed start without losing its retry identity", async () => {
    let queueCall = 0
    const query = createChainableMock({
      data: [{
        id,
        hackathon_id: hackathonId,
        dispatch_kind: "transition",
        payload,
        fail_count: 2,
      }],
      error: null,
    })
    const failure = createChainableMock({ data: null, error: null })
    setMockFromImplementation((table) => {
      if (table === "lifecycle_notification_dispatches") {
        queueCall++
        return queueCall === 1 ? query : failure
      }
      return createChainableMock({ data: null, error: null })
    })
    const starter = mock(() => Promise.reject(new Error("still unavailable")))

    const result = await retryPendingLifecycleNotificationDispatches(10, starter)

    expect(result).toMatchObject({ attempted: 1, started: 0, failed: 1 })
    expect(failure.update).toHaveBeenCalledWith(expect.objectContaining({
      fail_count: 3,
      last_error: "still unavailable",
      next_attempt_at: expect.any(String),
    }))
    expect(failure.eq).toHaveBeenCalledWith("id", id)
    expect(failure.eq).toHaveBeenCalledWith("fail_count", 2)
  })

  it("quarantines a malformed stored payload instead of starting it", async () => {
    let queueCall = 0
    const query = createChainableMock({
      data: [{
        id,
        hackathon_id: hackathonId,
        dispatch_kind: "transition",
        payload: { ...payload, notificationId: "wrong" },
        fail_count: 1,
      }],
      error: null,
    })
    const quarantine = createChainableMock({ data: null, error: null })
    setMockFromImplementation((table) => {
      if (table === "lifecycle_notification_dispatches") {
        queueCall++
        return queueCall === 1 ? query : quarantine
      }
      return createChainableMock({ data: null, error: null })
    })
    const starter = mock(() => Promise.resolve())

    const result = await retryPendingLifecycleNotificationDispatches(10, starter)

    expect(result).toMatchObject({ attempted: 0, failed: 1, exhausted: 1 })
    expect(starter).not.toHaveBeenCalled()
    expect(quarantine.update).toHaveBeenCalledWith(expect.objectContaining({
      fail_count: 5,
    }))
  })
})
