import { Children, isValidElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockNotFound = mock(() => {
  throw Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_NOT_FOUND" })
})
const mockAuth = mock(() => Promise.resolve({ userId: null, orgId: null }))
const mockGetPublicHackathon = mock(() => Promise.resolve(null as Record<string, unknown> | null))
const mockIsOrganizer = mock(() => false)
const mockToClientDto = mock((hackathon: Record<string, unknown>) => ({
  id: hackathon.id,
  slug: hackathon.slug,
}))
const mockListScheduleItems = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockListAnnouncements = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockFilterAnnouncements = mock((items: Record<string, unknown>[]) => items)
const mockListChallenges = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockGetRegistrationInfo = mock(() => Promise.resolve({
  isRegistered: false,
  participantRole: null as string | null,
  participantCount: 0,
}))
const mockGetParticipantCount = mock(() => Promise.resolve(0))
const mockGetParticipantTeamInfo = mock(() => Promise.resolve(null as Record<string, unknown> | null))
const mockGetSubmissionForParticipant = mock(() => Promise.resolve(null as Record<string, unknown> | null))
const mockGetHackathonSubmissions = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockGetJudgeAssignments = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockListPerks = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockIsPerkReleased = mock(() => true)
const mockGetPublicResults = mock(() => Promise.resolve([] as Record<string, unknown>[]))
const mockPublicSubmitterName = mock((_hackathon: unknown, name: string) => `Public ${name}`)
const mockEventTools = mock(() => null)
const mockMentorTools = mock(() => null)
const mockPreview = mock(() => null)
const mockGetTenantByClerkOrgId = mock(() => Promise.resolve(null as Record<string, unknown> | null))

mock.module("next/navigation", () => ({ notFound: mockNotFound }))
mock.module("@clerk/nextjs/server", () => ({ auth: mockAuth }))
mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
  isPublicHackathonOrganizer: mockIsOrganizer,
  PUBLISHED_STATUSES: ["published", "registration_open", "active", "judging", "completed"],
  toPublicHackathonClientDto: mockToClientDto,
}))
mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems: mockListScheduleItems,
}))
mock.module("@/lib/services/announcements", () => ({
  listPublishedAnnouncements: mockListAnnouncements,
  filterAnnouncementsForViewer: mockFilterAnnouncements,
}))
mock.module("@/lib/services/challenges", () => ({ listChallenges: mockListChallenges }))
mock.module("@/lib/services/hackathons", () => ({
  getRegistrationInfo: mockGetRegistrationInfo,
  getParticipantCount: mockGetParticipantCount,
  getParticipantTeamInfo: mockGetParticipantTeamInfo,
}))
mock.module("@/lib/services/submissions", () => ({
  getSubmissionForParticipant: mockGetSubmissionForParticipant,
  getHackathonSubmissions: mockGetHackathonSubmissions,
  isSubmissionWindowOpen: mock(() => Promise.resolve(true)),
}))
mock.module("@/lib/services/judging", () => ({
  getJudgeAssignments: mockGetJudgeAssignments,
}))
mock.module("@/lib/services/perks", () => ({
  listPerks: mockListPerks,
  isPerkReleased: mockIsPerkReleased,
}))
mock.module("@/lib/services/results", () => ({
  getPublicResultsWithDetails: mockGetPublicResults,
}))
mock.module("@/lib/utils/submission-screenshots", () => ({
  getSubmissionScreenshotUrls: (submission: { screenshot_url?: string | null }) =>
    submission.screenshot_url ? [submission.screenshot_url] : [],
}))
mock.module("@/lib/utils/language", () => ({
  availableLocales: () => ["en", "fr"],
  normalizeLocale: (value: string | null) => value?.toLowerCase() ?? null,
  applyHackathonTranslation: (hackathon: Record<string, unknown>, locale: string) => ({
    ...hackathon,
    name: locale === "fr" ? "Événement traduit" : hackathon.name,
  }),
}))
mock.module("@/lib/utils/anonymous-judging", () => ({
  publicSubmitterName: mockPublicSubmitterName,
}))
mock.module("@/components/hackathon/event-webmcp-tools", () => ({
  EventWebMcpTools: mockEventTools,
}))
mock.module("@/components/hackathon/mentors/attendee-mentor-webmcp", () => ({
  AttendeeMentorWebMcp: mockMentorTools,
}))
mock.module("@/components/hackathon/preview/hackathon-preview-client", () => ({
  HackathonPreviewClient: mockPreview,
}))
mock.module("@/lib/services/tenants", () => ({
  getTenantByClerkOrgId: mockGetTenantByClerkOrgId,
}))

