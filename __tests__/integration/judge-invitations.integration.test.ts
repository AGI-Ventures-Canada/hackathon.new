import { describe, expect, it, mock, beforeEach } from "bun:test"
import { createIntegrationChainableMock } from "../lib/integration-mock"

const mockAuth = mock(() => Promise.resolve({ userId: null }))
const mockClerkClient = mock(() =>
  Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const mockAddJudge = mock(() =>
  Promise.resolve({ success: true, participant: { id: "j1", clerkUserId: "user_123" } })
)

mock.module("@/lib/services/judging", () => ({
  addJudge: mockAddJudge,
  listJudgingCriteria: mock(() => Promise.resolve([])),
  createJudgingCriteria: mock(() => Promise.resolve(null)),
  updateJudgingCriteria: mock(() => Promise.resolve(null)),
  deleteJudgingCriteria: mock(() => Promise.resolve(false)),
  listJudges: mock(() => Promise.resolve([])),
  removeJudge: mock(() => Promise.resolve({ success: false })),
  listJudgeAssignments: mock(() => Promise.resolve([])),
  assignJudgeToSubmission: mock(() => Promise.resolve({ success: false, error: "", code: "" })),
  removeJudgeAssignment: mock(() => Promise.resolve(false)),
  autoAssignJudges: mock(() => Promise.resolve({ assignedCount: 0 })),
  getJudgingProgress: mock(() => Promise.resolve({ totalAssignments: 0, completedAssignments: 0, judges: [] })),
  getJudgeAssignments: mock(() => Promise.resolve([])),
  getAssignmentDetail: mock(() => Promise.resolve(null)),
  submitScores: mock(() => Promise.resolve({ success: false, error: "", code: "" })),
  saveNotes: mock(() => Promise.resolve(false)),
  getJudgingSetupStatus: mock(() => Promise.resolve({ hasCriteria: false, allCriteriaHaveLevels: true, judgeCount: 0, hasSubmissions: false, hasUnassignedSubmissions: false, isReady: false })),
}))

const mockFrom = mock()
const mockRpc = mock()

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

const { acceptJudgeInvitation } = await import("@/lib/services/judge-invitations")

const mockInvitation = {
  id: "inv1",
  hackathon_id: "h1",
  email: "judge@example.com",
  token: "test-token-123",
  invited_by_clerk_user_id: "organizer_123",
  status: "pending",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  accepted_by_clerk_user_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  hackathons: { name: "Test Hackathon", slug: "test-hackathon", status: "active" },
}

describe("Judge Invitations Integration - acceptJudgeInvitation", () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockRpc.mockClear()
    mockRpc.mockResolvedValue({
      data: [{
        success: true,
        error_code: null,
        hackathon_id: "h1",
        hackathon_slug: "test-hackathon",
        cancelled_invitation_ids: [],
      }],
      error: null,
    })
    mockAddJudge.mockClear()
    mockAddJudge.mockImplementation(() =>
      Promise.resolve({ success: true, participant: { id: "j1", clerkUserId: "user_123" } })
    )
  })

  it("accepts invitation and adds judge successfully", async () => {
    let isFirstCall = true
    mockFrom.mockImplementation(() => {
      if (isFirstCall) {
        isFirstCall = false
        return createIntegrationChainableMock({ data: mockInvitation, error: null })
      }
      return createIntegrationChainableMock({ data: { id: "inv1" }, error: null })
    })

    const result = await acceptJudgeInvitation("test-token-123", "user_123", "judge@example.com")

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.hackathonSlug).toBe("test-hackathon")
      expect(result.hackathonId).toBe("h1")
    }
    expect(mockRpc).toHaveBeenCalledWith("accept_judge_invitation_atomic", {
      p_token: "test-token-123",
      p_clerk_user_id: "user_123",
      p_email: "judge@example.com",
    })
  })

  it("claims a pending invitation when the user is already a judge", async () => {
    mockFrom.mockImplementation(() => {
      return createIntegrationChainableMock({ data: mockInvitation, error: null })
    })
    mockAddJudge.mockResolvedValue({
      success: false,
      error: "Already registered as a judge",
      code: "already_judge",
    })

    await expect(acceptJudgeInvitation(
      "test-token-123",
      "user_123",
      "  JUDGE@EXAMPLE.COM ",
    )).resolves.toEqual({
      success: true,
      hackathonId: "h1",
      hackathonSlug: "test-hackathon",
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it("returns email_mismatch error when user email does not match invitation", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({ data: mockInvitation, error: null })
    )

    const result = await acceptJudgeInvitation("test-token-123", "user_123", "different@example.com")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("email_mismatch")
    }
  })

  it("accepts invitation when matching email is in array of user emails", async () => {
    let isFirstCall = true
    mockFrom.mockImplementation(() => {
      if (isFirstCall) {
        isFirstCall = false
        return createIntegrationChainableMock({ data: mockInvitation, error: null })
      }
      return createIntegrationChainableMock({ data: { id: "inv1" }, error: null })
    })

    const result = await acceptJudgeInvitation(
      "test-token-123",
      "user_123",
      ["other@example.com", "judge@example.com", "work@example.com"]
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.hackathonSlug).toBe("test-hackathon")
    }
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it("returns email_mismatch when no email in array matches invitation", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({ data: mockInvitation, error: null })
    )

    const result = await acceptJudgeInvitation(
      "test-token-123",
      "user_123",
      ["other@example.com", "work@example.com"]
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("email_mismatch")
    }
  })

  it("matches email case-insensitively in array", async () => {
    let isFirstCall = true
    mockFrom.mockImplementation(() => {
      if (isFirstCall) {
        isFirstCall = false
        return createIntegrationChainableMock({ data: mockInvitation, error: null })
      }
      return createIntegrationChainableMock({ data: { id: "inv1" }, error: null })
    })

    const result = await acceptJudgeInvitation(
      "test-token-123",
      "user_123",
      ["JUDGE@EXAMPLE.COM"]
    )

    expect(result.success).toBe(true)
  })

  it("returns not_found error when invitation does not exist", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({ data: null, error: null })
    )

    const result = await acceptJudgeInvitation("invalid-token", "user_123", "judge@example.com")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("not_found")
    }
  })

  it("returns not_pending error when invitation was already accepted", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({
        data: { ...mockInvitation, status: "accepted" },
        error: null,
      })
    )

    const result = await acceptJudgeInvitation("test-token", "user_123", "judge@example.com")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("not_pending")
    }
  })

  it("returns expired error when invitation expiry date has passed", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({
        data: {
          ...mockInvitation,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
        error: null,
      })
    )

    const result = await acceptJudgeInvitation("test-token", "user_123", "judge@example.com")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("expired")
    }
  })

  it("succeeds when user is already a judge for this hackathon", async () => {
    mockAddJudge.mockImplementation(() =>
      Promise.resolve({ success: false, error: "Already a judge", code: "already_judge" })
    )

    let isFirstCall = true
    mockFrom.mockImplementation(() => {
      if (isFirstCall) {
        isFirstCall = false
        return createIntegrationChainableMock({ data: mockInvitation, error: null })
      }
      return createIntegrationChainableMock({ data: { id: "inv1" }, error: null })
    })

    const result = await acceptJudgeInvitation("test-token", "user_123", "judge@example.com")

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.hackathonSlug).toBe("test-hackathon")
    }
  })

  it("returns insert_failed error when judge creation fails", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        success: false,
        error_code: "insert_failed",
        hackathon_id: null,
        hackathon_slug: null,
        cancelled_invitation_ids: [],
      }],
      error: null,
    })

    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({ data: mockInvitation, error: null })
    )

    const result = await acceptJudgeInvitation("test-token", "user_123", "judge@example.com")

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe("insert_failed")
    }
  })
})
