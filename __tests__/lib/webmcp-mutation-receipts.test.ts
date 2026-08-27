import { beforeEach, describe, expect, it } from "bun:test"
import {
  clearMutationReceipt,
  createMutationFingerprint,
  readMutationReceipt,
  saveCommittedMutationReceipt,
  savePendingMutationReceipt,
} from "@/lib/webmcp/mutation-receipts"

describe("WebMCP mutation receipts", () => {
  beforeEach(() => sessionStorage.clear())

  it("reuses a pending request id and remembers its committed result", () => {
    const fingerprint = createMutationFingerprint({
      method: "POST",
      url: "/api/dashboard/hackathons/event/schedule",
      body: { title: "Lunch", startsAt: "2026-09-08T19:00:00.000Z" },
    })
    const mutationId = "8e64ee8e-2a97-4d9d-846e-c99746307421"

    savePendingMutationReceipt(fingerprint, mutationId)
    expect(readMutationReceipt(fingerprint)).toMatchObject({
      state: "pending",
      mutationId,
    })

    saveCommittedMutationReceipt(fingerprint, mutationId, { id: mutationId })
    expect(readMutationReceipt(fingerprint)).toMatchObject({
      state: "committed",
      mutationId,
      result: { id: mutationId },
    })

    clearMutationReceipt(fingerprint)
    expect(readMutationReceipt(fingerprint)).toBeNull()
  })
})