const { canRegisterNow, default: EventPage, generateMetadata } = await import(
  "@/app/(public)/e/[slug]/page"
)
const { default: EventOpenGraphImage } = await import(
  "@/app/(public)/e/[slug]/opengraph-image"
)

const baseHackathon = {
  id: "hackathon-1",
  tenant_id: "tenant-1",
  name: "Test Event",
  slug: "test-event",
  description: "Build something useful.",
  status: "published",
  starts_at: "2026-09-10T12:00:00.000Z",
  ends_at: "2026-09-11T21:00:00.000Z",
  registration_opens_at: "2026-08-01T12:00:00.000Z",
  registration_closes_at: "2026-09-09T12:00:00.000Z",
  allow_late_registration: false,
  location_type: "in_person",
  location_name: "Toronto",
  location_url: null,
  max_participants: 100,
  max_team_size: 4,
  anonymous_judging: false,
  challenge_released_at: null,
  results_published_at: null,
  perks_none: false,
  sponsors: [],
  organizer: {
    id: "tenant-1",
    name: "Test Org",
    slug: "test-org",
    clerk_org_id: "org-1",
    clerk_user_id: null,
  },
}

function pageProps(lang?: string) {
  return {
    params: Promise.resolve({ slug: "test-event" }),
    searchParams: Promise.resolve(lang ? { lang } : {}),
  }
}

function childFor(result: ReactElement, type: unknown): ReactElement {
  const child = Children.toArray(result.props.children).find(
    (candidate) => isValidElement(candidate) && candidate.type === type,
  )
  if (!isValidElement(child)) throw new Error("Expected page child was not rendered")
  return child
}

