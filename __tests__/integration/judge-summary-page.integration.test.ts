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
}))

const mockAuth = mock(() => Promise.resolve({ userId: null, orgId: null }))

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

const mockGetPublicHackathon = mock(() => Promise.resolve(null))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
  PUBLISHED_STATUSES: ["published", "registration_open", "active", "judging", "completed"],
}))

const mockGetRegistrationInfo = mock(() => Promise.resolve({ participantRole: null }))

mock.module("@/lib/services/hackathons", () => ({
  getRegistrationInfo: mockGetRegistrationInfo,
}))

const { default: JudgeSummaryPage } = await import("@/app/(public)/e/[slug]/judge/summary/page")

async function callPage(slug: string) {
  return JudgeSummaryPage({ params: Promise.resolve({ slug }) })
}

function getRedirectUrl(error: unknown): string | null {
  if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
    return error.message.slice("REDIRECT:".length)
  }
  return null
}

describe("JudgeSummaryPage", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockGetRegistrationInfo.mockReset()
    mockRedirect.mockClear()
    mockNotFound.mockClear()
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
      `/sign-in?redirect_url=${encodeURIComponent("/e/test-hackathon/judge/summary")}`
    )
  })
})
