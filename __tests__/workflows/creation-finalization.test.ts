import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { FatalError, RetryableError } from "workflow"
import { requireHackathonCreationFinalizationComplete } from "@/lib/workflows/creation-finalization/result"

const mockFinalizeCreation = mock(() => Promise.resolve({ status: "complete" as const }))

mock.module("@/lib/services/luma-import-create", () => ({
  finalizeHackathonCreation: mockFinalizeCreation,
}))

const { runHackathonCreationFinalization } = await import(
  "@/lib/workflows/creation-finalization/steps"
)
const { hackathonCreationFinalizationWorkflow } = await import(
  "@/lib/workflows/creation-finalization/workflow"
)

beforeEach(() => {
  mockFinalizeCreation.mockClear()
  mockFinalizeCreation.mockResolvedValue({ status: "complete" })
})

afterEach(() => {
  mock.restore()
})

describe("creation finalization workflow", () => {
  it("accepts a completed finalization", () => {
    expect(() => requireHackathonCreationFinalizationComplete({
      status: "complete",
    })).not.toThrow()
  })

  it("retries incomplete finalization", () => {
    for (const status of ["failed", "in_progress"] as const) {
      expect(() => requireHackathonCreationFinalizationComplete({ status }))
        .toThrow(RetryableError)
    }
  })

  it("stops retrying when finalization inputs conflict", () => {
    expect(() => requireHackathonCreationFinalizationComplete({
      status: "invalid",
      error: {
        code: "draft_conflict",
        message: "Open the event that was already created.",
      },
    })).toThrow(FatalError)
  })

  it("delegates required effects to the marker-coordinated finalizer once", async () => {
    const input = {
      tenantId: "tenant-1",
      principal: {
        kind: "user" as const,
        tenantId: "tenant-1",
        userId: "user-1",
        orgId: "org-1",
        orgRole: "org:admin",
        scopes: ["hackathons:write" as const],
      },
      hackathon: { id: "event-1" },
      auditMetadata: {},
      webhookData: {},
    } as Parameters<typeof hackathonCreationFinalizationWorkflow>[0]

    await expect(hackathonCreationFinalizationWorkflow(input)).resolves.toEqual({
      status: "complete",
    })

    expect(mockFinalizeCreation).toHaveBeenCalledTimes(1)
    expect(mockFinalizeCreation).toHaveBeenCalledWith(input)
    expect(runHackathonCreationFinalization.maxRetries).toBe(12)
  })
})