describe("public event server page", () => {
  beforeEach(() => {
    mockNotFound.mockClear()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ userId: null, orgId: null })
    mockGetPublicHackathon.mockReset()
    mockGetPublicHackathon.mockResolvedValue({ ...baseHackathon })
    mockIsOrganizer.mockReset()
    mockIsOrganizer.mockReturnValue(false)
    mockToClientDto.mockClear()
    mockListScheduleItems.mockReset()
    mockListScheduleItems.mockResolvedValue([])
    mockListAnnouncements.mockReset()
    mockListAnnouncements.mockResolvedValue([])
    mockFilterAnnouncements.mockReset()
    mockFilterAnnouncements.mockImplementation((items) => items)
    mockListChallenges.mockReset()
    mockListChallenges.mockResolvedValue([])
    mockGetRegistrationInfo.mockReset()
    mockGetRegistrationInfo.mockResolvedValue({
      isRegistered: false,
      participantRole: null,
      participantCount: 0,
    })
    mockGetParticipantCount.mockReset()
    mockGetParticipantCount.mockResolvedValue(0)
    mockGetParticipantTeamInfo.mockReset()
    mockGetParticipantTeamInfo.mockResolvedValue(null)
    mockGetSubmissionForParticipant.mockReset()
    mockGetSubmissionForParticipant.mockResolvedValue(null)
    mockGetHackathonSubmissions.mockReset()
    mockGetHackathonSubmissions.mockResolvedValue([])
    mockGetJudgeAssignments.mockReset()
    mockGetJudgeAssignments.mockResolvedValue([])
    mockListPerks.mockReset()
    mockListPerks.mockResolvedValue([])
    mockIsPerkReleased.mockReset()
    mockIsPerkReleased.mockReturnValue(true)
    mockGetPublicResults.mockReset()
    mockGetPublicResults.mockResolvedValue([])
    mockGetTenantByClerkOrgId.mockReset()
    mockGetTenantByClerkOrgId.mockResolvedValue(null)
  })

  it("builds translated metadata and handles a missing event", async () => {
    await expect(generateMetadata(pageProps("FR"))).resolves.toEqual({
      title: "Événement traduit | hackathon.new",
      description: "Build something useful.",
    })

    mockGetPublicHackathon.mockResolvedValueOnce(null)
    await expect(generateMetadata(pageProps())).resolves.toEqual({
      title: "Hackathon Not Found",
    })
  })

  it("renders the published event social image", async () => {
    mockGetPublicHackathon.mockResolvedValueOnce({
      ...baseHackathon,
      sponsors: [{ name: "Example Sponsor", tier: "gold" }],
    })

    const response = await EventOpenGraphImage({
      params: Promise.resolve({ slug: "test-event" }),
    })

    expect(response.headers.get("content-type")).toBe("image/png")
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1_000)
  })

  it("renders a privacy-safe signed-out event guide", async () => {
    mockListScheduleItems.mockResolvedValueOnce([
      { title: "Opening", starts_at: "2026-09-10T12:00:00Z", ends_at: null, location: "Hall" },
    ])
    mockListAnnouncements.mockResolvedValueOnce([
      { title: "Welcome", body: "Hello", priority: "normal" },
    ])
    mockListChallenges.mockResolvedValueOnce([
      { title: "Hidden", description: "Secret", resources: [{ url: "https://example.com" }] },
    ])
    mockGetHackathonSubmissions.mockResolvedValueOnce([
      {
        id: "submission-1",
        title: "Project",
        description: null,
        github_url: null,
        live_app_url: null,
        demo_video_url: null,
        screenshot_url: "https://example.com/screenshot.png",
        submitter_name: "Team Private",
        created_at: "2026-09-10T18:00:00Z",
      },
    ])

    const result = await EventPage(pageProps())
    const tools = childFor(result, mockEventTools)
    const preview = childFor(result, mockPreview)

    expect(mockGetPublicHackathon).toHaveBeenCalledWith("test-event", undefined)
    expect(tools.props.viewer).toEqual(expect.objectContaining({
      signedIn: false,
      registered: false,
      nextStep: "Sign in to register. You can prepare a project draft first.",
    }))
    expect(tools.props.guide.challenges).toEqual([])
    expect(preview.props.submissions[0]).toEqual(expect.objectContaining({
      submitter: "Public Team Private",
      screenshotUrls: ["https://example.com/screenshot.png"],
    }))
    expect(preview.props.challenges).toEqual([])
  })

  it("renders an unpublished organizer preview and keeps judge assignments anonymous", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user-1", orgId: "org-1" })
    mockGetPublicHackathon.mockResolvedValueOnce({
      ...baseHackathon,
      status: "draft",
      anonymous_judging: true,
    })
    mockIsOrganizer.mockReturnValueOnce(true)
    mockGetRegistrationInfo.mockResolvedValueOnce({
      isRegistered: true,
      participantRole: "judge",
      participantCount: 12,
    })
    mockGetParticipantCount.mockResolvedValueOnce(12)
    mockGetJudgeAssignments.mockResolvedValueOnce([
      { id: "assignment-1", teamName: "Private Team", isComplete: false },
    ])
    mockListChallenges.mockResolvedValueOnce([
      { title: "Organizer Challenge", description: null, resources: [] },
    ])

    const result = await EventPage(pageProps())
    const preview = childFor(result, mockPreview)
    const tools = childFor(result, mockEventTools)

    expect(renderToStaticMarkup(result)).toContain("This is a preview")
    expect(mockToClientDto).toHaveBeenCalledWith(expect.any(Object), {
      includeEditorSponsorData: true,
      includePrivateLocation: true,
    })
    expect(preview.props.hasJudgeAssignments).toBe(true)
    expect(preview.props.isRegistered).toBe(true)
    expect(preview.props.participantRole).toBe("judge")
    expect(tools.props.viewer).toEqual(expect.objectContaining({
      registered: true,
      role: "judge",
      participantCount: 12,
    }))
    expect(tools.props.guide.challenges).toHaveLength(1)
  })

  it("shows the waiting view to an unpublished judge", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "judge-1", orgId: null })
    mockGetPublicHackathon.mockResolvedValueOnce({ ...baseHackathon, status: "draft" })
    mockGetRegistrationInfo.mockResolvedValueOnce({
      isRegistered: true,
      participantRole: "judge",
      participantCount: 1,
    })

    const result = await EventPage(pageProps())

    expect(renderToStaticMarkup(result)).toContain("This event isn&#x27;t live yet")
    expect(mockGetHackathonSubmissions).not.toHaveBeenCalled()
  })

  it("hides an unpublished event from a non-judge", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user-1", orgId: null })
    mockGetPublicHackathon.mockResolvedValueOnce({ ...baseHackathon, status: "draft" })
    mockGetRegistrationInfo.mockResolvedValueOnce({
      isRegistered: true,
      participantRole: "participant",
      participantCount: 1,
    })

    await expect(EventPage(pageProps())).rejects.toThrow("NOT_FOUND")
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  it("loads participant team, project, perks, released challenges, and results", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "attendee-1", orgId: null })
    mockGetPublicHackathon.mockResolvedValueOnce({
      ...baseHackathon,
      status: "active",
      challenge_released_at: "2026-09-10T12:00:00Z",
      results_published_at: "2026-09-11T22:00:00Z",
    })
    mockGetRegistrationInfo.mockResolvedValueOnce({
      isRegistered: true,
      participantRole: "participant",
      participantCount: 25,
    })
    mockGetParticipantCount.mockResolvedValueOnce(25)
    mockGetParticipantTeamInfo.mockResolvedValueOnce({
      team: { name: "Builders", status: "forming" },
      isCaptain: true,
      members: [{ displayName: "Ava" }, { displayName: null }],
      pendingInvitations: [{ id: "invite-1" }],
    })
    mockGetSubmissionForParticipant.mockResolvedValueOnce({
      title: "Project Draft",
      status: "draft",
      github_url: "https://github.com/example/project",
      live_app_url: null,
      demo_video_url: null,
    })
    mockListChallenges.mockResolvedValueOnce([
      { title: "Open Challenge", description: "Build", resources: [] },
    ])
    mockListPerks.mockResolvedValueOnce([{ id: "perk-1" }, { id: "perk-2" }])
    mockIsPerkReleased.mockImplementation((perk) => perk.id === "perk-1")
    mockGetPublicResults.mockResolvedValueOnce([{
      rank: 1,
      submissionTitle: "Winning Project",
      submissionDescription: "A helpful project",
      submissionGithubUrl: null,
      submissionLiveAppUrl: null,
      submissionScreenshotUrl: null,
      teamName: "Builders",
      members: ["Ava"],
      weightedScore: 92,
      judgeCount: 3,
      prizes: [{ name: "First place", value: "$1,000" }],
    }])

    const result = await EventPage(pageProps())
    const tools = childFor(result, mockEventTools)
    const mentor = childFor(result, mockMentorTools)
    const preview = childFor(result, mockPreview)

    expect(tools.props).toEqual(expect.objectContaining({
      isFormingCaptain: true,
      isOrganizer: false,
    }))
    expect(tools.props.viewer.team).toEqual(expect.objectContaining({
      name: "Builders",
      memberNames: ["Ava", "Teammate"],
      pendingInviteCount: 1,
    }))
    expect(tools.props.viewer.project).toEqual(expect.objectContaining({
      title: "Project Draft",
      hasGithubUrl: true,
    }))
    expect(mentor.props).toEqual(expect.objectContaining({
      isParticipant: true,
      teamStatus: "forming",
    }))
    expect(preview.props.viewerPerks).toEqual([{ id: "perk-1" }])
    expect(preview.props.publicResults).toEqual([
      expect.objectContaining({ submissionTitle: "Winning Project" }),
    ])
    expect(tools.props.guide.results).toEqual([{
      rank: 1,
      projectTitle: "Winning Project",
      teamName: "Builders",
      weightedScore: 92,
      prizes: [{ name: "First place", value: "$1,000" }],
    }])
    expect(preview.props.challenges).toHaveLength(1)
  })

  it("shows the active organization as a sponsor and matches WebMCP state", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "sponsor-user", orgId: "org-sponsor" })
    mockGetTenantByClerkOrgId.mockResolvedValueOnce({
      id: "tenant-sponsor",
      name: "Breakfast Labs",
    })
    mockGetPublicHackathon.mockResolvedValueOnce({
      ...baseHackathon,
      sponsors: [{
        id: "sponsor-1",
        sponsor_tenant_id: "tenant-sponsor",
        name: "Breakfast Labs",
        tier: "gold",
      }],
    })

    const result = await EventPage(pageProps())
    const tools = childFor(result, mockEventTools)
    const preview = childFor(result, mockPreview)

    expect(renderToStaticMarkup(result)).toContain(
      "You&#x27;re viewing this event as Breakfast Labs, a gold sponsor.",
    )
    expect(tools.props.viewer).toMatchObject({
      role: "sponsor",
      sponsor: { organizationName: "Breakfast Labs", tier: "gold" },
    })
    expect(tools.props.canRegisterViewer).toBe(false)
    expect(preview.props.isSponsor).toBe(true)
  })

  it("keeps pending teams away from challenges and perks", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "attendee-1", orgId: null })
    mockGetPublicHackathon.mockResolvedValueOnce({
      ...baseHackathon,
      status: "active",
      challenge_released_at: "2026-09-10T12:00:00Z",
    })
    mockGetRegistrationInfo.mockResolvedValueOnce({
      isRegistered: true,
      participantRole: "participant",
      participantCount: 25,
    })
    mockGetParticipantCount.mockResolvedValueOnce(25)
    mockGetParticipantTeamInfo.mockResolvedValueOnce({
      team: { name: "Waiting", status: "pending_approval" },
      isCaptain: true,
      members: [],
      pendingInvitations: [],
    })
    mockListChallenges.mockResolvedValueOnce([
      { title: "Hidden Challenge", description: null, resources: [] },
    ])

    const result = await EventPage(pageProps())
    const preview = childFor(result, mockPreview)

    expect(preview.props.challenges).toEqual([])
    expect(preview.props.viewerPerks).toEqual([])
    expect(mockListPerks).not.toHaveBeenCalled()
  })

  it("covers registration status, time windows, capacity, and late signup edges", () => {
    const open = {
      status: "published",
      startsAt: "2026-09-10T12:00:00.000Z",
      endsAt: "2026-09-11T21:00:00.000Z",
      opensAt: null,
      closesAt: null,
      allowLate: false,
      atCapacity: false,
    }
    const now = Date.now()

    expect(canRegisterNow(open)).toBe(true)
    expect(canRegisterNow({ ...open, status: "draft" })).toBe(false)
    expect(canRegisterNow({ ...open, atCapacity: true })).toBe(false)
    expect(canRegisterNow({ ...open, endsAt: new Date(now - 1_000).toISOString() })).toBe(false)
    expect(canRegisterNow({ ...open, opensAt: new Date(now + 60_000).toISOString() })).toBe(false)
    expect(canRegisterNow({
      ...open,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 60_000).toISOString(),
      closesAt: new Date(now - 1_000).toISOString(),
      allowLate: true,
    })).toBe(true)
    expect(canRegisterNow({
      ...open,
      startsAt: new Date(now + 60_000).toISOString(),
      closesAt: new Date(now - 1_000).toISOString(),
      allowLate: true,
    })).toBe(false)
  })
})
