import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockRedirect = mock((url: string) => {
  throw Object.assign(new Error(`REDIRECT:${url}`), { digest: `NEXT_REDIRECT;replace;${url}` })
})
const mockNotFound = mock(() => {
  throw Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_NOT_FOUND" })
})

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
  useRouter: () => ({
    refresh: mock(() => {}),
    push: mock(() => {}),
    replace: mock(() => {}),
    back: mock(() => {}),
    forward: mock(() => {}),
    prefetch: mock(() => {}),
  }),
}))

const mockAuth = mock(() => Promise.resolve({ userId: null, orgId: null }))

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mock(() => Promise.resolve({
    organizations: { getOrganization: mock(() => Promise.resolve({ name: "Test Org" })) },
  })),
}))

const mockGetPublicHackathon = mock(() => Promise.resolve(null))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
  getPublicHackathonById: mock(() => Promise.resolve(null)),
  listPublicHackathons: mock(() => Promise.resolve({ hackathons: [], total: 0 })),
  getHackathonByIdForOrganizer: mock(() => Promise.resolve(null)),
  checkHackathonOrganizer: mock(() => Promise.resolve({ status: "not_found" })),
  getHackathonByIdWithFullData: mock(() => Promise.resolve(null)),
  getHackathonByIdWithAccess: mock(() => Promise.resolve(null)),
  updateHackathonSettings: mock(() => Promise.resolve(null)),
  PUBLISHED_STATUSES: ["published", "registration_open", "active", "judging", "completed"],
}))

const mockGetRegistrationInfo = mock(() => Promise.resolve({ participantRole: null }))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mock(() => Promise.resolve({ success: true })),
  getParticipantCount: mock(() => Promise.resolve(0)),
  isUserRegistered: mock(() => Promise.resolve(false)),
  getRegistrationInfo: mockGetRegistrationInfo,
}))

const mockGetJudgeAssignments = mock(() => Promise.resolve([]))

mock.module("@/lib/services/judging", () => ({
  addJudge: mock(() => Promise.resolve({ success: true })),
  listJudgingCriteria: mock(() => Promise.resolve([])),
  createJudgingCriteria: mock(() => Promise.resolve(null)),
  updateJudgingCriteria: mock(() => Promise.resolve(null)),
  deleteJudgingCriteria: mock(() => Promise.resolve(false)),
  listJudges: mock(() => Promise.resolve([])),
  removeJudge: mock(() => Promise.resolve({ success: false })),
  listJudgeAssignments: mock(() => Promise.resolve([])),
  assignJudgeToSubmission: mock(() => Promise.resolve({ success: false })),
  removeJudgeAssignment: mock(() => Promise.resolve(false)),
  autoAssignJudges: mock(() => Promise.resolve({ assignedCount: 0 })),
  getJudgingProgress: mock(() => Promise.resolve({ totalAssignments: 0, completedAssignments: 0, judges: [] })),
  getJudgeAssignments: mockGetJudgeAssignments,
  getAssignmentDetail: mock(() => Promise.resolve(null)),
  submitScores: mock(() => Promise.resolve({ success: true })),
  saveNotes: mock(() => Promise.resolve(true)),
  getJudgingSetupStatus: mock(() => Promise.resolve({ hasCriteria: false, allCriteriaHaveLevels: true, judgeCount: 0, hasSubmissions: false, hasUnassignedSubmissions: false, isReady: false })),
}))

const { default: JudgePage } = await import("@/app/(public)/e/[slug]/judge/page")

const mockHackathon = {
  id: "h1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  status: "judging",
  anonymous_judging: false,
  organizer: {
    id: "t1",
    name: "Test Org",
    slug: "test-org",
    clerk_org_id: "org_test",
    logo_url: null,
  },
}

const mockAssignment = {
  id: "a1",
  submissionId: "s1",
  submissionTitle: "Great Project",
  teamName: "Team Alpha",
  isComplete: false,
}

async function callPage(slug: string) {
  return JudgePage({ params: Promise.resolve({ slug }) })
}

function getRedirectUrl(error: unknown): string | null {
  if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
    return error.message.slice("REDIRECT:".length)
  }
  return null
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "NOT_FOUND"
}

describe("JudgePage", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockGetRegistrationInfo.mockReset()
    mockGetJudgeAssignments.mockReset()
    mockRedirect.mockClear()
    mockNotFound.mockClear()

    mockGetJudgeAssignments.mockImplementation(() => Promise.resolve([mockAssignment]))
  })

  it("redirects unauthenticated users to sign-in with a return URL", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null })

    let caught: unknown
    try {
      await callPage("test-hackathon")
    } catch (e) {
      caught = e
    }

    expect(getRedirectUrl(caught)).toBe(
      `/sign-in?redirect_url=${encodeURIComponent("/e/test-hackathon/judge")}`
    )
    expect(mockGetPublicHackathon).not.toHaveBeenCalled()
  })

  it("calls notFound when hackathon does not exist", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue(null)

    let caught: unknown
    try {
      await callPage("nonexistent")
    } catch (e) {
      caught = e
    }

    expect(isNotFound(caught)).toBe(true)
  })

  it("redirects organizers viewing their own hackathon to the event page", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: "org_test" })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "organizer" })

    let caught: unknown
    try {
      await callPage("test-hackathon")
    } catch (e) {
      caught = e
    }

    expect(getRedirectUrl(caught)).toBe("/e/test-hackathon")
  })

  it("redirects users who are not judges to the event page", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "participant" })

    let caught: unknown
    try {
      await callPage("test-hackathon")
    } catch (e) {
      caught = e
    }

    expect(getRedirectUrl(caught)).toBe("/e/test-hackathon")
  })

  it("redirects unregistered users to the event page", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: null })

    let caught: unknown
    try {
      await callPage("test-hackathon")
    } catch (e) {
      caught = e
    }

    expect(getRedirectUrl(caught)).toBe("/e/test-hackathon")
  })

  it("renders judging page for authenticated judges", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "judge" })
    mockGetJudgeAssignments.mockResolvedValue([mockAssignment])

    const result = await callPage("test-hackathon")

    expect(result).toBeTruthy()
    expect(mockGetJudgeAssignments).toHaveBeenCalledWith("h1", "user_123")
  })

  it("keeps the unpublished waiting view for an authenticated judge", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "draft" })
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "judge" })

    const result = await callPage("test-hackathon")

    expect(result).toBeTruthy()
    expect(mockGetPublicHackathon).toHaveBeenCalledWith("test-hackathon", {
      includeUnpublished: true,
    })
  })

  it("anonymizes team names when hackathon has anonymous_judging enabled", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: null })
    mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, anonymous_judging: true })
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "judge" })
    mockGetJudgeAssignments.mockResolvedValue([mockAssignment])

    await callPage("test-hackathon")

    expect(mockGetJudgeAssignments).toHaveBeenCalledWith("h1", "user_123")
  })

  it("allows judges from a different org than the organizer", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: "org_different" })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: "judge" })
    mockGetJudgeAssignments.mockResolvedValue([mockAssignment])

    const result = await callPage("test-hackathon")

    expect(result).toBeTruthy()
  })
})
