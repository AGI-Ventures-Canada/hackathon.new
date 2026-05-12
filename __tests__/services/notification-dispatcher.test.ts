import { describe, expect, it, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockTriggerWebhooks = mock(() => Promise.resolve())
mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}))

const mockStart = mock(() => Promise.resolve({ runId: "run-1" }))
mock.module("workflow/api", () => ({
  start: mockStart,
}))

const {
  dispatchTransitionNotifications,
  dispatchChallengesReleasedNotifications,
} = await import("@/lib/services/notification-dispatcher")

describe("Notification Dispatcher", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTriggerWebhooks.mockClear()
    mockStart.mockClear()
  })

  it("sends emails and webhooks for hackathon_started", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchTransitionNotifications({
      type: "hackathon_started",
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      trigger: "auto",
      triggeredBy: "system",
      fromStatus: "registration_open",
      toStatus: "active",
    })

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    const webhookCall = mockTriggerWebhooks.mock.calls[0]
    expect(webhookCall[0]).toBe("t1")
    expect(webhookCall[1]).toBe("hackathon.started")
  })

  it("skips email for registration_opened (no recipients)", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchTransitionNotifications({
      type: "registration_opened",
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      trigger: "manual",
      triggeredBy: "user1",
      fromStatus: "published",
      toStatus: "registration_open",
    })

    expect(mockStart).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
  })

  it("respects per-hackathon notification settings", async () => {
    const settings = {
      hackathon_id: "h1",
      email_on_registration_open: true,
      email_on_hackathon_active: false,
      email_on_judging_started: true,
      email_on_results_published: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }

    setMockFromImplementation(() =>
      createChainableMock({ data: settings, error: null })
    )

    await dispatchTransitionNotifications({
      type: "hackathon_started",
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      trigger: "auto",
      triggeredBy: "system",
      fromStatus: "registration_open",
      toStatus: "active",
    })

    expect(mockStart).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
  })

  it("fires merged email + both webhooks when challenges coincide with go-live", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchTransitionNotifications({
      type: "hackathon_started",
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      trigger: "auto",
      triggeredBy: "system",
      fromStatus: "registration_open",
      toStatus: "active",
      challenges: [
        { title: "Build It", description: "Make something cool" },
      ],
    })

    expect(mockStart).toHaveBeenCalledTimes(1)
    const workflowInput = (mockStart.mock.calls[0] as unknown as [unknown, unknown[]])[1][0] as {
      challenges?: unknown[]
    }
    expect(workflowInput.challenges).toBeDefined()
    expect(workflowInput.challenges).toHaveLength(1)

    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(2)
    const events = mockTriggerWebhooks.mock.calls.map((c) => c[1])
    expect(events).toContain("hackathon.started")
    expect(events).toContain("hackathon.challenges_released")
  })

  it("dispatches standalone challenges_released email + webhook", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchChallengesReleasedNotifications({
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      challenges: [
        { title: "Build It", description: "Make something cool" },
      ],
      trigger: "scheduled",
    })

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    expect(mockTriggerWebhooks.mock.calls[0][1]).toBe(
      "hackathon.challenges_released"
    )
  })

  it("skips challenges_released dispatch when no challenges", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchChallengesReleasedNotifications({
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      challenges: [],
      trigger: "scheduled",
    })

    expect(mockStart).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("respects email_on_challenges_released setting (webhook still fires)", async () => {
    const settings = {
      hackathon_id: "h1",
      email_on_registration_open: true,
      email_on_hackathon_active: true,
      email_on_judging_started: true,
      email_on_results_published: true,
      email_on_challenges_released: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    setMockFromImplementation(() =>
      createChainableMock({ data: settings, error: null })
    )

    await dispatchChallengesReleasedNotifications({
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      challenges: [
        { title: "Build It", description: null },
      ],
      trigger: "manual",
    })

    expect(mockStart).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
  })

  it("fires webhook for judging_started with correct event", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "No rows" } })
    )

    await dispatchTransitionNotifications({
      type: "judging_started",
      hackathonId: "h1",
      tenantId: "t1",
      hackathon: { name: "Test Hack", slug: "test-hack" },
      trigger: "manual",
      triggeredBy: "user1",
      fromStatus: "active",
      toStatus: "judging",
    })

    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    expect(mockTriggerWebhooks.mock.calls[0][1]).toBe("hackathon.judging_started")
  })
})
