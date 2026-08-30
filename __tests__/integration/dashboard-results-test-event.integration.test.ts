import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockResolvePrincipal = mock(() => Promise.resolve({
  kind: "user" as const,
  tenantId: "tenant-1",
  userId: "user-1",
  orgId: "org-1",
  orgRole: "org:admin",
  scopes: ["hackathons:write"],
}))

mock.module("@/lib/auth/principal", () => ({
  resolvePrincipal: mockResolvePrincipal,
  requirePrincipal: () => undefined,
}))

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({
  status: "ok" as const,
  hackathon: { is_test_event: true, results_published_at: null },
}))
mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockPublishResults = mock(() => Promise.resolve({ success: true as const }))
mock.module("@/lib/services/results", () => ({
  publishResults: mockPublishResults,
}))

const mockLogAudit = mock(() => Promise.resolve(null))
mock.module("@/lib/services/audit", () => ({ logAudit: mockLogAudit }))

const mockTriggerWebhooks = mock(() => Promise.resolve())
mock.module("@/lib/services/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }))

const { Elysia } = await import("elysia")
const { dashboardResultsRoutes } = await import("@/lib/api/routes/dashboard-results")

const app = new Elysia({ prefix: "/api/dashboard" }).use(dashboardResultsRoutes)

describe("test event results routes", () => {
  beforeEach(() => {
    mockCheckHackathonOrganizer.mockClear()
    mockPublishResults.mockClear()
    mockLogAudit.mockClear()
    mockTriggerWebhooks.mockClear()
  })

  it("publishes test results without sending a production webhook", async () => {
    const response = await app.handle(new Request(
      "http://localhost/api/dashboard/hackathons/11111111-1111-4111-8111-111111111111/results/publish",
      { method: "POST" },
    ))

    expect(response.status).toBe(200)
    expect(mockPublishResults).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "tenant-1",
    )
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })
})
