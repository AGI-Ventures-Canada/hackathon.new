import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockStart = mock(() => Promise.resolve({ runId: "run_1" }))
mock.module("workflow/api", () => ({ start: mockStart }))

const creationFinalization = await import("@/lib/workflows/creation-finalization")
const input = {
  tenantId: "tenant_1",
  principal: {
    kind: "user" as const,
    tenantId: "tenant_1",
    userId: "user_1",
    orgId: "org_1",
    orgRole: "org:admin",
    scopes: ["hackathons:write" as const],
  },
  hackathon: { id: "hack_1" },
  auditMetadata: {},
  webhookData: {},
} as Parameters<typeof creationFinalization.startHackathonCreationFinalizationWorkflow>[0]

describe("startHackathonCreationFinalizationWorkflow", () => {
  beforeEach(() => {
    mockStart.mockClear()
    mockStart.mockResolvedValue({ runId: "run_1" })
  })

  it("starts the workflow exported beside it with one durable input", async () => {
    await expect(creationFinalization.startHackathonCreationFinalizationWorkflow(input))
      .resolves.toBe("run_1")
    expect(mockStart).toHaveBeenCalledWith(
      creationFinalization.hackathonCreationFinalizationWorkflow,
      [input]
    )
  })

  it("returns null and logs when workflow startup rejects", async () => {
    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    mockStart.mockRejectedValue(new Error("workflow unavailable"))
    try {
      await expect(creationFinalization.startHackathonCreationFinalizationWorkflow(input))
        .resolves.toBeNull()
      expect(error).toHaveBeenCalledWith(
        "Failed to start event creation finalization workflow:",
        expect.any(Error)
      )
    } finally {
      console.error = originalError
    }
  })
})
