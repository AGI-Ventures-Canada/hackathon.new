import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockAuth = mock(() => Promise.resolve({ userId: null }))
const mockGetClerkUser = mock(() =>
  Promise.resolve({
    emailAddresses: [{
      emailAddress: "judge@example.com",
      verification: { status: "verified" },
    }],
  }),
)
const mockClerkClient = mock(() =>
  Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
    users: {
      getUser: mockGetClerkUser,
    },
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const mockGetJudgeInvitationByToken = mock(() => Promise.resolve(null))
const mockAcceptJudgeInvitation = mock(() =>
  Promise.resolve({ success: true, hackathonSlug: "test-hackathon", hackathonId: "h1" })
)
const mockDeclineJudgeInvitation = mock(() => Promise.resolve({ success: true }))
const mockCancelRemindersForEntity = mock(() => Promise.resolve())

mock.module("@/lib/services/judge-invitations", () => ({
  getJudgeInvitationByToken: mockGetJudgeInvitationByToken,
  acceptJudgeInvitation: mockAcceptJudgeInvitation,
  cancelJudgeInvitation: mock(() => Promise.resolve({ success: true })),
  declineJudgeInvitation: mockDeclineJudgeInvitation,
  createJudgeInvitation: mock(() => Promise.resolve({ success: false })),
  listJudgeInvitations: mock(() => Promise.resolve([])),
  remindJudgeInvitation: mock(() => Promise.resolve({ success: false })),
  markJudgeInvitationEmailed: mock(() => Promise.resolve()),
  sendPendingJudgeInvitationEmails: mock(() => Promise.resolve({ sent: 0, total: 0, failedEmails: [] })),
}))

const mockCurrentTermsHash = mock(() => Promise.resolve(null as string | null))
const mockRecordTermsAcceptance = mock(() => Promise.resolve())

mock.module("@/lib/services/hackathon-terms", () => ({
  currentTermsHash: mockCurrentTermsHash,
  recordTermsAcceptance: mockRecordTermsAcceptance,
}))

mock.module("@/lib/services/smart-reminders", () => ({
  cancelRemindersForEntity: mockCancelRemindersForEntity,
}))

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")

const app = new Elysia({ prefix: "/api" }).use(publicRoutes)

const mockInvitation = {
  id: "inv_1",
  hackathon_id: "h1",
  status: "pending",
  email: "judge@example.com",
  token: "valid-token",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  hackathon: {
    id: "h1",
    name: "Test Hackathon",
    slug: "test-hackathon",
    status: "active",
    require_terms_acceptance: false,
    terms_content: null,
  },
}

describe("POST /api/public/judge-invitations/:token/accept", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetJudgeInvitationByToken.mockReset()
    mockAcceptJudgeInvitation.mockReset()
    mockCurrentTermsHash.mockReset()
    mockRecordTermsAcceptance.mockReset()
    mockGetClerkUser.mockReset()
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [{
        emailAddress: "judge@example.com",
        verification: { status: "verified" },
      }],
    })
    mockCurrentTermsHash.mockResolvedValue(null)
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
      })
    )
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.code).toBe("not_authenticated")
  })

  it("accepts invitation when terms are not required", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockAcceptJudgeInvitation.mockResolvedValue({
      success: true,
      hackathonSlug: "test-hackathon",
      hackathonId: "h1",
    })

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRecordTermsAcceptance).not.toHaveBeenCalled()
  })

  it("returns 400 with terms_required when terms enabled and no hash provided", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
      })
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.code).toBe("terms_required")
    expect(mockAcceptJudgeInvitation).not.toHaveBeenCalled()
  })

  it("rejects a wrong signed-in email before recording event terms", async () => {
    mockAuth.mockResolvedValue({ userId: "wrong_user" })
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [{
        emailAddress: "someone-else@example.com",
        verification: { status: "verified" },
      }],
    })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_hash: "expected-hash" }),
      }),
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "email_mismatch" })
    expect(mockRecordTermsAcceptance).not.toHaveBeenCalled()
    expect(mockAcceptJudgeInvitation).not.toHaveBeenCalled()
  })

  it("returns 400 when terms hash does not match", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_hash: "stale-hash" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.code).toBe("terms_required")
    expect(mockAcceptJudgeInvitation).not.toHaveBeenCalled()
  })

  it("accepts and records acceptance when terms hash matches", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")
    mockAcceptJudgeInvitation.mockResolvedValue({
      success: true,
      hackathonSlug: "test-hackathon",
      hackathonId: "h1",
    })

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_hash: "expected-hash" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRecordTermsAcceptance).toHaveBeenCalledTimes(1)
  })

  it("keeps the recorded acceptance when invitation acceptance later fails", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")
    mockAcceptJudgeInvitation.mockResolvedValue({
      success: false,
      error: "Already a judge",
      code: "already_judge",
    })

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_hash: "expected-hash" }),
      })
    )

    expect(res.status).toBe(400)
    expect(mockRecordTermsAcceptance).toHaveBeenCalledWith("h1", "user_123", "expected-hash")
  })

  it("does not accept an invitation when terms acceptance cannot be recorded", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockCurrentTermsHash.mockResolvedValue("expected-hash")
    mockRecordTermsAcceptance.mockRejectedValue(new Error("database unavailable"))

    const res = await app.handle(
      new Request("http://localhost/api/public/judge-invitations/valid-token/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_hash: "expected-hash" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data).toMatchObject({ code: "terms_record_failed", retryable: true })
    expect(mockAcceptJudgeInvitation).not.toHaveBeenCalled()
  })
})

describe("POST /api/public/judge-invitations/:token/decline", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetClerkUser.mockReset()
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [{
        emailAddress: "judge@example.com",
        verification: { status: "verified" },
      }],
    })
    mockGetJudgeInvitationByToken.mockReset()
    mockGetJudgeInvitationByToken.mockResolvedValue(mockInvitation)
    mockDeclineJudgeInvitation.mockReset()
    mockDeclineJudgeInvitation.mockResolvedValue({ success: true })
    mockCancelRemindersForEntity.mockClear()
  })

  it("requires a signed-in recipient", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await app.handle(new Request(
      "http://localhost/api/public/judge-invitations/valid-token/decline",
      { method: "POST" },
    ))

    expect(res.status).toBe(401)
    expect(mockDeclineJudgeInvitation).not.toHaveBeenCalled()
  })

  it("rejects a signed-in user without the verified invited email", async () => {
    mockAuth.mockResolvedValue({ userId: "wrong_user" })
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [{
        emailAddress: "someone-else@example.com",
        verification: { status: "verified" },
      }],
    })

    const res = await app.handle(new Request(
      "http://localhost/api/public/judge-invitations/valid-token/decline",
      { method: "POST" },
    ))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "email_mismatch" })
    expect(mockDeclineJudgeInvitation).not.toHaveBeenCalled()
  })

  it("lets the verified recipient repeat a decline safely", async () => {
    mockAuth.mockResolvedValue({ userId: "judge_user" })
    mockGetJudgeInvitationByToken.mockResolvedValue({
      ...mockInvitation,
      status: "declined",
    })

    const request = () => app.handle(new Request(
      "http://localhost/api/public/judge-invitations/valid-token/decline",
      { method: "POST" },
    ))
    const first = await request()
    const second = await request()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(mockDeclineJudgeInvitation).toHaveBeenCalledTimes(2)
    expect(mockDeclineJudgeInvitation).toHaveBeenCalledWith("inv_1", "h1")
  })
})
